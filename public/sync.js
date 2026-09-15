import { STORAGE_KEY, mergeRecords, normaliseRecord, sortRecords } from './data.js?v=11';
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  FIRST_VISIT_STORAGE_KEY,
  PRESET_STORAGE_KEY,
  normaliseActiveWorkout,
  normalisePresets,
} from './presets.js?v=11';
import {
  WORKOUT_PLAN_STORAGE_KEY,
  mergeWorkoutPlans,
  normaliseWorkoutPlan,
} from './plans.js?v=11';
import { normaliseProfileName } from './profiles.js?v=11';
import { FEEDBACK_STORAGE_KEY, normaliseFeedback, mergeFeedback } from './feedback.js?v=11';

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
    workoutPlan: normaliseWorkoutPlan(value.workoutPlan),
    activeWorkout: normaliseActiveWorkout(value.activeWorkout),
    firstVisitSeen: value.firstVisitSeen === true,
    feedback: normaliseFeedback(value.feedback),
  };
};

export const readProfileState = (storage) => normaliseSyncState({
  records: parse(safeGet(storage, STORAGE_KEY), []),
  presets: parse(safeGet(storage, PRESET_STORAGE_KEY), []),
  workoutPlan: parse(safeGet(storage, WORKOUT_PLAN_STORAGE_KEY), null),
  activeWorkout: parse(safeGet(storage, ACTIVE_WORKOUT_STORAGE_KEY), null),
  firstVisitSeen: safeGet(storage, FIRST_VISIT_STORAGE_KEY) === 'seen',
  feedback: parse(safeGet(storage, FEEDBACK_STORAGE_KEY), []),
});

export const writeProfileState = (storage, input) => {
  const state = normaliseSyncState(input);
  safeSet(storage, STORAGE_KEY, JSON.stringify(state.records));
  safeSet(storage, PRESET_STORAGE_KEY, JSON.stringify(state.presets));
  safeSet(storage, WORKOUT_PLAN_STORAGE_KEY, JSON.stringify(state.workoutPlan));
  safeSet(storage, FEEDBACK_STORAGE_KEY, JSON.stringify(state.feedback));
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
    workoutPlan: mergeWorkoutPlans(local.workoutPlan, remote.workoutPlan),
    activeWorkout: local.activeWorkout || remote.activeWorkout,
    firstVisitSeen: local.firstVisitSeen || remote.firstVisitSeen,
    feedback: mergeFeedback(remote.feedback, local.feedback),
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

const saveRemoteState = async (fetchImpl, name, state, expectedRevision, keepalive = false) => {
  const response = await fetchImpl(`/api/profiles/${encodeURIComponent(name)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, expectedRevision }),
    keepalive,
  });
  if (!response.ok) {
    const error = new Error('Profile sync failed.');
    error.conflict = response.status === 409;
    throw error;
  }
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
  onStatus = () => {},
}) {
  const name = normaliseProfileName(profile?.name);
  if (!name || !storage) throw new TypeError('A valid profile and storage are required.');
  const metaKey = `${SYNC_META_PREFIX}${encodeURIComponent(name.toLocaleLowerCase())}`;
  let meta = parse(safeGet(metaStorage, metaKey), null);
  let generation = 0;
  let timer = null;
  let syncing = null;
  let revision;
  let conflict = false;

  const saveMeta = (dirty) => {
    meta = { initialised: true, dirty: dirty === true, revision };
    safeSet(metaStorage, metaKey, JSON.stringify(meta));
  };

  if (fetchImpl) {
    try {
      const remote = await requestProfile(fetchImpl, name);
      revision = remote.revision;
      if (!meta?.initialised) {
        const merged = writeProfileState(storage, mergeProfileStates(readProfileState(storage), remote.state));
        saveMeta(true);
        const saved = await saveRemoteState(fetchImpl, name, merged, revision);
        revision = saved.revision;
        saveMeta(false);
      } else if (meta.dirty) {
        // A stale offline snapshot must never erase another device's additions.
        const merged = writeProfileState(storage, mergeProfileStates(readProfileState(storage), remote.state));
        const saved = await saveRemoteState(fetchImpl, name, merged, revision);
        revision = saved.revision;
        saveMeta(false);
      } else {
        writeProfileState(storage, remote.state);
        saveMeta(false);
      }
      onStatus('saved');
    } catch (error) {
      revision = undefined;
      conflict = error.conflict === true;
      onStatus(conflict ? 'conflict' : 'offline');
      // Existing local data keeps the app usable offline; the next write retries sync.
    }
  }

  const syncNow = async ({ keepalive = false } = {}) => {
    if (!fetchImpl || !meta?.dirty || conflict) return false;
    if (revision === undefined) {
      // Reconnect without blindly replacing data written while this device was offline.
      try {
        const remote = await requestProfile(fetchImpl, name);
        if (meta?.revision !== remote.revision) {
          conflict = true; onStatus('conflict'); return false;
        }
        revision = remote.revision;
      } catch { onStatus('offline'); return false; }
    }
    if (syncing) return syncing;
    const savingGeneration = generation;
    onStatus('saving');
    syncing = saveRemoteState(fetchImpl, name, readProfileState(storage), revision, keepalive)
      .then((saved) => {
        revision = saved.revision;
        if (generation === savingGeneration) saveMeta(false);
        onStatus('saved');
        return true;
      })
      .catch((error) => {
        conflict = error.conflict === true;
        onStatus(conflict ? 'conflict' : 'offline');
        return false;
      })
      .finally(() => {
        syncing = null;
        if (meta?.dirty && generation !== savingGeneration) queueSync();
      });
    return syncing;
  };

  const queueSync = () => {
    generation += 1;
    saveMeta(true);
    onStatus(conflict ? 'conflict' : 'saving');
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
  eventTarget?.addEventListener?.('online', () => syncNow());
  eventTarget?.addEventListener?.('visibilitychange', () => {
    if (globalThis.document?.visibilityState === 'visible') syncNow();
  });
  return syncedStorage;
}
