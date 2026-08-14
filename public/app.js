import {
  STORAGE_KEY,
  WORKOUT_TYPES,
  aggregateSeries,
  calculateStreak,
  localDayKey,
  normaliseRecord,
  parseBackup,
  serialiseBackup,
  sortRecords,
  todaySummary,
} from './data.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

const form = $('#setForm');
const exerciseInput = $('#exerciseInput');
const typeSelect = $('#typeSelect');
const dateInput = $('#dateInput');
const progressExercise = $('#progressExercise');
const progressMetric = $('#progressMetric');
const historyFilter = $('#historyFilter');
const toast = $('#toast');

let records = loadRecords();
let editingId = null;
let toastTimer;
let installPrompt;

function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return sortRecords(parsed.map(normaliseRecord).filter(Boolean));
  } catch {
    return [];
  }
}

function persist() {
  records = sortRecords(records);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    showToast('Storage is full. Export a backup.');
  }
}

function toLocalInputValue(date = new Date()) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function uniqueExercises() {
  return [...new Set(records.map((record) => record.exercise))]
    .sort((a, b) => a.localeCompare(b));
}

function formatSet(record) {
  if (record.type === 'strength') {
    return `${numberFormat.format(record.weight)} kg × ${record.reps}`;
  }
  if (record.type === 'reps') return `${record.reps} reps`;
  if (record.type === 'duration') return `${numberFormat.format(record.duration / 60)} min`;
  return `${numberFormat.format(record.distance)} km`;
}

function formatValue(value, metric) {
  const config = Object.values(WORKOUT_TYPES)
    .flatMap((type) => type.metrics)
    .find((item) => item.value === metric);
  return `${numberFormat.format(value)} ${config?.unit || ''}`.trim();
}

function updateMetricFields() {
  const activeFields = WORKOUT_TYPES[typeSelect.value].fields;
  $$('.metric-field').forEach((field) => {
    const active = activeFields.includes(field.dataset.field);
    field.hidden = !active;
    const input = $('input', field);
    input.required = active;
  });
}

function setSelectOptions(select, values, allLabel = null) {
  const selected = select.value;
  select.replaceChildren();

  if (allLabel) {
    const option = document.createElement('option');
    option.value = 'all';
    option.textContent = allLabel;
    select.append(option);
  }

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  if ([...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  }
}

function makeBlank(title, copy) {
  const blank = document.createElement('div');
  blank.className = 'blank-card';

  const image = document.createElement('img');
  image.src = '/snail.svg';
  image.alt = '';

  const strong = document.createElement('strong');
  strong.textContent = title;

  const span = document.createElement('span');
  span.textContent = copy;

  blank.append(image, strong, span);
  return blank;
}

function makeSetItem(record, includeActions = true) {
  const item = document.createElement('article');
  item.className = 'set-item';

  const shell = document.createElement('span');
  shell.className = 'set-shell';
  shell.setAttribute('aria-hidden', 'true');
  shell.textContent = '◎';

  const copy = document.createElement('div');
  copy.className = 'set-copy';

  const title = document.createElement('strong');
  title.textContent = record.exercise;

  const result = document.createElement('span');
  result.textContent = formatSet(record);

  const meta = document.createElement('small');
  const date = new Date(record.date);
  meta.textContent = `${shortDateFormat.format(date)} · ${timeFormat.format(date)}${record.notes ? ` · ${record.notes}` : ''}`;

  copy.append(title, result, meta);
  item.append(shell, copy);

  if (includeActions) {
    const actions = document.createElement('div');
    actions.className = 'set-actions';

    const edit = document.createElement('button');
    edit.className = 'mini-button';
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit ${record.exercise} set`);
    edit.addEventListener('click', () => editRecord(record.id));

    const remove = document.createElement('button');
    remove.className = 'mini-button';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Delete ${record.exercise} set`);
    remove.addEventListener('click', () => deleteRecord(record.id));

    actions.append(edit, remove);
    item.append(actions);
  }

  return item;
}

function renderSummary() {
  const summary = todaySummary(records);
  $('#todaySets').textContent = summary.sets;
  $('#todayExercises').textContent = summary.exercises;
  $('#todayVolume').textContent = numberFormat.format(summary.volume);
  $('#streakCount').textContent = calculateStreak(records);
}

function renderRecent() {
  const list = $('#recentList');
  list.replaceChildren();
  if (!records.length) {
    list.append(makeBlank('No sets yet.', 'Your first little track starts here.'));
    return;
  }
  records.slice(0, 4).forEach((record) => list.append(makeSetItem(record)));
}

function renderExerciseControls() {
  const exercises = uniqueExercises();
  setSelectOptions(progressExercise, exercises);
  setSelectOptions(historyFilter, exercises, 'All exercises');

  $$('#exerciseOptions option[data-user]').forEach((option) => option.remove());
  exercises.forEach((exercise) => {
    const option = document.createElement('option');
    option.value = exercise;
    option.dataset.user = 'true';
    $('#exerciseOptions').append(option);
  });

  if (!exercises.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Log your first set';
    progressExercise.append(option);
  }

  updateProgressMetrics();
}

function updateProgressMetrics() {
  const exerciseRecords = records.filter((record) => record.exercise === progressExercise.value);
  const type = exerciseRecords[0]?.type || 'strength';
  const previous = progressMetric.value;
  progressMetric.replaceChildren();

  WORKOUT_TYPES[type].metrics.forEach((metric) => {
    const option = document.createElement('option');
    option.value = metric.value;
    option.textContent = metric.label;
    progressMetric.append(option);
  });

  if ([...progressMetric.options].some((option) => option.value === previous)) {
    progressMetric.value = previous;
  }

  renderProgress();
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderChart(series) {
  const svg = $('#progressChart');
  const empty = $('#chartEmpty');
  svg.replaceChildren();

  if (!series.length) {
    svg.hidden = true;
    empty.hidden = false;
    return;
  }

  svg.hidden = false;
  empty.hidden = true;

  const width = 720;
  const height = 300;
  const left = 52;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.1, 1);
  const yMin = Math.max(0, min - spread * 0.35);
  const yMax = max + spread * 0.35;

  const xAt = (index) => series.length === 1
    ? left + chartWidth / 2
    : left + (index / (series.length - 1)) * chartWidth;
  const yAt = (value) => top + chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;

  const defs = svgElement('defs');
  const gradient = svgElement('linearGradient', { id: 'chartGradient', x1: '0', x2: '0', y1: '0', y2: '1' });
  gradient.append(
    svgElement('stop', { offset: '0%', 'stop-color': '#e278a3', 'stop-opacity': '.28' }),
    svgElement('stop', { offset: '100%', 'stop-color': '#e278a3', 'stop-opacity': '0' }),
  );
  defs.append(gradient);
  svg.append(defs);

  for (let index = 0; index <= 4; index += 1) {
    const y = top + (index / 4) * chartHeight;
    svg.append(svgElement('line', {
      class: 'chart-grid',
      x1: left,
      x2: width - right,
      y1: y,
      y2: y,
    }));
  }

  const points = series.map((point, index) => [xAt(index), yAt(point.value)]);
  const polylinePoints = points.map(([x, y]) => `${x},${y}`).join(' ');
  const areaPath = `M ${points[0][0]} ${top + chartHeight} L ${polylinePoints.replaceAll(' ', ' L ')} L ${points.at(-1)[0]} ${top + chartHeight} Z`;

  svg.append(svgElement('path', { class: 'chart-area', d: areaPath }));
  svg.append(svgElement('polyline', { class: 'chart-line', points: polylinePoints }));

  points.forEach(([x, y]) => {
    svg.append(svgElement('circle', { class: 'chart-point', cx: x, cy: y, r: 6 }));
  });

  [0, 2, 4].forEach((index) => {
    const value = yMax - (index / 4) * (yMax - yMin);
    const label = svgElement('text', {
      class: 'chart-label',
      x: left - 10,
      y: top + (index / 4) * chartHeight + 5,
      'text-anchor': 'end',
    });
    label.textContent = numberFormat.format(value);
    svg.append(label);
  });

  const dateIndexes = series.length === 1 ? [0] : [0, series.length - 1];
  dateIndexes.forEach((index) => {
    const label = svgElement('text', {
      class: 'chart-label',
      x: xAt(index),
      y: height - 16,
      'text-anchor': index === 0 && series.length > 1 ? 'start' : index === series.length - 1 ? 'end' : 'middle',
    });
    label.textContent = shortDateFormat.format(new Date(`${series[index].day}T12:00:00`));
    svg.append(label);
  });
}

function renderProgress() {
  const exercise = progressExercise.value;
  const metric = progressMetric.value || 'weight';
  const exerciseRecords = records.filter((record) => record.exercise === exercise);
  const series = aggregateSeries(records, exercise, metric);
  const latest = series.at(-1)?.value;
  const best = series.length ? Math.max(...series.map((point) => point.value)) : null;
  const first = series[0]?.value;
  const change = first && latest !== undefined ? ((latest - first) / first) * 100 : null;

  $('#latestValue').textContent = latest === undefined ? '—' : formatValue(latest, metric);
  $('#bestValue').textContent = best === null ? '—' : formatValue(best, metric);
  $('#changeValue').textContent = change === null
    ? '—'
    : `${change > 0 ? '+' : ''}${numberFormat.format(change)}%`;
  $('#totalSets').textContent = exerciseRecords.length;

  if (change > 0) {
    $('#progressNudge').textContent = `Up ${numberFormat.format(change)}% from your first logged day.`;
  } else if (series.length > 1) {
    $('#progressNudge').textContent = 'Consistency is progress too. Keep crawling.';
  } else {
    $('#progressNudge').textContent = 'Your graph grows with every set.';
  }

  renderChart(series);
}

function renderHistory() {
  const list = $('#historyList');
  list.replaceChildren();
  const filter = historyFilter.value;
  const visible = filter === 'all'
    ? records
    : records.filter((record) => record.exercise === filter);

  $('#recordCount').textContent = `${visible.length} ${visible.length === 1 ? 'set' : 'sets'}`;

  if (!visible.length) {
    list.append(makeBlank('Nothing here yet.', 'Log a set and it will stay on this trail.'));
    return;
  }

  let currentDay = '';
  visible.forEach((record) => {
    const day = localDayKey(record.date);
    if (day !== currentDay) {
      currentDay = day;
      const heading = document.createElement('h3');
      heading.className = 'history-day';
      heading.textContent = longDateFormat.format(new Date(record.date));
      list.append(heading);
    }
    list.append(makeSetItem(record));
  });
}

function renderAll() {
  renderSummary();
  renderRecent();
  renderExerciseControls();
  renderHistory();
}

function resetForm({ preserveExercise = true } = {}) {
  const exercise = preserveExercise ? exerciseInput.value : '';
  const type = preserveExercise ? typeSelect.value : 'strength';
  form.reset();
  exerciseInput.value = exercise;
  typeSelect.value = type;
  dateInput.value = toLocalInputValue();
  editingId = null;
  $('#saveButtonLabel').textContent = 'Save set';
  $('#cancelEditButton').hidden = true;
  updateMetricFields();
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  editingId = id;
  exerciseInput.value = record.exercise;
  typeSelect.value = record.type;
  $('#weightInput').value = record.weight ?? '';
  $('#repsInput').value = record.reps ?? '';
  $('#durationInput').value = record.duration ? record.duration / 60 : '';
  $('#distanceInput').value = record.distance ?? '';
  $('#notesInput').value = record.notes;
  dateInput.value = toLocalInputValue(new Date(record.date));
  $('#saveButtonLabel').textContent = 'Update set';
  $('#cancelEditButton').hidden = false;
  updateMetricFields();
  showView('log');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  exerciseInput.focus();
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record || !window.confirm(`Delete this ${record.exercise} set?`)) return;
  records = records.filter((item) => item.id !== id);
  persist();
  if (editingId === id) resetForm({ preserveExercise: false });
  renderAll();
  showToast('Set removed.');
}

function showView(name) {
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });

  $$('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === name;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });

  history.replaceState(null, '', `#${name}`);
  if (name === 'progress') renderProgress();
  if (name === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const parsedInputDate = new Date(dateInput.value);
  if (Number.isNaN(parsedInputDate.getTime())) {
    showToast('Choose a valid date and time.');
    return;
  }

  const existing = records.find((record) => record.id === editingId);
  const candidate = normaliseRecord({
    id: editingId || undefined,
    exercise: exerciseInput.value,
    type: typeSelect.value,
    date: parsedInputDate.toISOString(),
    weight: $('#weightInput').value,
    reps: $('#repsInput').value,
    duration: $('#durationInput').value ? Number($('#durationInput').value) * 60 : null,
    distance: $('#distanceInput').value,
    notes: $('#notesInput').value,
    createdAt: existing?.createdAt,
  });

  if (!candidate) {
    showToast('Check the exercise and set details.');
    return;
  }

  if (editingId) {
    records = records.map((record) => record.id === editingId ? candidate : record);
    showToast('Set updated 🐌');
  } else {
    records.push(candidate);
    showToast('Set saved 🐌');
  }

  persist();
  resetForm();
  renderAll();
});

typeSelect.addEventListener('change', updateMetricFields);
$('#cancelEditButton').addEventListener('click', () => resetForm({ preserveExercise: false }));
progressExercise.addEventListener('change', updateProgressMetrics);
progressMetric.addEventListener('change', renderProgress);
historyFilter.addEventListener('change', renderHistory);

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});

$('#exportButton').addEventListener('click', () => {
  const blob = new Blob([serialiseBackup(records)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `schneggen-twerkout-${localDayKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported.');
});

$('#importInput').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const imported = parseBackup(await file.text());
    if (!window.confirm(`Replace this browser’s ${records.length} sets with ${imported.length} imported sets?`)) {
      return;
    }
    records = imported;
    persist();
    renderAll();
    showToast('Backup imported.');
  } catch (error) {
    showToast(error.message || 'That backup could not be read.');
  } finally {
    event.target.value = '';
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('#installButton').hidden = false;
});

$('#installButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installButton').hidden = true;
});

window.addEventListener('appinstalled', () => {
  $('#installButton').hidden = true;
  showToast('Installed. Tiny victory!');
});

dateInput.value = toLocalInputValue();
updateMetricFields();
renderAll();

const initialView = ['log', 'progress', 'history'].includes(location.hash.slice(1))
  ? location.hash.slice(1)
  : 'log';
showView(initialView);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
