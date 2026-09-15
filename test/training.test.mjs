import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRecord, serialiseBackup, parseBackup } from '../public/data.js';
import { startWorkout, previousExerciseSets, markExerciseDone, reviseActiveWorkout, normaliseActiveWorkout } from '../public/presets.js';
import { normaliseTraining, mergeTraining, restRemaining, setSlots, workoutComparison } from '../public/training.js';
import { normaliseSyncState, mergeProfileStates } from '../public/sync.js';
import { normaliseServerState, getOrCreateProfile, openProfileDatabase, saveProfileState } from '../server/state.mjs';

const preset = { id: 'legs', name: 'Leg day', exercises: [{ id: 'squat', name: 'Squat', sets: [{}, {}, {}] }] };
const record = (id, index, weight, overrides = {}) => normaliseRecord({
  id, exercise: 'Squat', type: 'strength', weight, reps: 8, date: '2026-09-01T10:00:00Z',
  workoutId: 'last', presetId: 'legs', workoutExerciseId: 'squat', workoutSetIndex: index,
  workoutStartedAt: '2026-09-01T10:00:00Z', ...overrides,
});

test('previous values match individual slots in the most recent exercise session', () => {
  const records = [record('b', 1, 25), record('old', 0, 10, { workoutId: 'old', date: '2026-08-01T10:00:00Z' }), record('a', 0, 20), record('c', 2, 30)];
  const before = JSON.stringify(records);
  const active = startWorkout(preset, records);
  assert.deepEqual(active.exercises[0].previousSets.map((set) => set.weight), [20, 25, 30]);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(normaliseActiveWorkout(active), active);
});

test('legacy history and renamed exercises retain per-set history', () => {
  const records = [record('a', undefined, 20, { exercise: 'Old name' }), record('b', undefined, 25, { exercise: 'Old name', date: '2026-09-01T10:01:00Z' })];
  assert.deepEqual(previousExerciseSets(records.reverse(), 'New name', { id: 'squat', presetId: 'legs' }).map((set) => set.weight), [20, 25]);
  assert.equal(previousExerciseSets(records, 'Old name', {}, 'last').length, 0);
  assert.equal(previousExerciseSets(records.map((set) => ({ ...set, workoutId: '' })), 'Old name').length, 2);
});

test('out-of-order slots and undo never shift later sets or permit their template removal', () => {
  const active = startWorkout(preset, []);
  const third = record('third', 2, 30, { workoutId: active.id });
  const logged = markExerciseDone(active, third);
  assert.deepEqual(setSlots(logged.exercises[0], [third]).map((set) => set?.id || null), [null, null, 'third']);
  assert.throws(() => reviseActiveWorkout(logged, { ...preset, exercises: [{ ...preset.exercises[0], sets: [{}, {}] }] }, [third]), /logged/);
  const both = markExerciseDone(logged, record('first', 0, 20, { workoutId: active.id }));
  const undone = { ...both.exercises[0], completedSetIds: ['third'] };
  assert.deepEqual(setSlots(undone, [third]).map((set) => set?.id || null), [null, null, 'third']);
  const legacy = { ...undone, completedSetIds: ['third', 'legacy'] };
  assert.equal(setSlots(legacy, [third, record('legacy', undefined, 10)])[0].id, 'legacy');
});

test('rest deadlines survive background time and settings are bounded', () => {
  const rest = { workoutId: 'a', total: 120, endAt: 120000 };
  assert.equal(restRemaining(rest, 30000), 90);
  assert.equal(restRemaining(rest, 121000), 0);
  const state = normaliseTraining({ weightStep: -4, restSeconds: 100000, rest });
  assert.equal(state.weightStep, 2.5);
  assert.equal(state.restSeconds, 120);
  assert.equal(state.restEnabled, false);
  assert.equal(restRemaining(state.rest, 60000), 60);
  assert.equal(normaliseTraining(null).completion, null);
});

test('summary compares only the same preset and handles absent or zero prior volume', () => {
  const records = [record('a', 0, 20), record('b', 1, 25), record('c', 0, 30, { workoutId: 'now', workoutStartedAt: '2026-09-08T10:00:00Z' }), record('other', 0, 500, { presetId: 'other' })];
  const completion = { id: 'now', presetId: 'legs', name: 'Leg day', finishedAt: '2026-09-08T11:00:00Z' };
  const result = workoutComparison(records, completion);
  assert.equal(result.current.value, 240);
  assert.equal(result.previous.value, 360);
  assert.equal(result.delta, -120);
  assert.ok(Math.abs(result.percent + 33.33333) < .001);
  assert.deepEqual(result.series.map((point) => point.value), [360, 240]);
  assert.equal(workoutComparison([], completion).percent, null);
  assert.equal(workoutComparison([record('zero', 0, 0)], completion).percent, null);
});

test('settings, drafts, slots and timer round-trip through sync, backup and central SQLite', () => {
  const active = startWorkout(preset, []);
  const set = record('a', 2, 30, { workoutId: active.id });
  const training = normaliseTraining({ restEnabled: true, weightStep: 1.25, restSeconds: 90, rest: { workoutId: active.id, total: 90, endAt: Date.now() + 90000 }, drafts: { example: { weight: '12.5', reps: '9' } }, updatedAt: '2026-09-15T10:00:00Z' });
  const input = { records: [set], activeWorkout: markExerciseDone(active, set), presets: [preset], training };
  assert.deepEqual(normaliseSyncState(input).training, training);
  assert.deepEqual(normaliseServerState(input).training, training);
  const backup = serialiseBackup(input.records, input);
  assert.equal(parseBackup(backup)[0].workoutSetIndex, 2);
  assert.deepEqual(JSON.parse(backup).training, training);
  assert.deepEqual(mergeProfileStates({}, input).training, training);
  assert.deepEqual(mergeTraining({}, training), training);
  const db = openProfileDatabase(':memory:');
  const start = getOrCreateProfile(db, 'Tester');
  const saved = saveProfileState(db, 'Tester', input, start.revision);
  const again = saveProfileState(db, 'Tester', { feedback: [] }, saved.revision);
  assert.deepEqual(again.state.training, training);
  assert.equal(again.state.records[0].workoutSetIndex, 2);
  const { workoutSetIndex, ...olderRecord } = again.state.records[0];
  const fromOlderClient = saveProfileState(db, 'Tester', { records: [olderRecord] }, again.revision);
  assert.equal(fromOlderClient.state.records[0].workoutSetIndex, 2);
  assert.equal(getOrCreateProfile(db, 'Petra').state.records.length, 0);
  db.close();
});
