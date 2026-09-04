export const WORKOUT_PLAN_STORAGE_KEY = 'schneggen-workout-plan-v1';

export const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const cleanPresetId = (value) => String(value ?? '').trim().slice(0, 80);

const cleanUpdatedAt = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

export const normaliseWorkoutPlan = (input = {}) => {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const weekdays = {};
  WEEKDAYS.forEach(({ value: day }) => {
    const presetId = cleanPresetId(value.weekdays?.[day]);
    if (presetId) weekdays[day] = presetId;
  });

  const seen = new Set();
  const rotation = (Array.isArray(value.rotation) ? value.rotation : [])
    .map(cleanPresetId)
    .filter((presetId) => {
      if (!presetId || seen.has(presetId)) return false;
      seen.add(presetId);
      return true;
    })
    .slice(0, 50);

  return {
    mode: value.mode === 'rotation' ? 'rotation' : 'weekday',
    weekdays,
    rotation,
    updatedAt: cleanUpdatedAt(value.updatedAt),
  };
};

export const reconcileWorkoutPlan = (input, presets = []) => {
  const plan = normaliseWorkoutPlan(input);
  const presetIds = new Set(
    (Array.isArray(presets) ? presets : []).map(({ id }) => cleanPresetId(id)).filter(Boolean),
  );
  const weekdays = {};
  WEEKDAYS.forEach(({ value: day }) => {
    const presetId = plan.weekdays[day];
    if (presetIds.has(presetId)) weekdays[day] = presetId;
  });
  return {
    ...plan,
    weekdays,
    rotation: plan.rotation.filter((presetId) => presetIds.has(presetId)),
  };
};

const hasChoices = (plan) => (
  Object.keys(plan.weekdays).length > 0 || plan.rotation.length > 0
);

export const mergeWorkoutPlans = (localInput, remoteInput) => {
  const local = normaliseWorkoutPlan(localInput);
  const remote = normaliseWorkoutPlan(remoteInput);
  if (!hasChoices(local) && hasChoices(remote)) return remote;
  if (hasChoices(local) && !hasChoices(remote)) return local;
  const localTime = new Date(local.updatedAt || 0).getTime();
  const remoteTime = new Date(remote.updatedAt || 0).getTime();
  return remoteTime > localTime ? remote : local;
};

const recordTime = (record) => {
  const value = new Date(record?.workoutStartedAt || record?.date || record?.createdAt || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export const suggestWorkoutPreset = ({
  presets = [],
  plan: inputPlan,
  records = [],
  date = new Date(),
} = {}) => {
  const cleanPresets = Array.isArray(presets) ? presets : [];
  const plan = reconcileWorkoutPlan(inputPlan, cleanPresets);
  if (plan.mode === 'weekday') {
    const presetId = plan.weekdays[date.getDay()];
    const preset = cleanPresets.find(({ id }) => id === presetId) || null;
    return preset ? { preset, label: 'Today' } : null;
  }

  if (!plan.rotation.length) return null;
  const rotationIds = new Set(plan.rotation);
  const latest = (Array.isArray(records) ? records : [])
    .filter((record) => rotationIds.has(cleanPresetId(record?.presetId)))
    .reduce((current, record) => (
      !current || recordTime(record) > recordTime(current) ? record : current
    ), null);
  const lastIndex = latest ? plan.rotation.indexOf(cleanPresetId(latest.presetId)) : -1;
  const nextId = plan.rotation[(lastIndex + 1) % plan.rotation.length];
  const preset = cleanPresets.find(({ id }) => id === nextId) || null;
  return preset ? { preset, label: 'Up next' } : null;
};

export const parseWorkoutPlanBackup = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || !Object.hasOwn(parsed, 'workoutPlan')) return null;
  return normaliseWorkoutPlan(parsed.workoutPlan);
};
