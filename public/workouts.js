import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  FIRST_VISIT_STORAGE_KEY,
  MAX_PRESET_SETS,
  PRESET_STORAGE_KEY,
  cleanExerciseName,
  createStarterPresets,
  markExerciseDone,
  normaliseActiveWorkout,
  normalisePlannedSet,
  normalisePreset,
  normalisePresetExercise,
  normalisePresets,
  parsePresetBackup,
  startWorkout,
} from './presets.js?v=8';
import { swapRs } from './w-speech.js?v=8';

const EXERCISE_LIBRARY = [
  'Around the World',
  'Bench press',
  'Bent Over Row (Barbell)',
  'Bent Over Row (Dumbbell)',
  'Bicep Curl (Barbell)',
  'Chest Press (Machine)',
  'Deadlift',
  'Hip thrust',
  'Lat Pulldown (Cable)',
  'Lat pulldown',
  'Plank',
  'Running',
  'Shoulder press',
  'Squat',
];

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const exerciseKey = (value) => cleanExerciseName(value).toLocaleLowerCase();
const cloneExercise = (exercise) => ({
  name: exercise.name,
  sets: exercise.sets.map((set) => ({ ...set })),
});

export function createWorkoutController({
  formatRecord,
  onLogExercise,
  onShowView,
  onToast,
  storage = globalThis.localStorage,
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
  const presetExerciseSuggestions = document.querySelector('#presetExerciseSuggestions');
  const presetDraftList = document.querySelector('#presetDraftList');

  let records = [];
  let active = loadActive();
  let presets = loadPresets();
  let draftExercises = [];
  let editingPresetId = null;
  let firstVisit = read(FIRST_VISIT_STORAGE_KEY) !== 'seen';

  function read(key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function store(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
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
        storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(starters));
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
      storage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    } catch {
      onToast('Storage is unavailable.');
    }
  }

  function markWelcomeSeen() {
    firstVisit = false;
    firstVisitCard.hidden = true;
    try {
      storage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
    } catch {
      // A repeated welcome is harmless when storage is unavailable.
    }
  }

  function makePresetCard(preset) {
    const card = element('article', 'preset-card');
    const copy = element('div', 'preset-card-copy');
    const setCount = preset.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    copy.append(
      element('span', 'preset-kicker', `${preset.exercises.length} exercises · ${setCount} sets`),
      element('h2', null, preset.name),
    );

    const exercises = element('div', 'exercise-pills');
    preset.exercises.forEach((exercise) => {
      exercises.append(element('span', null, `${exercise.name} · ${exercise.sets.length}`));
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
      blank.append(image, element('strong', null, 'No presets yet.'));
      presetList.append(blank);
      return;
    }
    presets.forEach((preset) => presetList.append(makePresetCard(preset)));
  }

  function exerciseContext(exercise) {
    const completed = exercise.completedSetIds.length;
    const plannedSet = exercise.plannedSets[completed] ?? null;
    if (!plannedSet) return null;
    return {
      name: exercise.name,
      previous: exercise.previous,
      plannedSet,
      setNumber: completed + 1,
      totalSets: exercise.plannedSets.length,
    };
  }

  function renderActive() {
    activePanel.hidden = !active;
    if (!active) return;

    const totalSets = active.exercises.reduce(
      (total, exercise) => total + exercise.plannedSets.length,
      0,
    );
    const completedSets = active.exercises.reduce(
      (total, exercise) => total + Math.min(exercise.completedSetIds.length, exercise.plannedSets.length),
      0,
    );
    activeName.textContent = active.name;
    activeMeta.textContent = `${completedSets} of ${totalSets} sets`;
    activeProgress.style.width = `${totalSets ? (completedSets / totalSets) * 100 : 0}%`;
    activeList.replaceChildren();

    active.exercises.forEach((exercise) => {
      const planned = exercise.plannedSets.length;
      const completed = Math.min(exercise.completedSetIds.length, planned);
      const isDone = completed >= planned;
      const row = element('button', 'workout-exercise-row');
      row.type = 'button';
      if (isDone) row.classList.add('is-done');

      const status = element('span', 'workout-exercise-status', isDone ? '✓' : '○');
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

      const count = element('span', 'workout-set-count', `${completed}/${planned} sets`);
      row.append(status, copy, count);
      row.disabled = isDone;
      row.addEventListener('click', () => {
        const context = exerciseContext(exercise);
        if (!context) return;
        markWelcomeSeen();
        onLogExercise(context);
      });
      activeList.append(row);
    });
  }

  function updateDraftSet(exerciseIndex, setIndex, field, value) {
    draftExercises[exerciseIndex].sets[setIndex][field] = value;
  }

  function makePlannedInput(exerciseIndex, setIndex, field, value) {
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = field === 'reps' ? 'numeric' : 'decimal';
    input.min = field === 'reps' ? '1' : '0';
    input.max = '100000';
    input.step = field === 'reps' ? '1' : '0.25';
    input.placeholder = '—';
    input.value = value ?? '';
    input.setAttribute('aria-label', `${draftExercises[exerciseIndex].name} set ${setIndex + 1} ${field}`);
    input.addEventListener('input', () => updateDraftSet(exerciseIndex, setIndex, field, input.value));
    return input;
  }

  function moveDraftExercise(index, offset) {
    const next = index + offset;
    if (next < 0 || next >= draftExercises.length) return;
    [draftExercises[index], draftExercises[next]] = [draftExercises[next], draftExercises[index]];
    renderDraft();
  }

  function renderDraft() {
    presetDraftList.replaceChildren();
    if (!draftExercises.length) {
      presetDraftList.append(element('p', 'draft-empty', 'Add at least one exercise.'));
      return;
    }

    draftExercises.forEach((exercise, exerciseIndex) => {
      const card = element('section', 'draft-exercise');
      const heading = element('div', 'draft-exercise-heading');
      heading.append(element('strong', null, `${exerciseIndex + 1}. ${exercise.name}`));

      const actions = element('div', 'draft-exercise-actions');
      const up = element('button', 'mini-button', '↑');
      up.type = 'button';
      up.disabled = exerciseIndex === 0;
      up.setAttribute('aria-label', `Move ${exercise.name} up`);
      up.addEventListener('click', () => moveDraftExercise(exerciseIndex, -1));
      const down = element('button', 'mini-button', '↓');
      down.type = 'button';
      down.disabled = exerciseIndex === draftExercises.length - 1;
      down.setAttribute('aria-label', `Move ${exercise.name} down`);
      down.addEventListener('click', () => moveDraftExercise(exerciseIndex, 1));
      const remove = element('button', 'mini-button', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${exercise.name}`);
      remove.addEventListener('click', () => {
        draftExercises.splice(exerciseIndex, 1);
        renderDraft();
        renderSuggestions();
      });
      actions.append(up, down, remove);
      heading.append(actions);

      const setHead = element('div', 'planned-set-head');
      setHead.append(
        element('span', null, 'Set'),
        element('span', null, 'kg'),
        element('span', null, 'Reps'),
        element('span', null, ''),
      );

      const setList = element('div', 'planned-set-list');
      exercise.sets.forEach((set, setIndex) => {
        const row = element('div', 'planned-set-row');
        row.append(
          element('span', 'planned-set-number', String(setIndex + 1)),
          makePlannedInput(exerciseIndex, setIndex, 'weight', set.weight),
          makePlannedInput(exerciseIndex, setIndex, 'reps', set.reps),
        );
        const removeSet = element('button', 'mini-button planned-set-remove', '×');
        removeSet.type = 'button';
        removeSet.disabled = exercise.sets.length === 1;
        removeSet.setAttribute('aria-label', `Remove ${exercise.name} set ${setIndex + 1}`);
        removeSet.addEventListener('click', () => {
          if (exercise.sets.length === 1) return;
          exercise.sets.splice(setIndex, 1);
          renderDraft();
        });
        row.append(removeSet);
        setList.append(row);
      });

      const addSet = element('button', 'add-planned-set', '+ Set');
      addSet.type = 'button';
      addSet.addEventListener('click', () => {
        if (exercise.sets.length >= MAX_PRESET_SETS) {
          onToast(`Up to ${MAX_PRESET_SETS} sets per exercise.`);
          return;
        }
        exercise.sets.push(normalisePlannedSet());
        renderDraft();
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      card.append(heading, setHead, setList, addSet);
      presetDraftList.append(card);
    });
  }

  function suggestionNames() {
    const seen = new Set();
    return [...records.map((record) => record.exercise), ...EXERCISE_LIBRARY]
      .map(cleanExerciseName)
      .filter((name) => {
        const key = exerciseKey(name);
        if (!name || seen.has(key) || draftExercises.some((exercise) => exerciseKey(exercise.name) === key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function renderSuggestions() {
    presetExerciseSuggestions.replaceChildren();
    if (presetEditor.hidden) {
      presetExerciseSuggestions.hidden = true;
      return;
    }

    const query = cleanExerciseName(presetExerciseInput.value).toLocaleLowerCase();
    const matches = suggestionNames()
      .filter((name) => !query || name.toLocaleLowerCase().includes(query))
      .slice(0, 8);
    presetExerciseSuggestions.hidden = !matches.length;
    matches.forEach((name) => {
      const suggestion = element('button', 'exercise-suggestion', name);
      suggestion.type = 'button';
      suggestion.addEventListener('click', () => addDraftExercise(name));
      presetExerciseSuggestions.append(suggestion);
    });
  }

  function render(nextRecords = records) {
    records = Array.isArray(nextRecords) ? nextRecords : [];
    firstVisitCard.hidden = !firstVisit;
    renderPresets();
    renderActive();
    if (!presetEditor.hidden) {
      renderDraft();
      renderSuggestions();
    }
  }

  function openEditor(preset = null) {
    markWelcomeSeen();
    editingPresetId = preset?.id || null;
    presetEditorTitle.textContent = preset ? 'Edit preset' : 'New preset';
    presetNameInput.value = preset?.name || '';
    presetExerciseInput.value = '';
    draftExercises = (preset?.exercises || []).map(cloneExercise);
    presetEditor.hidden = false;
    renderDraft();
    renderSuggestions();
    presetEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    presetNameInput.focus();
  }

  function closeEditor() {
    presetEditor.hidden = true;
    presetExerciseSuggestions.hidden = true;
    editingPresetId = null;
    draftExercises = [];
    presetForm.reset();
  }

  function addDraftExercise(value = presetExerciseInput.value) {
    const exercise = normalisePresetExercise(value);
    if (!exercise) {
      onToast('Type an exercise first.');
      return;
    }
    if (draftExercises.some((item) => exerciseKey(item.name) === exerciseKey(exercise.name))) {
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
    renderSuggestions();
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
    onToast('Workout finished.');
  }

  function recordSaved(record) {
    if (!active) return null;
    const updated = markExerciseDone(active, record);
    if (updated === active) return null;
    active = updated;
    saveActive();
    render();
    const exercise = active.exercises.find((item) => exerciseKey(item.name) === exerciseKey(record.exercise));
    return exercise ? exerciseContext(exercise) : null;
  }

  function previewImport(text) {
    return parsePresetBackup(text);
  }

  function importFromBackup(text) {
    const importedPresets = parsePresetBackup(text);
    if (importedPresets === null) return true;

    const importedIds = new Set(importedPresets.map((preset) => preset.id));
    const importedNames = new Set(importedPresets.map((preset) => preset.name.toLocaleLowerCase()));
    presets = [
      ...importedPresets,
      ...presets.filter((preset) => (
        !importedIds.has(preset.id) && !importedNames.has(preset.name.toLocaleLowerCase())
      )),
    ];
    savePresets();
    closeEditor();
    render();
    return true;
  }

  document.querySelector('#newPresetButton').addEventListener('click', () => openEditor());
  document.querySelector('#cancelPresetButton').addEventListener('click', closeEditor);
  document.querySelector('#addPresetExerciseButton').addEventListener('click', () => addDraftExercise());
  document.querySelector('#finishWorkoutButton').addEventListener('click', finishWorkout);
  document.querySelector('#dismissFirstVisitButton').addEventListener('click', markWelcomeSeen);
  presetExerciseInput.addEventListener('input', renderSuggestions);
  presetExerciseInput.addEventListener('focus', renderSuggestions);
  presetExerciseInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDraftExercise();
  });
  presetForm.addEventListener('submit', savePreset);

  return Object.freeze({
    getPresets: () => presets.map((preset) => ({
      ...preset,
      exercises: preset.exercises.map(cloneExercise),
    })),
    importFromBackup,
    previewImport,
    recordSaved,
    render,
    shouldShowFirstVisit: () => firstVisit,
  });
}
