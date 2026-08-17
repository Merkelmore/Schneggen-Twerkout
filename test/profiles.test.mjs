import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PETRA_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createProfileManager,
  createScopedProfileStorage,
  normaliseProfileName,
  profileStorageKey,
} from '../public/profiles.js';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
};

test('seeds the saved Petra profile without signing in automatically', () => {
  const storage = memoryStorage();
  const manager = createProfileManager(storage);
  assert.deepEqual(manager.getProfiles().map(({ id, name }) => ({ id, name })), [
    { id: PETRA_PROFILE_ID, name: 'Petra' },
  ]);
  assert.equal(manager.getActiveProfile(), null);
  assert.equal(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY))[0].name, 'Petra');
});

test('normalises names and reuses an existing profile case-insensitively', () => {
  const storage = memoryStorage();
  const manager = createProfileManager(storage);
  assert.equal(normaliseProfileName('  Petra   '), 'Petra');
  const result = manager.signIn('  pETRa  ');
  assert.equal(result.created, false);
  assert.equal(result.profile.id, PETRA_PROFILE_ID);
  assert.equal(manager.getProfiles().length, 1);
});

test('creates and remembers a unique local profile', () => {
  const storage = memoryStorage();
  const manager = createProfileManager(storage);
  const result = manager.signIn('Leon');
  assert.equal(result.created, true);
  assert.equal(result.profile.name, 'Leon');
  assert.equal(manager.getActiveProfile().id, result.profile.id);
  assert.equal(storage.getItem(ACTIVE_PROFILE_STORAGE_KEY), result.profile.id);
});

test('keeps profile workout storage separate', () => {
  const storage = memoryStorage();
  const petra = createScopedProfileStorage(storage, {
    id: PETRA_PROFILE_ID,
    name: 'Petra',
    createdAt: '2026-08-17T00:00:00.000Z',
  });
  const leon = createScopedProfileStorage(storage, {
    id: 'leon',
    name: 'Leon',
    createdAt: '2026-08-17T00:00:00.000Z',
  });
  petra.setItem('sets', 'petra-data');
  leon.setItem('sets', 'leon-data');
  assert.equal(petra.getItem('sets'), 'petra-data');
  assert.equal(leon.getItem('sets'), 'leon-data');
});

test('migrates legacy workout data into Petra and keeps rollback data current', () => {
  const storage = memoryStorage({ sets: 'old-data' });
  const petra = createScopedProfileStorage(storage, {
    id: PETRA_PROFILE_ID,
    name: 'Petra',
    createdAt: '2026-08-17T00:00:00.000Z',
  });
  assert.equal(petra.getItem('sets'), 'old-data');
  assert.equal(storage.getItem(profileStorageKey('sets', PETRA_PROFILE_ID)), 'old-data');
  petra.setItem('sets', 'new-data');
  assert.equal(storage.getItem('sets'), 'new-data');
  assert.equal(storage.getItem(profileStorageKey('sets', PETRA_PROFILE_ID)), 'new-data');
});

test('signing out forgets only the active session', () => {
  const storage = memoryStorage();
  const manager = createProfileManager(storage);
  manager.signIn('Petra');
  manager.signOut();
  assert.equal(manager.getActiveProfile(), null);
  assert.equal(manager.getProfiles()[0].name, 'Petra');
});

test('rejects an empty profile name', () => {
  const manager = createProfileManager(memoryStorage());
  assert.throws(() => manager.signIn('   '), /enter a name/i);
});
