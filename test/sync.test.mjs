import assert from 'node:assert/strict';
import test from 'node:test';

import { STORAGE_KEY } from '../public/data.js';
import {
  mergeProfileStates,
  prepareProfileStorage,
  readProfileState,
  writeProfileState,
} from '../public/sync.js';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
};

const record = (id, weight) => ({
  id,
  exercise: 'Squat',
  type: 'strength',
  date: '2026-08-17T12:00:00.000Z',
  weight,
  reps: 5,
  notes: '',
  createdAt: '2026-08-17T12:00:00.000Z',
});

test('first server sync merges remote history without replacing local data', () => {
  const merged = mergeProfileStates(
    { records: [record('same', 80)], presets: [{ id: 'local', name: 'Local', exercises: ['Squat'] }] },
    { records: [record('same', 90), record('remote', 70)], presets: [{ id: 'remote', name: 'Remote', exercises: ['Plank'] }] },
  );
  assert.equal(merged.records.length, 2);
  assert.equal(merged.records.find(({ id }) => id === 'same').weight, 80);
  assert.deepEqual(merged.presets.map(({ name }) => name), ['Local', 'Remote']);
});

test('profile state round-trips through browser storage', () => {
  const storage = memoryStorage();
  writeProfileState(storage, { records: [record('one', 60)], presets: [], firstVisitSeen: true });
  const state = readProfileState(storage);
  assert.equal(state.records[0].id, 'one');
  assert.equal(state.firstVisitSeen, true);
});

test('synced storage hydrates once and pushes later writes', async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify([record('local', 80)]) });
  const metaStorage = memoryStorage();
  const writes = [];
  const fetchImpl = async (url, options) => {
    if (url === '/api/profiles') {
      return {
        ok: true,
        json: async () => ({ state: { records: [record('remote', 70)], presets: [] } }),
      };
    }
    writes.push(JSON.parse(options.body).state);
    return { ok: true, json: async () => ({}) };
  };

  const synced = await prepareProfileStorage({
    profile: { name: 'Petra' },
    storage,
    metaStorage,
    fetchImpl,
    schedule: null,
    eventTarget: null,
  });
  assert.equal(readProfileState(storage).records.length, 2);
  assert.equal(writes.length, 1);

  synced.setItem(STORAGE_KEY, JSON.stringify([record('new', 90)]));
  assert.equal(await synced.syncNow(), true);
  assert.equal(writes.at(-1).records[0].id, 'new');
});
