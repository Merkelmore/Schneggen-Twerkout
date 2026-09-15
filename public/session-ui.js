import { TRAINING_STORAGE_KEY, normaliseTraining, mergeTraining, setSlots, restRemaining, workoutComparison } from './training.js?v=12';
import { previousExerciseSets } from './presets.js?v=12';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, className, action) => {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
};
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const format = (record) => record ? record.type === 'duration' ? `${number.format(record.duration / 60)} min`
  : record.type === 'distance' ? `${number.format(record.distance)} km`
    : record.type === 'reps' ? `${record.reps} reps` : `${number.format(record.weight)} kg × ${record.reps}` : '—';

export function createSessionUI({ storage, onSave, onEdit, onOther, onToast }) {
  let state;
  try { state = normaliseTraining(JSON.parse(storage.getItem(TRAINING_STORAGE_KEY) || 'null')); }
  catch { state = normaliseTraining(); }
  let currentId = null;
  let undoTimer;
  const restPanel = document.querySelector('#restPanel');
  const undoPanel = document.querySelector('#undoPanel');
  const completionPanel = document.querySelector('#completionPanel');
  const save = () => {
    state.updatedAt = new Date().toISOString();
    try { storage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(state)); }
    catch { onToast('Storage is full. Export a backup.'); }
  };
  const clearUndo = () => { clearTimeout(undoTimer); undoPanel.hidden = true; undoPanel.replaceChildren(); };
  const settings = document.querySelector('#trainingSettings');
  function renderSettings() {
    settings.replaceChildren(el('summary', null, 'Workout settings'));
    const fields = el('div', 'training-settings-fields');
    const select = (label, key, values) => {
      const wrapper = el('label', 'field');
      const input = el('select');
      values.forEach(([value, text]) => { const option = el('option', null, text); option.value = value; input.append(option); });
      input.value = state[key];
      input.id = key;
      input.addEventListener('change', () => { state[key] = Number(input.value); save(); });
      wrapper.append(el('span', null, label), input); fields.append(wrapper);
    };
    select('Weight step', 'weightStep', [0.25, 0.5, 1, 1.25, 2.5, 5, 10].map((value) => [value, `${number.format(value)} kg`]));
    select('Rest time', 'restSeconds', [30, 60, 90, 120, 180, 300].map((value) => [value, `${value} sec`]));
    const toggle = el('label', 'rest-toggle');
    const input = el('input'); input.type = 'checkbox'; input.id = 'restEnabled'; input.checked = state.restEnabled;
    input.addEventListener('change', () => { state.restEnabled = input.checked; if (!input.checked) state.rest = null; save(); renderRest(); });
    toggle.append(input, el('span', null, 'Rest after each set')); fields.append(toggle); settings.append(fields);
  }
  const time = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  function renderRest() {
    restPanel.hidden = !state.rest || state.rest.workoutId !== currentId;
    if (restPanel.hidden) return;
    restPanel.replaceChildren();
    const remaining = restRemaining(state.rest);
    const label = el('strong', null, remaining ? `Rest · ${time(remaining)}` : 'Weady for your next set 🐌');
    label.id = 'restCountdown'; label.setAttribute('role', 'timer');
    const track = el('div', 'rest-track');
    const snail = el('span', 'rest-snail', '🐌');
    snail.style.left = `${Math.min(1, Math.max(0, 1 - remaining / state.rest.total)) * 100}%`;
    track.append(snail);
    restPanel.append(label, track,
      button('+30 sec', 'mini-button', () => {
        state.rest = { ...state.rest, endAt: Math.max(Date.now(), state.rest.endAt) + 30_000, total: Math.min(3600, state.rest.total + 30) };
        save(); renderRest();
      }),
      button(remaining ? 'Skip' : 'Close', 'mini-button', () => { state.rest = null; save(); renderRest(); }));
  }
  // Use a deadline, not interval ticks: background tabs and phone locks do not stretch a pause.
  setInterval(() => {
    if (restPanel.hidden || !state.rest) return;
    const remaining = restRemaining(state.rest);
    const label = restPanel.querySelector('#restCountdown');
    if (remaining === 0 && label?.textContent.startsWith('Rest')) { renderRest(); return; }
    if (remaining && label) label.textContent = `Rest · ${time(remaining)}`;
    const snail = restPanel.querySelector('.rest-snail');
    if (snail) snail.style.left = `${Math.min(1, Math.max(0, 1 - remaining / state.rest.total)) * 100}%`;
  }, 500);

  function renderSets(exercise, active, records) {
    const container = el('div', 'training-sets');
    const slots = setSlots(exercise, records);
    const previous = exercise.previousSets || previousExerciseSets(records, exercise.name, { id: exercise.id, presetId: active.presetId }, active.id);
    slots.forEach((record, index) => {
      const key = `${active.id}:${exercise.id}:${index}`;
      const prior = previous[index];
      const planned = exercise.plannedSets[index] || {};
      const row = el('form', 'training-set');
      row.dataset.setIndex = index;
      row.dataset.saved = String(Boolean(record));
      const heading = el('div', 'training-set-heading');
      heading.append(el('strong', null, `Set ${index + 1}`), el('span', 'previous-set', `Last time: ${format(prior)}`));
      row.append(heading);
      if (record && record.type !== 'strength') {
        row.append(button(`✓ ${format(record)} · Edit`, 'secondary-button', () => onEdit(record.id)));
        container.append(row); return;
      }
      const values = { weight: planned.weight ?? prior?.weight ?? '', reps: planned.reps ?? prior?.reps ?? '', ...(state.drafts[key] || {}), ...(record ? { weight: record.weight, reps: record.reps } : {}) };
      const inputs = {};
      const fields = el('div', 'training-set-fields');
      const complete = el('button', 'set-check', record ? '✓' : '○');
      complete.type = 'submit';
      complete.setAttribute('aria-label', record ? `Set ${index + 1} saved` : `Set ${index + 1} save`);
      complete.disabled = Boolean(record);
      const actions = el('div', 'training-set-actions');
      const cancel = button('Cancel', 'text-button', () => {
        for (const field of ['weight', 'reps']) { inputs[field].value = record[field]; inputs[field].readOnly = true; }
        complete.disabled = true; row.dataset.editing = 'false'; cancel.hidden = true;
      });
      cancel.hidden = true;
      const editing = () => {
        if (!record) return;
        row.dataset.editing = 'true'; complete.disabled = false; cancel.hidden = false;
        complete.setAttribute('aria-label', `Set ${index + 1} update`);
        Object.values(inputs).forEach((input) => { input.readOnly = false; });
      };
      const saveDraft = () => {
        if (record) return;
        state.drafts[key] = { weight: inputs.weight.value, reps: inputs.reps.value }; save();
      };
      for (const field of ['weight', 'reps']) {
        const wrapper = el('label', 'set-number-field');
        wrapper.append(el('span', null, field === 'weight' ? 'kg' : 'reps'));
        const control = el('span', 'number-stepper');
        const input = el('input'); inputs[field] = input;
        input.type = 'number'; input.inputMode = field === 'weight' ? 'decimal' : 'numeric';
        input.min = field === 'weight' ? '0' : '1'; input.max = '100000'; input.step = field === 'weight' ? '0.01' : '1';
        input.required = true; input.value = values[field]; input.readOnly = Boolean(record);
        input.setAttribute('aria-label', `${exercise.name} Set ${index + 1} ${field === 'weight' ? 'kg' : 'reps'}`);
        input.addEventListener('click', editing);
        input.addEventListener('input', saveDraft);
        const adjust = (direction) => {
          editing();
          const next = Math.max(Number(input.min), Math.min(100000, Number(input.value || 0) + direction * (field === 'weight' ? state.weightStep : 1)));
          input.value = Math.round(next * 100) / 100; saveDraft();
        };
        const minus = button('−', 'step-button', () => adjust(-1));
        const plus = button('+', 'step-button', () => adjust(1));
        minus.setAttribute('aria-label', field === 'weight' ? 'Less weight' : 'Fewer reps');
        plus.setAttribute('aria-label', field === 'weight' ? 'More weight' : 'More reps');
        control.append(minus, input, plus); wrapper.append(control); fields.append(wrapper);
      }
      fields.append(complete); row.append(fields);
      const earlier = slots.slice(0, index).filter(Boolean).at(-1);
      if (!record && earlier?.type === 'strength') actions.append(button('Copy previous set', 'text-button', () => {
        inputs.weight.value = earlier.weight; inputs.reps.value = earlier.reps; saveDraft();
      }));
      if (record) actions.append(button('Edit', 'text-button', () => { editing(); inputs.weight.focus(); }), button('Details', 'text-button', () => onEdit(record.id)), cancel);
      row.append(actions);
      row.addEventListener('submit', (event) => {
        event.preventDefault();
        if (record && row.dataset.editing !== 'true') return;
        const previousRest = state.rest ? { ...state.rest } : null;
        const result = onSave({ existing: record, exercise, active, index, weight: inputs.weight.value, reps: inputs.reps.value });
        if (!result) return;
        delete state.drafts[key];
        save(); renderRest(); clearUndo();
        undoPanel.append(el('span', null, record ? 'Set updated.' : 'Set saved.'),
          button('Undo', 'text-button', () => { state.rest = previousRest; save(); result.undo(); renderRest(); clearUndo(); }));
        undoPanel.hidden = false;
        undoTimer = setTimeout(clearUndo, 10_000);
        const focus = document.querySelector(`[data-reorder-row="${CSS.escape(exercise.id)}"] .training-set[data-set-index="${index + (record ? 0 : 1)}"] input`);
        focus?.focus({ preventScroll: true });
      });
      container.append(row);
    });
    if (slots.some((slot) => !slot)) container.append(button('Log time, distance or notes', 'text-button other-tracking', () => onOther(exercise)));
    return container;
  }

  function renderCompletion(records) {
    completionPanel.hidden = !state.completion || Boolean(currentId);
    document.querySelector('#appShell').classList.toggle('has-completion', !completionPanel.hidden);
    if (completionPanel.hidden) return;
    completionPanel.replaceChildren();
    const result = workoutComparison(records, state.completion);
    completionPanel.append(el('p', 'eyebrow', 'All done 🐌'), el('h1', null, state.completion.name));
    const stats = el('dl', 'completion-stats');
    const stat = (label, value) => { const item = el('div'); item.append(el('dt', null, label), el('dd', null, value)); stats.append(item); };
    stat('Today', `${number.format(result.current.value)} kg`);
    stat('Last workout', result.previous ? `${number.format(result.previous.value)} kg` : '—');
    stat('Change', result.delta === null ? '—' : `${result.delta > 0 ? '+' : ''}${number.format(result.delta)} kg${result.percent === null ? '' : ` (${result.percent > 0 ? '+' : ''}${number.format(result.percent)} %)`}`);
    completionPanel.append(stats, el('p', 'completion-meta', `${result.current.sets} sets · volume = kg × reps`));
    if (!result.previous) completionPanel.append(el('p', 'completion-meta', 'Your next workout will have a comparison.'));
    const chart = el('div', 'completion-chart'); chart.setAttribute('aria-label', 'Workout volume over time for this preset');
    const max = Math.max(1, ...result.series.map((point) => point.value));
    result.series.forEach((point) => {
      const bar = el('div', 'completion-bar');
      const fill = el('span', point.id === state.completion.id ? 'bar-fill is-latest' : 'bar-fill');
      fill.style.height = `${Math.max(2, point.value / max * 100)}%`;
      const track = el('div', 'bar-track'); track.append(fill);
      bar.append(el('strong', null, `${number.format(point.value)} kg`), track, el('span', null, date.format(new Date(point.date))));
      chart.append(bar);
    });
    completionPanel.append(chart, button('Done', 'primary-button', () => { state.completion = null; save(); renderCompletion(records); }));
  }
  renderSettings();
  return {
    renderSets,
    recorded(active) {
      if (!state.restEnabled) return;
      state.rest = { workoutId: active.id, endAt: Date.now() + state.restSeconds * 1000, total: state.restSeconds };
      save(); renderRest();
    },
    render(active, records) { currentId = active?.id || null; renderRest(); renderCompletion(records); },
    finish(active, records) {
      clearUndo(); state.rest = null;
      state.completion = { id: active.id, presetId: active.presetId, name: active.name, finishedAt: new Date().toISOString() };
      save(); currentId = null; renderRest(); renderCompletion(records);
    },
    start() { clearUndo(); state.rest = null; state.completion = null; state.drafts = {}; save(); },
    getState: () => normaliseTraining(state),
    importBackup(text) { state = mergeTraining(state, JSON.parse(text)?.training); save(); renderSettings(); },
  };
}
