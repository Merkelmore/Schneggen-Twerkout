import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeWorkoutPlans,
  normaliseWorkoutPlan,
  reconcileWorkoutPlan,
  suggestWorkoutPreset,
} from '../public/plans.js';

const presets = [
  { id: 'upper', name: 'Upper Body Day', exercises: [{ name: 'Bench press' }] },
  { id: 'legs', name: 'Leg Day', exercises: [{ name: 'Squat' }] },
  { id: 'core', name: 'Core', exercises: [{ name: 'Plank' }] },
];

test('normalises weekday assignments and a unique rotation', () => {
  const plan = normaliseWorkoutPlan({
    mode: 'rotation',
    weekdays: { 1: ' upper ', 8: 'ignored' },
    rotation: ['legs', 'upper', 'legs', '', 'core'],
    updatedAt: '2026-09-04T08:00:00.000Z',
  });
  assert.deepEqual(plan.weekdays, { 1: 'upper' });
  assert.deepEqual(plan.rotation, ['legs', 'upper', 'core']);
  assert.equal(plan.updatedAt, '2026-09-04T08:00:00.000Z');
});

test('an intentionally cleared newer plan does not resurrect older choices', () => {
  const merged = mergeWorkoutPlans(
    { weekdays: { 1: 'legs' }, updatedAt: '2026-09-14T10:00:00Z' },
    { weekdays: {}, rotation: [], updatedAt: '2026-09-15T10:00:00Z' },
  );
  assert.deepEqual(merged.weekdays, {});
  assert.deepEqual(merged.rotation, []);
});

test('removes deleted preset IDs from a saved plan', () => {
  const plan = reconcileWorkoutPlan({
    weekdays: { 1: 'upper', 2: 'gone' },
    rotation: ['gone', 'legs'],
  }, presets);
  assert.deepEqual(plan.weekdays, { 1: 'upper' });
  assert.deepEqual(plan.rotation, ['legs']);
});

test('suggests the preset assigned to the local weekday', () => {
  const suggestion = suggestWorkoutPreset({
    presets,
    plan: { mode: 'weekday', weekdays: { 1: 'upper' } },
    date: new Date('2026-09-07T12:00:00'),
  });
  assert.equal(suggestion.label, 'Today');
  assert.equal(suggestion.preset.id, 'upper');
});

test('suggests the next preset after the latest workout in a rotation', () => {
  const suggestion = suggestWorkoutPreset({
    presets,
    plan: { mode: 'rotation', rotation: ['upper', 'legs', 'core'] },
    records: [
      { presetId: 'upper', workoutStartedAt: '2026-09-01T08:00:00.000Z' },
      { presetId: 'legs', workoutStartedAt: '2026-09-03T08:00:00.000Z' },
      { presetId: 'upper', workoutStartedAt: '2026-09-01T08:00:00.000Z' },
    ],
  });
  assert.equal(suggestion.label, 'Up next');
  assert.equal(suggestion.preset.id, 'core');
});

test('starts at the first rotation item and wraps around', () => {
  const first = suggestWorkoutPreset({
    presets,
    plan: { mode: 'rotation', rotation: ['upper', 'legs'] },
  });
  const wrapped = suggestWorkoutPreset({
    presets,
    plan: { mode: 'rotation', rotation: ['upper', 'legs'] },
    records: [{ presetId: 'legs', date: '2026-09-04T08:00:00.000Z' }],
  });
  assert.equal(first.preset.id, 'upper');
  assert.equal(wrapped.preset.id, 'upper');
});

test('keeps the newest user plan when profiles merge', () => {
  const merged = mergeWorkoutPlans(
    { mode: 'weekday', weekdays: { 1: 'upper' }, updatedAt: '2026-09-01T08:00:00.000Z' },
    { mode: 'rotation', rotation: ['legs', 'upper'], updatedAt: '2026-09-04T08:00:00.000Z' },
  );
  assert.equal(merged.mode, 'rotation');
  assert.deepEqual(merged.rotation, ['legs', 'upper']);
});
