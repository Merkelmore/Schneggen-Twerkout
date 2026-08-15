import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStarterPresets,
  latestExerciseSet,
  markExerciseDone,
  normalisePreset,
  parsePresetBackup,
  startWorkout,
} from '../public/presets.js';

const records = [
  {
    id: 'old',
    exercise: 'Hip thrust',
    type: 'strength',
    date: '2026-08-10T10:00:00.000Z',
    weight: 70,
    reps: 10,
  },
  {
    id: 'latest',
    exercise: 'hip THRUST',
    type: 'strength',
    date: '2026-08-12T10:00:00.000Z',
    weight: 80,
    reps: 8,
  },
];

test('normalises preset names and unique exercises', () => {
  const preset = normalisePreset({
    name: '  Lower   body ',
    exercises: [' Hip thrust ', 'hip thrust', '', 'Squat'],
  });
  assert.equal(preset.name, 'Lower body');
  assert.deepEqual(preset.exercises, ['Hip thrust', 'Squat']);
});

test('starter presets are immediately usable', () => {
  const presets = createStarterPresets();
  assert.equal(presets.length, 3);
  assert.ok(presets.every((preset) => preset.exercises.length >= 3));
});

test('finds the newest exercise set without changing stored casing', () => {
  assert.equal(latestExerciseSet(records, 'HIP thrust').id, 'latest');
});

test('starting a workout snapshots last weight and reps', () => {
  const active = startWorkout({
    id: 'lower',
    name: 'Lower body',
    exercises: ['Hip thrust', 'Squat'],
  }, records, new Date('2026-08-14T10:00:00.000Z'));

  assert.equal(active.exercises[0].previous.weight, 80);
  assert.equal(active.exercises[0].previous.reps, 8);
  assert.equal(active.exercises[1].previous, null);
});

test('marks a matching exercise once per saved set', () => {
  const active = startWorkout({
    id: 'lower',
    name: 'Lower body',
    exercises: ['Hip thrust'],
  }, records);
  const saved = { id: 'new-set', exercise: 'hip thrust' };
  const once = markExerciseDone(active, saved);
  const twice = markExerciseDone(once, saved);
  assert.deepEqual(once.exercises[0].completedSetIds, ['new-set']);
  assert.deepEqual(twice.exercises[0].completedSetIds, ['new-set']);
});

test('reads presets from new backups and preserves old backup compatibility', () => {
  assert.equal(parsePresetBackup(JSON.stringify({ records })), null);
  const parsed = parsePresetBackup(JSON.stringify({
    records,
    presets: [{ id: 'one', name: 'Custom', exercises: ['Squat'] }],
  }));
  assert.equal(parsed[0].name, 'Custom');
});
