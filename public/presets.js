export const PRESET_STORAGE_KEY = 'schneggen-presets-v1';
export const ACTIVE_WORKOUT_STORAGE_KEY = 'schneggen-active-workout-v1';
export const FIRST_VISIT_STORAGE_KEY = 'schneggen-presets-welcomed-v1';
export const MAX_PRESET_SETS = 12;

const makeId = (prefix) => globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const cleanExerciseName = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 80);

const cleanPlanNumber = (value, { integer = false, min = 0 } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > 100_000) return null;
  return integer ? Math.round(number) : Math.round(number * 100) / 100;
};

export const normalisePlannedSet = (input = {}) => ({
  weight: cleanPlanNumber(input?.weight),
  reps: cleanPlanNumber(input?.reps, { integer: true, min: 1 }),
});

export const normalisePresetExercise = (input) => {
  const name = cleanExerciseName(typeof input === 'string' ? input : input?.name);
  if (!name) return null;

  const suppliedSets = Array.isArray(input?.sets)
    ? input.sets
    : Array.isArray(input?.plannedSets) ? input.plannedSets : [];
  const sets = suppliedSets.slice(0, MAX_PRESET_SETS).map(normalisePlannedSet);

  return {
    name,
    sets: sets.length ? sets : [normalisePlannedSet()],
  };
};

export const normalisePreset = (input = {}) => {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const seen = new Set();
  const exercises = (Array.isArray(input.exercises) ? input.exercises : [])
    .map(normalisePresetExercise)
    .filter((exercise) => {
      if (!exercise) return false;
      const key = exercise.name.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);

  if (!name || !exercises.length) return null;

  const createdAt = new Date(input.createdAt || Date.now());
  const updatedAt = new Date(input.updatedAt || Date.now());

  return {
    id: String(input.id || makeId('preset')).slice(0, 80),
    name,
    exercises,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date().toISOString() : updatedAt.toISOString(),
  };
};

export const normalisePresets = (input) => (Array.isArray(input) ? input : [])
  .map(normalisePreset)
  .filter(Boolean);

const starterExercise = (name) => ({ name, sets: [{}, {}, {}] });

export const createStarterPresets = () => normalisePresets([
  {
    id: 'starter-full-body',
    name: 'Full body',
    exercises: ['Squat', 'Bench press', 'Lat pulldown'].map(starterExercise),
  },
  {
    id: 'starter-lower-body',
    name: 'Lower body',
    exercises: ['Hip thrust', 'Squat', 'Deadlift'].map(starterExercise),
  },
  {
    id: 'starter-upper-body',
    name: 'Upper body',
    exercises: ['Bench press', 'Lat pulldown', 'Shoulder press'].map(starterExercise),
  },
]);

const exerciseKey = (value) => cleanExerciseName(value).toLocaleLowerCase();

export const latestExerciseSet = (records, exercise) => {
  const key = exerciseKey(exercise);
  return (Array.isArray(records) ? records : [])
    .filter((record) => exerciseKey(record.exercise) === key)
    .reduce((latest, record) => (
      !latest || new Date(record.date).getTime() > new Date(latest.date).getTime()
        ? record
        : latest
    ), null);
};

const previousSnapshot = (record) => record ? {
  id: record.id,
  type: record.type,
  date: record.date,
  weight: record.weight ?? null,
  reps: record.reps ?? null,
  duration: record.duration ?? null,
  distance: record.distance ?? null,
} : null;

export const startWorkout = (preset, records, now = new Date()) => {
  const cleanPreset = normalisePreset(preset);
  if (!cleanPreset) return null;

  return {
    id: makeId('workout'),
    presetId: cleanPreset.id,
    name: cleanPreset.name,
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    exercises: cleanPreset.exercises.map((exercise) => ({
      name: exercise.name,
      plannedSets: exercise.sets.map(normalisePlannedSet),
      previous: previousSnapshot(latestExerciseSet(records, exercise.name)),
      completedSetIds: [],
    })),
  };
};

export const normaliseActiveWorkout = (input = {}) => {
  if (!input || !Array.isArray(input.exercises)) return null;
  const name = String(input.name ?? '').trim().slice(0, 60);
  const exercises = input.exercises
    .map((exercise) => {
      const normalised = normalisePresetExercise({
        name: exercise?.name,
        sets: exercise?.plannedSets ?? exercise?.sets,
      });
      if (!normalised) return null;
      return {
        name: normalised.name,
        plannedSets: normalised.sets,
        previous: exercise?.previous && typeof exercise.previous === 'object'
          ? previousSnapshot(exercise.previous)
          : null,
        completedSetIds: [...new Set(
          (Array.isArray(exercise?.completedSetIds) ? exercise.completedSetIds : [])
            .map((id) => String(id).slice(0, 80))
            .filter(Boolean),
        )],
      };
    })
    .filter(Boolean);

  if (!name || !exercises.length) return null;

  const startedAt = new Date(input.startedAt);
  const updatedAt = new Date(input.updatedAt || input.startedAt);

  return {
    id: String(input.id || makeId('workout')).slice(0, 80),
    presetId: String(input.presetId || '').slice(0, 80),
    name,
    startedAt: Number.isNaN(startedAt.getTime()) ? new Date().toISOString() : startedAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date().toISOString() : updatedAt.toISOString(),
    exercises,
  };
};

export const markExerciseDone = (activeWorkout, record) => {
  const active = normaliseActiveWorkout(activeWorkout);
  if (!active || !record?.id) return activeWorkout;

  const key = exerciseKey(record.exercise);
  let changed = false;
  const exercises = active.exercises.map((exercise) => {
    if (exerciseKey(exercise.name) !== key || exercise.completedSetIds.includes(record.id)) {
      return exercise;
    }
    changed = true;
    return {
      ...exercise,
      completedSetIds: [...exercise.completedSetIds, String(record.id)],
    };
  });

  return changed ? {
    ...active,
    updatedAt: new Date().toISOString(),
    exercises,
  } : activeWorkout;
};

export const parsePresetBackup = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || !Object.hasOwn(parsed, 'presets')) return null;
  return normalisePresets(parsed.presets);
};
