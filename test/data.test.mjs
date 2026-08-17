import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateSeries,
  calculateStreak,
  mergeRecords,
  metricValue,
  normaliseRecord,
  parseBackup,
  presetVolumeSeries,
  serialiseBackup,
  todaySummary,
  weeklyVolumeSeries,
} from '../public/data.js';

const set = (overrides = {}) => normaliseRecord({
  id: overrides.id || 'set-1',
  exercise: 'Hip thrust',
  type: 'strength',
  date: '2026-08-14T12:00:00.000Z',
  weight: 80,
  reps: 8,
  createdAt: '2026-08-14T12:00:00.000Z',
  ...overrides,
});

test('normalises a strength set and calculates volume', () => {
  const record = set({ exercise: '  Hip   thrust  ', weight: '82.5', reps: '10' });
  assert.equal(record.exercise, 'Hip thrust');
  assert.equal(record.weight, 82.5);
  assert.equal(record.reps, 10);
  assert.equal(metricValue(record, 'volume'), 825);
});

test('rejects incomplete set data', () => {
  assert.equal(normaliseRecord({ exercise: '', date: new Date(), reps: 8, weight: 20 }), null);
  assert.equal(normaliseRecord({ exercise: 'Squat', type: 'strength', date: new Date(), reps: 8 }), null);
  assert.equal(normaliseRecord({ exercise: 'Plank', type: 'duration', date: new Date() }), null);
});

test('progress series keeps the best result per day', () => {
  const records = [
    set({ id: 'a', date: '2026-08-12T10:00:00Z', weight: 70 }),
    set({ id: 'b', date: '2026-08-12T14:00:00Z', weight: 75 }),
    set({ id: 'c', date: '2026-08-14T10:00:00Z', weight: 80 }),
    set({ id: 'd', exercise: 'Squat', date: '2026-08-14T10:00:00Z', weight: 90 }),
  ];
  assert.deepEqual(
    aggregateSeries(records, 'Hip thrust', 'weight').map(({ value }) => value),
    [75, 80],
  );
});

test('streak allows today or yesterday as the latest workout', () => {
  const records = [
    set({ id: 'a', date: '2026-08-13T12:00:00Z' }),
    set({ id: 'b', date: '2026-08-12T12:00:00Z' }),
    set({ id: 'c', date: '2026-08-11T12:00:00Z' }),
  ];
  assert.equal(calculateStreak(records, new Date('2026-08-14T12:00:00Z')), 3);
  assert.equal(calculateStreak(records, new Date('2026-08-16T12:00:00Z')), 0);
});

test('today summary counts sets, exercises, and strength volume', () => {
  const records = [
    set({ id: 'a', weight: 80, reps: 8 }),
    set({ id: 'b', exercise: 'Squat', weight: 60, reps: 5 }),
    set({ id: 'c', date: '2026-08-13T12:00:00Z' }),
  ];
  assert.deepEqual(todaySummary(records, new Date('2026-08-14T14:00:00Z')), {
    sets: 2,
    exercises: 2,
    volume: 940,
  });
});

test('backup export and import round-trip records and presets', () => {
  const original = [set({ id: 'backup-set', notes: 'steady' })];
  const presets = [{ id: 'lower', name: 'Lower body', exercises: ['Squat'] }];
  const backup = serialiseBackup(original, { presets });
  const restored = parseBackup(backup);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 'backup-set');
  assert.equal(restored[0].notes, 'steady');
  assert.deepEqual(JSON.parse(backup).presets, presets);
});

test('backup parser rejects unrelated JSON', () => {
  assert.throws(() => parseBackup('{"hello":"world"}'), /no workout records/i);
});

test('merge import keeps existing records and skips duplicate ids', () => {
  const current = [set({ id: 'same', weight: 80 })];
  const imported = [
    set({ id: 'same', weight: 90 }),
    set({ id: 'new', exercise: 'Squat', weight: 60 }),
  ];
  const merged = mergeRecords(current, imported);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(({ id }) => id === 'same').weight, 80);
});
test('repairs an invalid imported creation timestamp', () => {
  const record = set({ createdAt: 'not-a-date' });
  assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('weekly volume totals compare all weighted sets by Monday-starting week', () => {
  const records = [
    set({ id: 'week-1', date: '2026-08-10T12:00:00Z', weight: 50, reps: 20 }),
    set({ id: 'week-2', date: '2026-08-17T12:00:00Z', weight: 55, reps: 20 }),
    set({ id: 'ignored', type: 'reps', date: '2026-08-17T13:00:00Z', weight: null, reps: 10 }),
  ];
  assert.deepEqual(weeklyVolumeSeries(records).map(({ day, value }) => ({ day, value })), [
    { day: '2026-08-10', value: 1000 },
    { day: '2026-08-17', value: 1100 },
  ]);
});

test('preset volume totals compare complete workout sessions, not shared exercises', () => {
  const session = (id, date, weight) => [1, 2].map((index) => set({
    id: `${id}-${index}`,
    date,
    weight,
    reps: 5,
    workoutId: id,
    presetId: 'leg-day',
    workoutName: 'Leg day',
    workoutStartedAt: date,
  }));
  const records = [
    ...session('leg-1', '2026-08-10T12:00:00Z', 40),
    ...session('leg-2', '2026-08-17T12:00:00Z', 45),
    set({ id: 'other', workoutId: 'upper-1', presetId: 'upper', weight: 100, reps: 10 }),
  ];
  assert.deepEqual(presetVolumeSeries(records, 'leg-day').map(({ value, sets }) => ({ value, sets })), [
    { value: 400, sets: 2 },
    { value: 450, sets: 2 },
  ]);
});

test('merge keeps local values while accepting remote workout-session metadata', () => {
  const local = set({ id: 'same', weight: 80 });
  const remote = set({
    id: 'same',
    weight: 90,
    workoutId: 'legacy-upper-2026-08-17',
    presetId: 'upper',
    workoutName: 'Upper Body Day',
    workoutStartedAt: '2026-08-17T12:00:00Z',
  });
  const [merged] = mergeRecords([local], [remote]);
  assert.equal(merged.weight, 80);
  assert.equal(merged.workoutId, 'legacy-upper-2026-08-17');
  assert.equal(merged.presetId, 'upper');
});
