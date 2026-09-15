export const TRAINING_STORAGE_KEY = 'schneggen-training-v1';

export function normaliseTraining(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const step = Number(value.weightStep);
  const seconds = Number(value.restSeconds);
  const rest = value.rest;
  const completion = value.completion;
  return {
    weightStep: [0.25, 0.5, 1, 1.25, 2.5, 5, 10].includes(step) ? step : 2.5,
    restEnabled: value.restEnabled === true,
    restSeconds: [30, 60, 90, 120, 180, 300].includes(seconds) ? seconds : 120,
    rest: rest && Number.isFinite(rest.endAt) && Number.isFinite(rest.total) && rest.total > 0
      ? { workoutId: String(rest.workoutId || '').slice(0, 80), endAt: rest.endAt, total: Math.min(rest.total, 3600) } : null,
    completion: completion?.id && completion?.name && Number.isFinite(Date.parse(completion.finishedAt))
      ? { id: String(completion.id).slice(0, 80), presetId: String(completion.presetId || '').slice(0, 80), name: String(completion.name).slice(0, 60), finishedAt: new Date(completion.finishedAt).toISOString() } : null,
    drafts: Object.fromEntries(Object.entries(value.drafts && typeof value.drafts === 'object' ? value.drafts : {}).slice(-240).map(([key, draft]) => [key.slice(0, 200), {
      weight: String(draft?.weight ?? '').slice(0, 12), reps: String(draft?.reps ?? '').slice(0, 12),
    }])),
    updatedAt: Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : null,
  };
}

export function mergeTraining(local, remote) {
  const a = normaliseTraining(local);
  const b = normaliseTraining(remote);
  return Date.parse(a.updatedAt || 0) > Date.parse(b.updatedAt || 0) ? a : b;
}

// Stored slot numbers keep an unchecked earlier row from shifting later logged sets.
export function setSlots(exercise, records) {
  const slots = Array.from({ length: exercise.plannedSets.length }, () => null);
  const logged = exercise.completedSetIds.map((id) => records.find((record) => record.id === id)).filter(Boolean);
  for (const record of logged.filter((record) => Number.isInteger(record.workoutSetIndex))) {
    if (!slots[record.workoutSetIndex]) slots[record.workoutSetIndex] = record;
  }
  for (const record of logged.filter((record) => !Number.isInteger(record.workoutSetIndex))) {
    const index = slots.findIndex((slot) => !slot);
    if (index === -1) slots.push(record);
    else slots[index] = record;
  }
  return slots;
}

export function restRemaining(rest, now = Date.now()) {
  return rest ? Math.max(0, Math.ceil((rest.endAt - now) / 1000)) : 0;
}

export function workoutComparison(records, completion) {
  if (!completion) return null;
  const groups = new Map();
  for (const record of records) {
    if (!record.workoutId || record.presetId !== completion.presetId) continue;
    const group = groups.get(record.workoutId) || { id: record.workoutId, date: record.workoutStartedAt || record.date, value: 0, sets: 0, strengthSets: 0 };
    group.sets += 1;
    if (record.type === 'strength') { group.value += record.weight * record.reps; group.strengthSets += 1; }
    groups.set(record.workoutId, group);
  }
  const current = groups.get(completion.id) || { id: completion.id, date: completion.finishedAt, value: 0, sets: 0, strengthSets: 0 };
  const earlier = [...groups.values()].filter((group) => group.id !== current.id && Date.parse(group.date) <= Date.parse(current.date)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const previous = earlier.at(-1) || null;
  const delta = previous && current.strengthSets && previous.strengthSets ? current.value - previous.value : null;
  return { current, previous, delta, percent: delta !== null && previous.value > 0 ? delta / previous.value * 100 : null, series: [...earlier.slice(-5), current] };
}
