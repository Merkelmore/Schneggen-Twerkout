import { STORAGE_KEY, mergeRecords, normaliseRecord, sortRecords } from './data.js?v=8';
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  FIRST_VISIT_STORAGE_KEY,
  PRESET_STORAGE_KEY,
  normaliseActiveWorkout,
  normalisePresets,
} from './presets.js?v=8';
import { normaliseProfileName } from './profiles.js?v=8';

const SYNC_META_PREFIX = 'schneggen-server-sync-v1:';

const parse = (value, fallback) => {
  try {
    return JSON.parse(value ?? '') ?? fallback;
  } catch {
    return fallback;
  }
};

const safeGet = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch {
    // The offline cache remains best-effort when browser storage is unavailable.
  }
};

const safeRemove = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // A repeated removal is harmless.
  }
};

const mergePresets = (local, remote) => {
  const ids = new Set(local.map((preset) => preset.id));
  const names = new Set(local.map((preset) => preset.name.toLocaleLowerCase()));
  return [
    ...local,
    ...remote.filter((preset) => (
      !ids.has(preset.id) && !names.has(preset.name.toLocaleLowerCase())
    )),
  ];
};

export const normaliseSyncState = (input = {}) => {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    records: sortRecords((Array.isArray(value.records) ? value.records : [])
      .map(normaliseRecord)
      .filter(Boolean)),
    presets: normalisePresets(value.presets),
    activeWorkout: normaliseActiveWorkout(value.activeWorkout),
    firstVisitSeen: value.firstVisitSeen === true,
  };
};

export const readProfileState = (storage) => normaliseSyncState({
  records: parse(safeGet(storage, STORAGE_KEY), []),
  presets: parse(safeGet(storage, PRESET_STORAGE_KEY), []),
  activeWorkout: parse(safeGet(storage, ACTIVE_WORKOUT_STORAGE_KEY), null),
  firstVisitSeen: safeGet(storage, FIRST_VISIT_STORAGE_KEY) === 'seen',
});

export const writeProfileState = (storage, input) => {
  const state = normaliseSyncState(input);
  safeSet(storage, STORAGE_KEY, JSON.stringify(state.records));
  safeSet(storage, PRESET_STORAGE_KEY, JSON.stringify(state.presets));
  if (state.activeWorkout) {
    safeSet(storage, ACTIVE_WORKOUT_STORAGE_KEY, JSON.stringify(state.activeWorkout));
  } else {
    safeRemove(storage, ACTIVE_WORKOUT_STORAGE_KEY);
  }
  if (state.firstVisitSeen) safeSet(storage, FIRST_VISIT_STORAGE_KEY, 'seen');
  else safeRemove(storage, FIRST_VISIT_STORAGE_KEY);
  return state;
};

export const mergeProfileStates = (localInput, remoteInput) => {
  const local = normaliseSyncState(localInput);
  const remote = normaliseSyncState(remoteInput);
  return {
    records: mergeRecords(local.records, remote.records),
    presets: mergePresets(local.presets, remote.presets),
    activeWorkout: local.activeWorkout || remote.activeWorkout,
    firstVisitSeen: local.firstVisitSeen || remote.firstVisitSeen,
  };
};

const requestProfile = async (fetchImpl, name) => {
  const response = await fetchImpl('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('Profile sync failed.');
  return response.json();
};

const saveRemoteState = async (fetchImpl, name, state, keepalive = false) => {
  const response = await fetchImpl(`/api/profiles/${encodeURIComponent(name)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
    keepalive,
  });
  if (!response.ok) throw new Error('Profile sync failed.');
  return response.json();
};

export async function prepareProfileStorage({
  profile,
  storage,
  metaStorage = globalThis.localStorage,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  schedule = globalThis.setTimeout?.bind(globalThis),
  cancelSchedule = globalThis.clearTimeout?.bind(globalThis),
  eventTarget = globalThis,
  syncDelay = 250,
}) {
  const name = normaliseProfileName(profile?.name);
  if (!name || !storage) throw new TypeError('A valid profile and storage are required.');
  const metaKey = `${SYNC_META_PREFIX}${encodeURIComponent(name.toLocaleLowerCase())}`;
  let meta = parse(safeGet(metaStorage, metaKey), null);
  let generation = 0;
  let timer = null;
  let syncing = null;

  const saveMeta = (dirty) => {
    meta = { initialised: true, dirty: dirty === true };
    safeSet(metaStorage, metaKey, JSON.stringify(meta));
  };

  if (fetchImpl) {
    try {
      const remote = await requestProfile(fetchImpl, name);
      if (!meta?.initialised) {
        const merged = writeProfileState(storage, mergeProfileStates(readProfileState(storage), remote.state));
        await saveRemoteState(fetchImpl, name, merged);
        saveMeta(false);
      } else if (meta.dirty) {
        await saveRemoteState(fetchImpl, name, readProfileState(storage));
        saveMeta(false);
      } else {
        writeProfileState(storage, remote.state);
        saveMeta(false);
      }
    } catch {
      // Existing local data keeps the app usable offline; the next write retries sync.
    }
  }

  const syncNow = async ({ keepalive = false } = {}) => {
    if (!fetchImpl || !meta?.dirty) return false;
    if (syncing) return syncing;
    const savingGeneration = generation;
    syncing = saveRemoteState(fetchImpl, name, readProfileState(storage), keepalive)
      .then(() => {
        if (generation === savingGeneration) saveMeta(false);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        syncing = null;
        if (meta?.dirty && generation !== savingGeneration) queueSync();
      });
    return syncing;
  };

  const queueSync = () => {
    generation += 1;
    saveMeta(true);
    if (!schedule) return;
    if (timer !== null && cancelSchedule) cancelSchedule(timer);
    timer = schedule(() => {
      timer = null;
      syncNow();
    }, syncDelay);
  };

  const syncedStorage = Object.freeze({
    getItem: (key) => storage.getItem(key),
    setItem(key, value) {
      storage.setItem(key, value);
      queueSync();
    },
    removeItem(key) {
      storage.removeItem(key);
      queueSync();
    },
    syncNow,
  });

  eventTarget?.addEventListener?.('pagehide', () => syncNow({ keepalive: true }));
  return syncedStorage;
}
