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
  reviseActiveWorkout,
  startWorkout,
} from './presets.js?v=12';
import {
  WEEKDAYS,
  WORKOUT_PLAN_STORAGE_KEY,
  mergeWorkoutPlans,
  normaliseWorkoutPlan,
  parseWorkoutPlanBackup,
  reconcileWorkoutPlan,
  suggestWorkoutPreset,
} from './plans.js?v=12';

import { attachReorderHandle } from './reorder.js?v=12';
import { createSessionUI } from './session-ui.js?v=12';
import { setSlots } from './training.js?v=12';

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
const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
const cloneExercise = (exercise) => ({
  id: exercise.id,
  name: exercise.name,
  sets: exercise.sets.map((set) => ({ ...set })),
});

export function createWorkoutController({
  formatRecord,
  onLogExercise,
  onShowView,
  onToast,
  onSessionChange = () => {},
  onSaveWorkoutSet,
  onEditRecord,
  storage = globalThis.localStorage,
}) {
  const firstVisitCard = document.querySelector('#firstVisitCard');
  const activePanel = document.querySelector('#activeWorkoutPanel');
  const activeName = document.querySelector('#activeWorkoutName');
  const activeMeta = document.querySelector('#activeWorkoutMeta');
  const activeProgress = document.querySelector('#activeWorkoutProgress');
  const activeList = document.querySelector('#activeExerciseList');
  const suggestedCard = document.querySelector('#suggestedWorkoutCard');
  const suggestedLabel = document.querySelector('#suggestedWorkoutLabel');
  const suggestedName = document.querySelector('#suggestedWorkoutName');
  const suggestedMeta = document.querySelector('#suggestedWorkoutMeta');
  const startSuggestedButton = document.querySelector('#startSuggestedWorkoutButton');
  const workoutPlanPanel = document.querySelector('#workoutPlanPanel');
  const workoutPlanForm = document.querySelector('#workoutPlanForm');
  const workoutPlanMode = document.querySelector('#workoutPlanMode');
  const weekdayPlanFields = document.querySelector('#weekdayPlanFields');
  const rotationPlanFields = document.querySelector('#rotationPlanFields');
  const rotationPlanList = document.querySelector('#rotationPlanList');
  const presetList = document.querySelector('#presetList');
  const presetEditor = document.querySelector('#presetEditor');
  const presetEditorTitle = document.querySelector('#presetEditorTitle');
  const presetForm = document.querySelector('#presetForm');
  const presetNameInput = document.querySelector('#presetNameInput');
  const presetExerciseInput = document.querySelector('#presetExerciseInput');
  const presetExerciseSuggestions = document.querySelector('#presetExerciseSuggestions');
  const presetDraftList = document.querySelector('#presetDraftList');

  let records = [];
  let presets = loadPresets();
  let active = loadActive();
  let workoutPlan = loadWorkoutPlan();
  let planDraft = normaliseWorkoutPlan(workoutPlan);
  let rotationOrder = orderedPresetIds(planDraft);
  let draftExercises = [];
  let editingPresetId = null;
  let editingWorkout = false;
  let firstVisit = read(FIRST_VISIT_STORAGE_KEY) !== 'seen';
  const trainingUI = createSessionUI({
    storage, onSave: onSaveWorkoutSet, onEdit: onEditRecord, onToast,
    onOther(exercise) { const context = exerciseContext(exercise); if (context) onLogExercise({ ...context, openDetails: true }); },
  });

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

  function loadWorkoutPlan() {
    try {
      return reconcileWorkoutPlan(JSON.parse(
        read(WORKOUT_PLAN_STORAGE_KEY) || 'null',
      ), presets);
    } catch {
      return normaliseWorkoutPlan();
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

  function saveWorkoutPlan() {
    store(WORKOUT_PLAN_STORAGE_KEY, workoutPlan);
  }

  function orderedPresetIds(plan = planDraft) {
    const available = new Set(presets.map(({ id }) => id));
    return [
      ...plan.rotation.filter((presetId) => available.has(presetId)),
      ...presets.map(({ id }) => id).filter((presetId) => !plan.rotation.includes(presetId)),
    ];
  }

  function resetPlanDraft() {
    planDraft = reconcileWorkoutPlan(workoutPlan, presets);
    rotationOrder = orderedPresetIds(planDraft);
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

  function currentSuggestion() {
    if (active) return null;
    return suggestWorkoutPreset({ presets, plan: workoutPlan, records });
  }

  function renderSuggestedWorkout() {
    const suggestion = currentSuggestion();
    suggestedCard.hidden = !suggestion;
    if (!suggestion) return;
    suggestedLabel.textContent = suggestion.label;
    suggestedName.textContent = suggestion.preset.name;
    suggestedMeta.textContent = `${suggestion.preset.exercises.length} exercises`;
  }

  function presetSelect(selectedId = '') {
    const select = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Rest';
    select.append(empty);
    presets.forEach((preset) => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      select.append(option);
    });
    select.value = selectedId;
    return select;
  }

  function renderWeekdayPlan() {
    weekdayPlanFields.replaceChildren();
    WEEKDAYS.forEach(({ value: day, label }) => {
      const row = element('label', 'plan-day-row');
      row.append(element('span', null, label));
      const select = presetSelect(planDraft.weekdays[day]);
      select.dataset.day = String(day);
      select.setAttribute('aria-label', `${label} workout`);
      select.addEventListener('change', () => {
        const weekdays = { ...planDraft.weekdays };
        if (select.value) weekdays[day] = select.value;
        else delete weekdays[day];
        planDraft = { ...planDraft, weekdays };
      });
      row.append(select);
      weekdayPlanFields.append(row);
    });
  }

  function movePlanPreset(index, offset) {
    const next = index + offset;
    if (next < 0 || next >= rotationOrder.length) return;
    [rotationOrder[index], rotationOrder[next]] = [rotationOrder[next], rotationOrder[index]];
    const selected = new Set(planDraft.rotation);
    planDraft = { ...planDraft, rotation: rotationOrder.filter((id) => selected.has(id)) };
    renderWorkoutPlan();
  }

  function renderRotationPlan() {
    rotationPlanList.replaceChildren();
    if (!presets.length) {
      rotationPlanList.append(element('p', 'draft-empty', 'Create a preset first.'));
      return;
    }
    rotationOrder.forEach((presetId, index) => {
      const preset = presets.find(({ id }) => id === presetId);
      if (!preset) return;
      const row = element('div', 'plan-rotation-row');
      const choice = element('label', 'plan-rotation-choice');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = planDraft.rotation.includes(presetId);
      checkbox.setAttribute('aria-label', `Include ${preset.name}`);
      checkbox.addEventListener('change', () => {
        const selected = new Set(planDraft.rotation);
        if (checkbox.checked) selected.add(presetId);
        else selected.delete(presetId);
        planDraft = { ...planDraft, rotation: rotationOrder.filter((id) => selected.has(id)) };
      });
      choice.append(checkbox, element('strong', null, preset.name));

      const actions = element('div', 'plan-rotation-actions');
      const up = element('button', 'mini-button', '\u2191');
      up.type = 'button';
      up.disabled = index === 0;
      up.setAttribute('aria-label', `Move ${preset.name} up`);
      up.addEventListener('click', () => movePlanPreset(index, -1));
      const down = element('button', 'mini-button', '\u2193');
      down.type = 'button';
      down.disabled = index === rotationOrder.length - 1;
      down.setAttribute('aria-label', `Move ${preset.name} down`);
      down.addEventListener('click', () => movePlanPreset(index, 1));
      actions.append(up, down);
      row.append(choice, actions);
      rotationPlanList.append(row);
    });
  }

  function renderWorkoutPlan() {
    workoutPlanMode.value = planDraft.mode;
    const rotation = planDraft.mode === 'rotation';
    weekdayPlanFields.hidden = rotation;
    rotationPlanFields.hidden = !rotation;
    renderWeekdayPlan();
    renderRotationPlan();
  }

  function savePlan(event) {
    event.preventDefault();
    workoutPlan = reconcileWorkoutPlan({
      ...planDraft,
      updatedAt: new Date().toISOString(),
    }, presets);
    saveWorkoutPlan();
    resetPlanDraft();
    render();
    workoutPlanPanel.open = false;
    onToast('Workout plan saved.');
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
    const slots = setSlots(exercise, records);
    const completed = slots.findIndex((slot) => !slot);
    if (completed < 0) return null;
    const plannedSet = exercise.plannedSets[completed] ?? null;
    if (!plannedSet) return null;
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      previous: exercise.previousSets?.[completed] || exercise.previous,
      plannedSet,
      setNumber: completed + 1,
      setIndex: completed,
      totalSets: exercise.plannedSets.length,
      workoutId: active.id,
      presetId: active.presetId,
      workoutName: active.name,
      workoutStartedAt: active.startedAt,
    };
  }

  function renderActive() {
    activePanel.hidden = !active;
    document.querySelector('#sessionBanner').hidden = !active;
    document.querySelector('#appShell').classList.toggle('has-workout', Boolean(active));
    trainingUI.render(active, records);
    if (!active) return;
    const totalSets = active.exercises.reduce((total, exercise) => total + exercise.plannedSets.length, 0);
    const completedSets = active.exercises.reduce((total, exercise) => total + setSlots(exercise, records).filter(Boolean).length, 0);
    activeName.textContent = active.name;
    activeMeta.textContent = `${completedSets} of ${totalSets} sets`;
    activeProgress.style.width = `${totalSets ? completedSets / totalSets * 100 : 0}%`;
    activeList.replaceChildren();
    active.exercises.forEach((exercise, index) => {
      const planned = exercise.plannedSets.length;
      const completed = setSlots(exercise, records).filter(Boolean).length;
      const isDone = completed >= planned;
      const isCurrent = active.selectedExerciseId === exercise.id;
      const card = element('section', 'session-exercise');
      card.dataset.reorderRow = exercise.id;
      const row = element('button', 'workout-exercise-row');
      row.type = 'button';
      row.classList.toggle('is-done', isDone);
      row.classList.toggle('is-current', isCurrent);
      row.setAttribute('aria-expanded', String(isCurrent));
      row.setAttribute('aria-controls', `exercise-body-${index}`);
      const copy = element('span', 'workout-exercise-copy');
      copy.append(element('strong', null, exercise.name), element('small', null, isDone ? 'Done' : isCurrent ? 'Current exercise' : completed ? 'Started' : 'Still to come'));
      row.append(element('span', 'workout-exercise-status', isDone ? '✓' : isCurrent ? '−' : '+'), copy, element('span', 'workout-set-count', `${completed}/${planned}`));
      row.addEventListener('click', () => {
        active.selectedExerciseId = isCurrent ? '' : exercise.id;
        active.updatedAt = new Date().toISOString(); saveActive(); renderActive();
        activeList.children[index]?.querySelector('.workout-exercise-row').focus({ preventScroll: true });
      });
      const body = element('div', 'exercise-body');
      body.id = `exercise-body-${index}`; body.hidden = !isCurrent;
      const controls = element('div', 'session-exercise-controls');
      const handle = element('button', 'mini-button drag-handle', '⠿');
      handle.type = 'button'; handle.setAttribute('aria-label', `Drag ${exercise.name}`);
      attachReorderHandle(handle, card, activeList, moveActiveExercise);
      controls.append(handle);
      for (const [offset, label, symbol] of [[-1, 'up', '↑'], [1, 'down', '↓']]) {
        const move = element('button', 'mini-button', symbol); move.type = 'button';
        move.disabled = index + offset < 0 || index + offset >= active.exercises.length;
        move.setAttribute('aria-label', `${exercise.name} ${label}`);
        move.addEventListener('click', () => moveActiveExercise(index, index + offset)); controls.append(move);
      }
      const add = element('button', 'mini-button', '+ Set'); add.type = 'button';
      add.disabled = planned >= MAX_PRESET_SETS; add.setAttribute('aria-label', `Add set to ${exercise.name}`);
      add.addEventListener('click', () => {
        exercise.plannedSets.push({ ...exercise.plannedSets.at(-1) }); active.selectedExerciseId = exercise.id;
        active.updatedAt = new Date().toISOString(); saveActive(); renderActive();
      });
      controls.append(add);
      if (isCurrent) body.append(trainingUI.renderSets(exercise, active, records));
      card.append(row, controls, body); activeList.append(card);
    });
  }

  function moveActiveExercise(from, to) {
    const [exercise] = active.exercises.splice(from, 1);
    active.exercises.splice(to, 0, exercise);
    active.updatedAt = new Date().toISOString();
    saveActive(); renderActive();
    onToast('Workout order updated.');
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
    const [exercise] = draftExercises.splice(index, 1);
    draftExercises.splice(next, 0, exercise);
    renderDraft();
    presetDraftList.children[next]?.querySelector('.drag-handle')?.focus({ preventScroll: true });
  }

  function renderDraft() {
    presetDraftList.replaceChildren();
    if (!draftExercises.length) {
      presetDraftList.append(element('p', 'draft-empty', 'Add at least one exercise.'));
      return;
    }

    draftExercises.forEach((exercise, exerciseIndex) => {
      const card = element('section', 'draft-exercise');
      card.dataset.reorderRow = exercise.id;
      const heading = element('div', 'draft-exercise-heading');
      const handle = element('button', 'mini-button drag-handle', '⠿');
      handle.type = 'button';
      handle.setAttribute('aria-label', `Drag ${exercise.name}`);
      attachReorderHandle(handle, card, presetDraftList, (from, to) => moveDraftExercise(from, to - from));
      const name = document.createElement('input');
      name.value = exercise.name;
      name.maxLength = 80;
      name.required = true;
      name.className = 'draft-exercise-name';
      name.setAttribute('aria-label', `Exercise ${exerciseIndex + 1} name`);
      name.addEventListener('input', () => { exercise.name = name.value; name.setCustomValidity(''); });
      heading.append(handle, name);
      const runningExercise = editingWorkout ? active.exercises.find(({ id }) => id === exercise.id) : null;
      const loggedCount = runningExercise ? setSlots(runningExercise, records).reduce((last, record, index) => record ? index + 1 : last, 0) : 0;

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
      remove.disabled = loggedCount > 0;
      remove.title = loggedCount ? 'This exercise has logged sets.' : '';
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
        removeSet.disabled = exercise.sets.length === 1 || setIndex < loggedCount;
        removeSet.setAttribute('aria-label', `Remove ${exercise.name} set ${setIndex + 1}`);
        removeSet.addEventListener('click', () => {
          if (exercise.sets.length === 1) return;
          exercise.sets.splice(setIndex, 1);
          renderDraft();
        });
        if (setIndex < loggedCount) {
          row.classList.add('is-logged');
          row.querySelectorAll('input').forEach((input) => { input.disabled = true; });
          row.querySelector('.planned-set-number').textContent = '✓';
        }
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
        presetDraftList.children[exerciseIndex]?.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
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
    renderSuggestedWorkout();
    renderWorkoutPlan();
    renderPresets();
    renderActive();
    if (!presetEditor.hidden) {
      renderSuggestions();
    }
  }

  function openEditor(preset = null, forWorkout = false) {
    markWelcomeSeen();
    editingWorkout = forWorkout;
    onShowView('workouts');
    editingPresetId = preset?.id || null;
    presetEditorTitle.textContent = forWorkout ? 'Edit workout' : preset ? 'Edit preset' : 'New preset';
    document.querySelector('#presetSaveScopeField').hidden = !forWorkout;
    document.querySelector('#presetSaveScope').value = 'workout';
    document.querySelector('#presetSaveLabel').textContent = forWorkout ? 'Save changes' : 'Save preset';
    presetNameInput.value = preset?.name || '';
    presetExerciseInput.value = '';
    draftExercises = (preset?.exercises || []).map(cloneExercise);
    presetEditor.hidden = false;
    document.querySelector('#appShell').classList.add('is-editing-preset');
    renderDraft();
    renderSuggestions();
    presetNameInput.focus({ preventScroll: true });
    presetEditor.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  function closeEditor() {
    presetEditor.hidden = true;
    document.querySelector('#appShell').classList.remove('is-editing-preset');
    presetExerciseSuggestions.hidden = true;
    editingPresetId = null;
    editingWorkout = false;
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
    draftExercises.push({ ...exercise, id: crypto.randomUUID() });
    presetExerciseInput.value = '';
    renderDraft();
    renderSuggestions();
    presetExerciseInput.focus();
  }

  function savePreset(event) {
    event.preventDefault();
    const names = draftExercises.map(({ name }) => exerciseKey(name));
    if (names.some((name) => !name) || new Set(names).size !== names.length) {
      onToast('Give each exercise a different name.');
      return;
    }
    const existing = presets.find((preset) => preset.id === editingPresetId);
    const preset = normalisePreset({
      id: editingWorkout ? active.presetId : existing?.id,
      name: presetNameInput.value,
      exercises: draftExercises,
      createdAt: existing?.createdAt,
      updatedAt: new Date().toISOString(),
    });

    if (!preset) {
      onToast('Add a name and at least one exercise.');
      return;
    }

    if (editingWorkout) {
      try { active = reviseActiveWorkout(active, preset, records); }
      catch (error) { onToast(error.message); return; }
      saveActive();
      if (document.querySelector('#presetSaveScope').value === 'both') {
        presets = existing ? presets.map((item) => item.id === existing.id ? preset : item) : [preset, ...presets];
        savePresets(); resetPlanDraft();
      }
      closeEditor(); render();
      const context = getSelectedContext();
      onSessionChange(context);
      onShowView('log');
      onToast('Workout updated. Logged sets kept.');
      return;
    }

    presets = existing
      ? presets.map((item) => item.id === existing.id ? preset : item)
      : [preset, ...presets];
    savePresets();
    resetPlanDraft();
    closeEditor();
    render();
    onToast(existing ? 'Preset updated.' : 'Preset saved.');
  }

  function deletePreset(preset) {
    if (!window.confirm((`Delete the ${preset.name} preset?`))) return;
    presets = presets.filter((item) => item.id !== preset.id);
    savePresets();
    const reconciled = reconcileWorkoutPlan(workoutPlan, presets);
    if (JSON.stringify(reconciled) !== JSON.stringify(workoutPlan)) {
      workoutPlan = { ...reconciled, updatedAt: new Date().toISOString() };
      saveWorkoutPlan();
    }
    resetPlanDraft();
    render();
    onToast('Preset removed.');
  }

  function startPreset(preset) {
    if (active && !window.confirm((`Replace the active ${active.name} workout?`))) return;
    active = startWorkout(preset, records);
    trainingUI.start();
    saveActive();
    markWelcomeSeen();
    closeEditor();
    render();
    onLogExercise(getSelectedContext());
    onToast('Workout started 🐌');
  }

  function finishWorkout() {
    if (!active || !window.confirm((`Finish the ${active.name} workout?`))) return;
    trainingUI.finish(active, records);
    active = null;
    saveActive();
    onSessionChange(null);
    render();
    onToast('Workout finished.');
    onShowView('log');
    document.querySelector('#completionPanel').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }

  function recordSaved(record) {
    if (!active) return null;
    const updated = markExerciseDone(active, record);
    if (updated === active) return null;
    active = updated;
    trainingUI.recorded(active);
    saveActive();
    render();
    const exercise = active.exercises.find((item) => record.workoutExerciseId ? item.id === record.workoutExerciseId : exerciseKey(item.name) === exerciseKey(record.exercise));
    if (exercise && exerciseContext(exercise)) return exerciseContext(exercise);
    const next = active.exercises.find((item) => item.completedSetIds.length < item.plannedSets.length);
    if (next) { active.selectedExerciseId = next.id; saveActive(); renderActive(); }
    return next ? exerciseContext(next) : null;
  }

  function recordRemoved(id) {
    if (!active) return;
    active.exercises.forEach((exercise) => {
      exercise.completedSetIds = exercise.completedSetIds.filter((savedId) => savedId !== id);
      exercise.done = exercise.completedSetIds.length >= exercise.plannedSets.length;
    });
    active.updatedAt = new Date().toISOString();
    saveActive();
    onSessionChange(getSelectedContext());
  }

  function getSelectedContext() {
    if (!active) return null;
    let exercise = active.exercises.find(({ id }) => id === active.selectedExerciseId);
    if (!exercise || !exerciseContext(exercise)) {
      exercise = active.exercises.find((item) => item.completedSetIds.length < item.plannedSets.length);
      if (exercise) { active.selectedExerciseId = exercise.id; saveActive(); renderActive(); }
    }
    return exercise ? exerciseContext(exercise) : null;
  }

  function editRunningWorkout() {
    if (!active) return;
    openEditor({ id: active.presetId, name: active.name, exercises: active.exercises.map((exercise) => ({ ...exercise, sets: exercise.plannedSets })) }, true);
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
    const importedPlan = parseWorkoutPlanBackup(text);
    const importedActive = normaliseActiveWorkout(JSON.parse(text)?.activeWorkout);
    trainingUI.importBackup(text);
    if (!active && importedActive) { active = importedActive; saveActive(); }
    if (importedPlan) {
      workoutPlan = reconcileWorkoutPlan(
        mergeWorkoutPlans(workoutPlan, importedPlan),
        presets,
      );
      saveWorkoutPlan();
    }
    resetPlanDraft();
    closeEditor();
    render();
    return true;
  }

  document.querySelector('#newPresetButton').addEventListener('click', () => openEditor());
  document.querySelector('#cancelPresetButton').addEventListener('click', closeEditor);
  document.querySelector('#addPresetExerciseButton').addEventListener('click', () => addDraftExercise());
  document.querySelector('#finishWorkoutButton').addEventListener('click', finishWorkout);
  document.querySelector('#editWorkoutButton').addEventListener('click', editRunningWorkout);
  document.querySelector('#sessionOverviewButton').addEventListener('click', () => {
    onShowView('log');
    activePanel.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  });
  document.querySelector('#dismissFirstVisitButton').addEventListener('click', markWelcomeSeen);
  startSuggestedButton.addEventListener('click', () => {
    const suggestion = currentSuggestion();
    if (suggestion) startPreset(suggestion.preset);
  });
  workoutPlanMode.addEventListener('change', () => {
    const mode = workoutPlanMode.value === 'rotation' ? 'rotation' : 'weekday';
    if (mode === 'rotation' && planDraft.rotation.length === 0) {
      planDraft = { ...planDraft, rotation: [...rotationOrder] };
    }
    planDraft = { ...planDraft, mode };
    renderWorkoutPlan();
  });
  workoutPlanForm.addEventListener('submit', savePlan);
  presetExerciseInput.addEventListener('input', renderSuggestions);
  presetExerciseInput.addEventListener('focus', renderSuggestions);
  presetExerciseInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addDraftExercise();
  });
  presetForm.addEventListener('submit', savePreset);

  return Object.freeze({
    getTrainingState: () => trainingUI.getState(),
    getActiveWorkout: () => normaliseActiveWorkout(active),
    getSelectedContext,
    getPresets: () => presets.map((preset) => ({
      ...preset,
      exercises: preset.exercises.map(cloneExercise),
    })),
    getWorkoutPlan: () => normaliseWorkoutPlan(workoutPlan),
    hasActiveWorkout: () => Boolean(active),
    hasSuggestedWorkout: () => Boolean(currentSuggestion()),
    importFromBackup,
    previewImport,
    recordSaved,
    recordRemoved,
    render,
    shouldShowFirstVisit: () => firstVisit,
  });
}
