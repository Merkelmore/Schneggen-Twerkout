import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateSeries,
  calculateStreak,
  metricValue,
  normaliseRecord,
  parseBackup,
  serialiseBackup,
  todaySummary,
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

test('repairs an invalid imported creation timestamp', () => {
  const record = set({ createdAt: 'not-a-date' });
  assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});
