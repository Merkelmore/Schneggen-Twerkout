export const PROFILE_STORAGE_KEY = 'schneggen-profiles-v1';
export const ACTIVE_PROFILE_STORAGE_KEY = 'schneggen-active-profile-v1';
export const PETRA_PROFILE_ID = 'petra';

const PETRA_PROFILE = Object.freeze({
  id: PETRA_PROFILE_ID,
  name: 'Petra',
  createdAt: '2026-08-17T00:00:00.000Z',
});

const profileNameKey = (value) => normaliseProfileName(value).toLocaleLowerCase();

const makeId = () => globalThis.crypto?.randomUUID?.()
  ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
    return true;
  } catch {
    return false;
  }
};

const safeRemove = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // A repeated profile choice is harmless when storage is unavailable.
  }
};

export const normaliseProfileName = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 40);

export const normaliseProfile = (input = {}) => {
  const name = normaliseProfileName(input.name);
  const id = String(input.id ?? '').trim().slice(0, 80);
  if (!name || !id) return null;

  const createdAt = new Date(input.createdAt);
  return {
    id,
    name,
    createdAt: Number.isNaN(createdAt.getTime())
      ? new Date().toISOString()
      : createdAt.toISOString(),
  };
};

export const normaliseProfiles = (input) => {
  const profiles = [];
  const names = new Set();

  (Array.isArray(input) ? input : []).forEach((item) => {
    const profile = normaliseProfile(item);
    const key = profileNameKey(profile?.name);
    if (!profile || names.has(key)) return;
    names.add(key);
    profiles.push(profile);
  });

  if (!names.has(profileNameKey(PETRA_PROFILE.name))) {
    profiles.unshift({ ...PETRA_PROFILE });
  }

  return profiles;
};

export const profileStorageKey = (baseKey, profileId) => (
  `${String(baseKey)}:profile:${encodeURIComponent(String(profileId))}`
);

export const createScopedProfileStorage = (storage, profile) => {
  const cleanProfile = normaliseProfile(profile);
  if (!cleanProfile) throw new TypeError('A valid profile is required.');
  const mirrorsLegacy = cleanProfile.id === PETRA_PROFILE_ID;

  return Object.freeze({
    getItem(baseKey) {
      const scopedKey = profileStorageKey(baseKey, cleanProfile.id);
      const scopedValue = storage.getItem(scopedKey);
      if (scopedValue !== null || !mirrorsLegacy) return scopedValue;

      const legacyValue = storage.getItem(baseKey);
      if (legacyValue !== null) storage.setItem(scopedKey, legacyValue);
      return legacyValue;
    },
    setItem(baseKey, value) {
      const text = String(value);
      storage.setItem(profileStorageKey(baseKey, cleanProfile.id), text);
      if (mirrorsLegacy) storage.setItem(baseKey, text);
    },
    removeItem(baseKey) {
      storage.removeItem(profileStorageKey(baseKey, cleanProfile.id));
      if (mirrorsLegacy) storage.removeItem(baseKey);
    },
  });
};

export const createProfileManager = (storage = globalThis.localStorage) => {
  let profiles;
  try {
    profiles = normaliseProfiles(JSON.parse(safeGet(storage, PROFILE_STORAGE_KEY) || '[]'));
  } catch {
    profiles = normaliseProfiles([]);
  }
  safeSet(storage, PROFILE_STORAGE_KEY, JSON.stringify(profiles));

  const saveProfiles = () => safeSet(storage, PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  const findByName = (name) => {
    const key = profileNameKey(name);
    return profiles.find((profile) => profileNameKey(profile.name) === key) || null;
  };

  return Object.freeze({
    getProfiles: () => profiles.map((profile) => ({ ...profile })),
    getActiveProfile() {
      const activeId = safeGet(storage, ACTIVE_PROFILE_STORAGE_KEY);
      const active = profiles.find((profile) => profile.id === activeId);
      return active ? { ...active } : null;
    },
    signIn(name) {
      const cleanName = normaliseProfileName(name);
      if (!cleanName) throw new TypeError('Enter a name.');

      let profile = findByName(cleanName);
      const created = !profile;
      if (!profile) {
        profile = {
          id: `profile-${makeId()}`.slice(0, 80),
          name: cleanName,
          createdAt: new Date().toISOString(),
        };
        profiles = [...profiles, profile];
        if (!saveProfiles()) throw new Error('This browser could not save the profile.');
      }

      if (!safeSet(storage, ACTIVE_PROFILE_STORAGE_KEY, profile.id)) {
        throw new Error('This browser could not remember the profile.');
      }
      return { profile: { ...profile }, created };
    },
    signOut() {
      safeRemove(storage, ACTIVE_PROFILE_STORAGE_KEY);
    },
    storageFor(profile) {
      return createScopedProfileStorage(storage, profile);
    },
  });
};
