export const STORAGE_KEY = 'schneggen-workouts-v1';
export const BACKUP_VERSION = 2;

export const WORKOUT_TYPES = {
  strength: {
    label: 'Weight × reps',
    fields: ['weight', 'reps'],
    metrics: [
      { value: 'weight', label: 'Best weight', unit: 'kg' },
      { value: 'volume', label: 'Best volume', unit: 'kg' },
      { value: 'reps', label: 'Best reps', unit: 'reps' },
    ],
  },
  reps: {
    label: 'Reps only',
    fields: ['reps'],
    metrics: [{ value: 'reps', label: 'Best reps', unit: 'reps' }],
  },
  duration: {
    label: 'Time',
    fields: ['duration'],
    metrics: [{ value: 'duration', label: 'Best time', unit: 'min' }],
  },
  distance: {
    label: 'Distance',
    fields: ['distance'],
    metrics: [{ value: 'distance', label: 'Best distance', unit: 'km' }],
  },
};

const cleanNumber = (value, { integer = false, min = 0, max = 1_000_000 } = {}) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.round(number) : Math.round(number * 100) / 100;
};

export const localDayKey = (input) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const localWeekKey = (input) => {
  const date = input instanceof Date ? new Date(input) : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceMonday);
  return localDayKey(date);
};

export const normaliseRecord = (input = {}) => {
  const exercise = String(input.exercise ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const type = Object.hasOwn(WORKOUT_TYPES, input.type) ? input.type : 'strength';
  const parsedDate = new Date(input.date);
  const parsedCreatedAt = new Date(input.createdAt || Date.now());
  const parsedWorkoutStartedAt = input.workoutStartedAt
    ? new Date(input.workoutStartedAt)
    : null;
  if (!exercise || Number.isNaN(parsedDate.getTime())) return null;

  const record = {
    id: String(input.id || '').trim().slice(0, 80),
    exercise,
    type,
    date: parsedDate.toISOString(),
    reps: cleanNumber(input.reps, { integer: true, min: 1, max: 100_000 }),
    weight: cleanNumber(input.weight, { min: 0, max: 100_000 }),
    duration: cleanNumber(input.duration, { integer: true, min: 1, max: 604_800 }),
    distance: cleanNumber(input.distance, { min: 0.01, max: 100_000 }),
    notes: String(input.notes ?? '').trim().slice(0, 240),
    workoutId: String(input.workoutId ?? '').trim().slice(0, 80),
    presetId: String(input.presetId ?? '').trim().slice(0, 80),
    workoutName: String(input.workoutName ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
    workoutStartedAt: parsedWorkoutStartedAt && !Number.isNaN(parsedWorkoutStartedAt.getTime())
      ? parsedWorkoutStartedAt.toISOString()
      : null,
    createdAt: Number.isNaN(parsedCreatedAt.getTime())
      ? new Date().toISOString()
      : parsedCreatedAt.toISOString(),
  };

  const required = WORKOUT_TYPES[type].fields;
  if (required.some((field) => record[field] === null)) return null;
  if (!record.id) {
    record.id = globalThis.crypto?.randomUUID?.()
      ?? `set-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  return record;
};

export const sortRecords = (records) => [...records].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
);

export const mergeRecords = (current, incoming) => {
  const merged = new Map();
  [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]
    .map(normaliseRecord)
    .filter(Boolean)
    .forEach((record) => {
      const existing = merged.get(record.id);
      if (!existing) {
        merged.set(record.id, record);
        return;
      }
      merged.set(record.id, {
        ...record,
        ...existing,
        workoutId: existing.workoutId || record.workoutId,
        presetId: existing.presetId || record.presetId,
        workoutName: existing.workoutName || record.workoutName,
        workoutStartedAt: existing.workoutStartedAt || record.workoutStartedAt,
      });
    });
  return sortRecords([...merged.values()]);
};

export const metricValue = (record, metric = 'primary') => {
  const selected = metric === 'primary'
    ? WORKOUT_TYPES[record.type]?.metrics[0]?.value
    : metric;

  if (selected === 'volume') return Number(record.weight || 0) * Number(record.reps || 0);
  if (selected === 'duration') return Number(record.duration || 0) / 60;
  return Number(record[selected] || 0);
};

export const aggregateSeries = (records, exercise, metric = 'primary') => {
  const byDay = new Map();

  for (const record of records) {
    if (record.exercise !== exercise) continue;
    const value = metricValue(record, metric);
    if (!Number.isFinite(value) || value <= 0) continue;
    const day = localDayKey(record.date);
    const current = byDay.get(day);
    if (!current || value > current.value) {
      byDay.set(day, { day, value, date: new Date(record.date).getTime() });
    }
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
};

const roundedVolume = (value) => Math.round(value * 100) / 100;

export const weeklyVolumeSeries = (records) => {
  const byWeek = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record.type !== 'strength') continue;
    const value = metricValue(record, 'volume');
    const day = localWeekKey(record.date);
    if (!day || !Number.isFinite(value) || value <= 0) continue;
    const current = byWeek.get(day) || { day, value: 0, sets: 0 };
    current.value += value;
    current.sets += 1;
    byWeek.set(day, current);
  }
  return [...byWeek.values()]
    .map((point) => ({ ...point, value: roundedVolume(point.value) }))
    .sort((a, b) => a.day.localeCompare(b.day));
};

export const presetVolumeSeries = (records, presetId) => {
  const selectedPresetId = String(presetId ?? '').trim();
  if (!selectedPresetId) return [];
  const byWorkout = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record.type !== 'strength'
        || record.presetId !== selectedPresetId
        || !record.workoutId) continue;
    const value = metricValue(record, 'volume');
    if (!Number.isFinite(value) || value <= 0) continue;
    const timestamp = new Date(record.workoutStartedAt || record.date).getTime();
    const current = byWorkout.get(record.workoutId) || {
      workoutId: record.workoutId,
      day: localDayKey(record.workoutStartedAt || record.date),
      date: Number.isNaN(timestamp) ? new Date(record.date).getTime() : timestamp,
      value: 0,
      sets: 0,
    };
    current.value += value;
    current.sets += 1;
    byWorkout.set(record.workoutId, current);
  }
  return [...byWorkout.values()]
    .map((point) => ({ ...point, value: roundedVolume(point.value) }))
    .sort((a, b) => a.date - b.date || a.workoutId.localeCompare(b.workoutId));
};

const daySerial = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const calculateStreak = (records, now = new Date()) => {
  const days = [...new Set(records.map((record) => localDayKey(record.date)).filter(Boolean))]
    .sort()
    .reverse();
  if (!days.length) return 0;

  const today = daySerial(localDayKey(now));
  const latest = daySerial(days[0]);
  if (today - latest > 1) return 0;

  let streak = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (daySerial(days[index - 1]) - daySerial(days[index]) !== 1) break;
    streak += 1;
  }
  return streak;
};

export const todaySummary = (records, now = new Date()) => {
  const today = localDayKey(now);
  const todaysRecords = records.filter((record) => localDayKey(record.date) === today);
  return {
    sets: todaysRecords.length,
    exercises: new Set(todaysRecords.map((record) => record.exercise)).size,
    volume: Math.round(
      todaysRecords
        .filter((record) => record.type === 'strength')
        .reduce((total, record) => total + metricValue(record, 'volume'), 0),
    ),
  };
};

export const serialiseBackup = (records, { presets = [] } = {}) => JSON.stringify({
  app: 'Schneggen-Twerkout',
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  records: sortRecords(records),
  presets,
}, null, 2);

export const parseBackup = (text) => {
  const parsed = JSON.parse(text);
  const candidates = Array.isArray(parsed) ? parsed : parsed?.records;
  if (!Array.isArray(candidates)) throw new Error('Backup has no workout records.');

  const records = candidates.map(normaliseRecord).filter(Boolean);
  if (candidates.length > 0 && records.length === 0) {
    throw new Error('No valid workout records were found.');
  }

  return sortRecords(records);
};
