import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  FIRST_VISIT_STORAGE_KEY,
  PRESET_STORAGE_KEY,
  cleanExerciseName,
  createStarterPresets,
  markExerciseDone,
  normaliseActiveWorkout,
  normalisePreset,
  normalisePresets,
  parsePresetBackup,
  startWorkout,
} from './presets.js?v=3';
import { swapRs } from './w-speech.js';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createWorkoutController({
  formatRecord,
  onLogExercise,
  onShowView,
  onToast,
}) {
  const firstVisitCard = document.querySelector('#firstVisitCard');
  const activePanel = document.querySelector('#activeWorkoutPanel');
  const activeName = document.querySelector('#activeWorkoutName');
  const activeMeta = document.querySelector('#activeWorkoutMeta');
  const activeProgress = document.querySelector('#activeWorkoutProgress');
  const activeList = document.querySelector('#activeExerciseList');
  const presetList = document.querySelector('#presetList');
  const presetEditor = document.querySelector('#presetEditor');
  const presetEditorTitle = document.querySelector('#presetEditorTitle');
  const presetForm = document.querySelector('#presetForm');
  const presetNameInput = document.querySelector('#presetNameInput');
  const presetExerciseInput = document.querySelector('#presetExerciseInput');
  const presetDraftList = document.querySelector('#presetDraftList');

  let records = [];
  let active = loadActive();
  let presets = loadPresets();
  let draftExercises = [];
  let editingPresetId = null;
  let firstVisit = read(FIRST_VISIT_STORAGE_KEY) !== 'seen';

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      onToast('Storage is full. Export a backup.');
      return false;
    }
  }

  function loadPresets() {
    const raw = read(PRESET_STORAGE_KEY);
    if (raw === null) {
      const starters = createStarterPresets();
      try {
        localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(starters));
      } catch {
        // The page remains usable even when storage is unavailable.
      }
      return starters;
    }

    try {
      return normalisePresets(JSON.parse(raw));
    } catch {
      return createStarterPresets();
    }
  }

  function loadActive() {
    try {
      return normaliseActiveWorkout(JSON.parse(
        read(ACTIVE_WORKOUT_STORAGE_KEY) || 'null',
      ));
    } catch {
      return null;
    }
  }

  function savePresets() {
    store(PRESET_STORAGE_KEY, presets);
  }

  function saveActive() {
    if (active) {
      store(ACTIVE_WORKOUT_STORAGE_KEY, active);
      return;
    }
    try {
      localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    } catch {
      onToast('Storage is unavailable.');
    }
  }

  function markWelcomeSeen() {
    firstVisit = false;
    firstVisitCard.hidden = true;
    try {
      localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    } catch {
      // A repeated welcome is harmless when storage is unavailable.
    }
  }

  function makePresetCard(preset) {
    const card = element('article', 'preset-card');
    const copy = element('div', 'preset-card-copy');
    copy.append(
      element('span', 'preset-kicker', `${preset.exercises.length} exercises`),
      element('h2', null, preset.name),
    );

    const exercises = element('div', 'exercise-pills');
    preset.exercises.forEach((exercise) => {
      exercises.append(element('span', null, exercise));
    });

    const actions = element('div', 'preset-actions');
    const start = element('button', 'start-workout-button', 'Start workout');
    start.type = 'button';
    start.addEventListener('click', () => startPreset(preset));

    const edit = element('button', 'mini-button', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${preset.name}`);
    edit.addEventListener('click', () => openEditor(preset));

    const remove = element('button', 'mini-button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete ${preset.name}`);
    remove.addEventListener('click', () => deletePreset(preset));

    actions.append(start, edit, remove);
    card.append(copy, exercises, actions);
    return card;
  }

  function renderPresets() {
    presetList.replaceChildren();
    if (!presets.length) {
      const blank = element('div', 'blank-card');
      const image = document.createElement('img');
      image.src = '/snail.svg';
      image.alt = '';
      blank.append(
        image,
        element('strong', null, 'No presets yet.'),
        element('span', null, 'Make one from your favorite exercises.'),
      );
      presetList.append(blank);
      return;
    }
    presets.forEach((preset) => presetList.append(makePresetCard(preset)));
  }

  function renderActive() {
    activePanel.hidden = !active;
    if (!active) return;

    const completed = active.exercises.filter((exercise) => exercise.completedSetIds.length).length;
    activeName.textContent = active.name;
    activeMeta.textContent = `${completed} of ${active.exercises.length} exercises started`;
    activeProgress.style.width = `${(completed / active.exercises.length) * 100}%`;
    activeList.replaceChildren();

    active.exercises.forEach((exercise) => {
      const row = element('button', 'workout-exercise-row');
      row.type = 'button';
      if (exercise.completedSetIds.length) row.classList.add('is-done');

      const status = element('span', 'workout-exercise-status', exercise.completedSetIds.length ? '✓' : '○');
      status.setAttribute('aria-hidden', 'true');

      const copy = element('span', 'workout-exercise-copy');
      copy.append(
        element('strong', null, exercise.name),
        element(
          'small',
          null,
          exercise.previous ? `Last time: ${formatRecord(exercise.previous)}` : 'No previous set yet',
        ),
      );

      const count = element(
        'span',
        'workout-set-count',
        exercise.completedSetIds.length
          ? `${exercise.completedSetIds.length} ${exercise.completedSetIds.length === 1 ? 'set' : 'sets'}`
          : 'Log set',
      );

      row.append(status, copy, count);
      row.addEventListener('click', () => {
        markWelcomeSeen();
        onLogExercise({ name: exercise.name, previous: exercise.previous });
      });
      activeList.append(row);
    });
  }

  function renderDraft() {
    presetDraftList.replaceChildren();
    if (!draftExercises.length) {
      presetDraftList.append(element('p', 'draft-empty', 'Add at least one exercise.'));
      return;
    }

    draftExercises.forEach((exercise, index) => {
      const row = element('div', 'draft-exercise');
      row.append(element('span', null, `${index + 1}. ${exercise}`));
      const remove = element('button', 'mini-button', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${exercise}`);
      remove.addEventListener('click', () => {
        draftExercises.splice(index, 1);
        renderDraft();
      });
      row.append(remove);
      presetDraftList.append(row);
    });
  }

  function render(nextRecords = records) {
    records = Array.isArray(nextRecords) ? nextRecords : [];
    firstVisitCard.hidden = !firstVisit;
    renderPresets();
    renderActive();
    if (!presetEditor.hidden) renderDraft();
  }

  function openEditor(preset = null) {
    markWelcomeSeen();
    editingPresetId = preset?.id || null;
    presetEditorTitle.textContent = preset ? 'Edit preset' : 'New preset';
    presetNameInput.value = preset?.name || '';
    presetExerciseInput.value = '';
    draftExercises = [...(preset?.exercises || [])];
    presetEditor.hidden = false;
    renderDraft();
    presetEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    presetNameInput.focus();
  }

  function closeEditor() {
    presetEditor.hidden = true;
    editingPresetId = null;
    draftExercises = [];
    presetForm.reset();
  }

  function addDraftExercise() {
    const exercise = cleanExerciseName(presetExerciseInput.value);
    if (!exercise) {
      onToast('Type an exercise first.');
      return;
    }
    if (draftExercises.some((item) => item.toLocaleLowerCase() === exercise.toLocaleLowerCase())) {
      onToast('That exercise is already in this preset.');
      return;
    }
    if (draftExercises.length >= 20) {
      onToast('A preset can hold up to 20 exercises.');
      return;
    }
    draftExercises.push(exercise);
    presetExerciseInput.value = '';
    renderDraft();
    presetExerciseInput.focus();
  }

  function savePreset(event) {
    event.preventDefault();
    const existing = presets.find((preset) => preset.id === editingPresetId);
    const preset = normalisePreset({
      id: existing?.id,
      name: presetNameInput.value,
      exercises: draftExercises,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    if (!preset) {
      onToast('Add a name and at least one exercise.');
      return;
    }

    presets = existing
      ? presets.map((item) => item.id === existing.id ? preset : item)
      : [preset, ...presets];
    savePresets();
    closeEditor();
    render();
    onToast(existing ? 'Preset updated.' : 'Preset saved.');
  }

  function deletePreset(preset) {
    if (!window.confirm(swapRs(`Delete the ${preset.name} preset?`))) return;
    presets = presets.filter((item) => item.id !== preset.id);
    savePresets();
    render();
    onToast('Preset removed.');
  }

  function startPreset(preset) {
    if (active && !window.confirm(swapRs(`Replace the active ${active.name} workout?`))) return;
    active = startWorkout(preset, records);
    saveActive();
    markWelcomeSeen();
    closeEditor();
    render();
    onShowView('workouts');
    onToast('Workout started 🐌');
  }

  function finishWorkout() {
    if (!active || !window.confirm(swapRs(`Finish the ${active.name} workout?`))) return;
    active = null;
    saveActive();
    render();
    onToast('Workout finished. Nice crawl!');
  }

  function recordSaved(record) {
    if (!active) return;
    const updated = markExerciseDone(active, record);
    if (updated === active) return;
    active = updated;
    saveActive();
    render();
  }

  function previewImport(text) {
    return parsePresetBackup(text);
  }

  function importFromBackup(text) {
    const importedPresets = parsePresetBackup(text);
    if (importedPresets === null) return false;
    presets = importedPresets;
    active = null;
    savePresets();
    saveActive();
    closeEditor();
    render();
    return true;
  }

  document.querySelector('#newPresetButton').addEventListener('click', () => openEditor());
  document.querySelector('#cancelPresetButton').addEventListener('click', closeEditor);
  document.querySelector('#addPresetExerciseButton').addEventListener('click', addDraftExercise);
  document.querySelector('#finishWorkoutButton').addEventListener('click', finishWorkout);
  document.querySelector('#dismissFirstVisitButton').addEventListener('click', markWelcomeSeen);
  presetExerciseInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDraftExercise();
  });
  presetForm.addEventListener('submit', savePreset);

  return Object.freeze({
    getPresets: () => presets.map((preset) => ({ ...preset, exercises: [...preset.exercises] })),
    importFromBackup,
    previewImport,
    recordSaved,
    render,
    shouldShowFirstVisit: () => firstVisit,
  });
}
