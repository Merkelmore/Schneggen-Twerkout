import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStarterPresets,
  latestExerciseSet,
  markExerciseDone,
  normaliseActiveWorkout,
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
  assert.deepEqual(preset.exercises.map(({ name }) => name), ['Hip thrust', 'Squat']);
  assert.deepEqual(preset.exercises[0].sets, [{ weight: null, reps: null }]);
});

test('keeps planned weight and reps with safe limits', () => {
  const preset = normalisePreset({
    name: 'Upper body',
    exercises: [{
      name: 'Chest Press (Machine)',
      sets: [
        { weight: '30', reps: '5' },
        { weight: '25.25', reps: '7' },
        { weight: 'bad', reps: 0 },
      ],
    }],
  });
  assert.deepEqual(preset.exercises[0].sets, [
    { weight: 30, reps: 5 },
    { weight: 25.25, reps: 7 },
    { weight: null, reps: null },
  ]);
});

test('starter presets are immediately usable', () => {
  const presets = createStarterPresets();
  assert.equal(presets.length, 3);
  assert.ok(presets.every((preset) => preset.exercises.length >= 3));
  assert.ok(presets.every((preset) => preset.exercises.every((exercise) => exercise.sets.length === 3)));
});

test('finds the newest exercise set without changing stored casing', () => {
  assert.equal(latestExerciseSet(records, 'HIP thrust').id, 'latest');
});

test('starting a workout snapshots plans and last weight and reps', () => {
  const active = startWorkout({
    id: 'lower',
    name: 'Lower body',
    exercises: [
      { name: 'Hip thrust', sets: [{ weight: 82.5, reps: 8 }, { weight: 85, reps: 6 }] },
      'Squat',
    ],
  }, records, new Date('2026-08-14T10:00:00.000Z'));

  assert.equal(active.exercises[0].previous.weight, 80);
  assert.equal(active.exercises[0].previous.reps, 8);
  assert.deepEqual(active.exercises[0].plannedSets, [
    { weight: 82.5, reps: 8 },
    { weight: 85, reps: 6 },
  ]);
  assert.equal(active.exercises[1].previous, null);
});

test('normalises an older active workout with one blank planned set', () => {
  const active = normaliseActiveWorkout({
    name: 'Legacy workout',
    startedAt: '2026-08-14T10:00:00.000Z',
    exercises: [{ name: 'Squat', completedSetIds: [] }],
  });
  assert.deepEqual(active.exercises[0].plannedSets, [{ weight: null, reps: null }]);
});

test('marks a matching exercise once per saved set', () => {
  const active = startWorkout({
    id: 'lower',
    name: 'Lower body',
    exercises: [{ name: 'Hip thrust', sets: [{}, {}] }],
  }, records);
  const saved = { id: 'new-set', exercise: 'hip thrust' };
  const once = markExerciseDone(active, saved);
  const twice = markExerciseDone(once, saved);
  assert.deepEqual(once.exercises[0].completedSetIds, ['new-set']);
  assert.deepEqual(twice.exercises[0].completedSetIds, ['new-set']);
});

test('reads rich presets and preserves old backup compatibility', () => {
  assert.equal(parsePresetBackup(JSON.stringify({ records })), null);
  const parsed = parsePresetBackup(JSON.stringify({
    records,
    presets: [
      { id: 'one', name: 'Custom', exercises: ['Squat'] },
      { id: 'two', name: 'Rich', exercises: [{ name: 'Bench press', sets: [{ weight: 40, reps: 8 }] }] },
    ],
  }));
  assert.equal(parsed[0].exercises[0].sets.length, 1);
  assert.deepEqual(parsed[1].exercises[0].sets, [{ weight: 40, reps: 8 }]);
});
