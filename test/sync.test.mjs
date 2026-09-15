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
  writeProfileState(storage, {
    records: [record('one', 60)],
    presets: [],
    workoutPlan: {
      mode: 'rotation',
      rotation: ['upper', 'legs'],
      updatedAt: '2026-09-04T08:00:00.000Z',
    },
    firstVisitSeen: true,
  });
  const state = readProfileState(storage);
  assert.equal(state.records[0].id, 'one');
  assert.deepEqual(state.workoutPlan.rotation, ['upper', 'legs']);
  assert.equal(state.firstVisitSeen, true);
});

test('profile merge keeps the newest workout plan', () => {
  const merged = mergeProfileStates(
    { workoutPlan: { weekdays: { 1: 'upper' }, updatedAt: '2026-09-01T08:00:00.000Z' } },
    { workoutPlan: { mode: 'rotation', rotation: ['legs'], updatedAt: '2026-09-04T08:00:00.000Z' } },
  );
  assert.equal(merged.workoutPlan.mode, 'rotation');
  assert.deepEqual(merged.workoutPlan.rotation, ['legs']);
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

test('stale writes keep the local copy and expose a conflict instead of replacing remote history', async () => {
  const storage = memoryStorage();
  const statuses = [];
  let revision = 1;
  let remote = { records: [record('original', 20)] };
  const fetchImpl = async (url, options) => {
    if (url === '/api/profiles') return { ok: true, json: async () => ({ state: remote, revision }) };
    const body = JSON.parse(options.body);
    if (body.expectedRevision !== revision) return { ok: false, status: 409 };
    remote = body.state; revision += 1;
    return { ok: true, json: async () => ({ revision }) };
  };
  const synced = await prepareProfileStorage({ profile: { name: 'Tester' }, storage, metaStorage: memoryStorage(), fetchImpl, schedule: null, eventTarget: null, onStatus: (status) => statuses.push(status) });
  remote.records.push(record('other-device', 40)); revision += 1;
  synced.setItem(STORAGE_KEY, JSON.stringify([record('original', 20), record('local', 30)]));
  assert.equal(await synced.syncNow(), false);
  assert.equal(statuses.at(-1), 'conflict');
  assert.deepEqual(remote.records.map(({ id }) => id), ['original', 'other-device']);
  assert.equal(readProfileState(storage).records.length, 2);
});

test('a dirty offline cache combines remote additions on reload', async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify([record('offline', 10)]) });
  const metaStorage = memoryStorage({ 'schneggen-server-sync-v1:tester': JSON.stringify({ initialised: true, dirty: true, revision: 1 }) });
  let saved;
  const fetchImpl = async (url, options) => {
    if (url === '/api/profiles') return { ok: true, json: async () => ({ revision: 2, state: { records: [record('remote', 30)] } }) };
    saved = JSON.parse(options.body);
    return { ok: true, json: async () => ({ revision: 3 }) };
  };
  await prepareProfileStorage({ profile: { name: 'Tester' }, storage, metaStorage, fetchImpl, schedule: null, eventTarget: null });
  assert.equal(saved.expectedRevision, 2);
  assert.deepEqual(new Set(saved.state.records.map(({ id }) => id)), new Set(['offline', 'remote']));
});
