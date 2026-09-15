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
    ...(input?.id ? { id: String(input.id).slice(0, 80) } : {}),
    name,
    sets: sets.length ? sets : [normalisePlannedSet()],
  };
};

export const normalisePreset = (input = {}) => {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const seen = new Set();
  const exercises = (Array.isArray(input.exercises) ? input.exercises : [])
    .map((exercise, index) => {
      const clean = normalisePresetExercise(exercise);
      return clean ? { ...clean, id: clean.id || `exercise-${index + 1}` } : null;
    })
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

export const latestExerciseSet = (records, exercise, identity = {}) => {
  const key = exerciseKey(exercise);
  return (Array.isArray(records) ? records : [])
    .filter((record) => exerciseKey(record.exercise) === key || (
      identity.id && identity.presetId && record.workoutExerciseId === identity.id && record.presetId === identity.presetId
    ))
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

export const previousExerciseSets = (records, exercise, identity = {}, excludeWorkoutId = '') => {
  const matches = (Array.isArray(records) ? records : []).filter((record) =>
    (!excludeWorkoutId || record.workoutId !== excludeWorkoutId) && (
      exerciseKey(record.exercise) === exerciseKey(exercise) ||
      (identity.id && identity.presetId && record.workoutExerciseId === identity.id && record.presetId === identity.presetId)
    ));
  const latest = latestExerciseSet(matches, exercise, identity);
  if (!latest) return [];
  // Legacy imports without workout IDs can still be compared by their recorded day.
  const session = matches.filter((record) => latest.workoutId
    ? record.workoutId === latest.workoutId
    : !record.workoutId && new Date(record.date).toDateString() === new Date(latest.date).toDateString());
  session.sort((a, b) => Number.isInteger(a.workoutSetIndex) && Number.isInteger(b.workoutSetIndex)
    ? a.workoutSetIndex - b.workoutSetIndex : Date.parse(a.date) - Date.parse(b.date));
  const snapshots = [];
  session.filter((record) => Number.isInteger(record.workoutSetIndex)).forEach((record) => { snapshots[record.workoutSetIndex] = previousSnapshot(record); });
  session.filter((record) => !Number.isInteger(record.workoutSetIndex)).forEach((record) => {
    let index = 0;
    while (snapshots[index]) index += 1;
    snapshots[index] = previousSnapshot(record);
  });
  return Array.from({ length: Math.min(snapshots.length, MAX_PRESET_SETS) }, (_, index) => snapshots[index] || null);
};

export const startWorkout = (preset, records, now = new Date()) => {
  const cleanPreset = normalisePreset(preset);
  if (!cleanPreset) return null;

  return {
    id: makeId('workout'),
    presetId: cleanPreset.id,
    name: cleanPreset.name,
    startedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    selectedExerciseId: cleanPreset.exercises[0].id,
    exercises: cleanPreset.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      plannedSets: exercise.sets.map(normalisePlannedSet),
      previous: previousSnapshot(latestExerciseSet(records, exercise.name, { id: exercise.id, presetId: cleanPreset.id })),
      previousSets: previousExerciseSets(records, exercise.name, { id: exercise.id, presetId: cleanPreset.id }),
      completedSetIds: [],
    })),
  };
};

export const normaliseActiveWorkout = (input = {}) => {
  if (!input || !Array.isArray(input.exercises)) return null;
  const name = String(input.name ?? '').trim().slice(0, 60);
  const exercises = input.exercises
    .map((exercise, index) => {
      const normalised = normalisePresetExercise({
        name: exercise?.name,
        sets: exercise?.plannedSets ?? exercise?.sets,
      });
      if (!normalised) return null;
      return {
        id: String(exercise.id || `exercise-${index + 1}`).slice(0, 80),
        name: normalised.name,
        plannedSets: normalised.sets,
        previous: exercise?.previous && typeof exercise.previous === 'object'
          ? previousSnapshot(exercise.previous)
          : null,
        ...(Array.isArray(exercise.previousSets) ? { previousSets: exercise.previousSets.slice(0, MAX_PRESET_SETS).map(previousSnapshot) } : {}),
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
    selectedExerciseId: exercises.some(({ id }) => id === input.selectedExerciseId)
      ? input.selectedExerciseId
      : (exercises.find((exercise) => exercise.completedSetIds.length < exercise.plannedSets.length) || exercises[0]).id,
    exercises,
  };
};

export const markExerciseDone = (activeWorkout, record) => {
  const active = normaliseActiveWorkout(activeWorkout);
  if (!active || !record?.id || record.workoutId !== active.id) return activeWorkout;

  const key = exerciseKey(record.exercise);
  let changed = false;
  const exercises = active.exercises.map((exercise) => {
    const matches = record.workoutExerciseId
      ? exercise.id === record.workoutExerciseId
      : exerciseKey(exercise.name) === key;
    if (!matches || exercise.completedSetIds.includes(record.id)) {
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

// Apply edits by stable exercise ID. Recorded sets and their IDs are never rewritten.
export const reviseActiveWorkout = (input, preset, records = []) => {
  const active = normaliseActiveWorkout(input);
  const clean = normalisePreset(preset);
  if (!active || !clean) throw new TypeError('Add a name and an exercise.');
  const exercises = clean.exercises.map((exercise) => {
    const previous = active.exercises.find(({ id }) => id === exercise.id);
    const lastLoggedSlot = Math.max(-1, ...records.filter((record) => previous?.completedSetIds.includes(record.id)).map((record) => record.workoutSetIndex ?? -1));
    if (previous && exercise.sets.length < Math.max(previous.completedSetIds.length, lastLoggedSlot + 1)) {
      throw new TypeError('Keep the sets already logged.');
    }
    return {
      id: exercise.id,
      name: exercise.name,
      plannedSets: exercise.sets,
      completedSetIds: previous?.completedSetIds || [],
      previous: previous?.previous || previousSnapshot(latestExerciseSet(records, exercise.name)),
      previousSets: previous?.previousSets || previousExerciseSets(records, exercise.name, { id: exercise.id, presetId: active.presetId }, active.id),
    };
  });
  for (const exercise of active.exercises) {
    if (exercise.completedSetIds.length && !exercises.some(({ id }) => id === exercise.id)) {
      throw new TypeError('Keep exercises with logged sets.');
    }
  }
  return normaliseActiveWorkout({ ...active, name: clean.name, exercises, updatedAt: new Date().toISOString() });
};

export const parsePresetBackup = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || !Object.hasOwn(parsed, 'presets')) return null;
  return normalisePresets(parsed.presets);
};
