export const FEEDBACK_STORAGE_KEY = 'schneggen-feedback-v1';

// Temporary acceptance testing. Removing the UI later must retain stored responses.
export const UAT_CASES = [
  { id: 'preset-edit', title: 'Edit a preset', steps: 'Create or edit a preset. Rename an exercise and add a set. Save and reopen it.', expected: 'The names and planned sets stay saved.' },
  { id: 'reorder', title: 'Move exercises', steps: 'Drag an exercise by its handle, or use the arrows. Save and reopen the preset.', expected: 'The new order stays saved.' },
  { id: 'start', title: 'Start a workout', steps: 'Start a preset and open the first exercise.', expected: 'The workout name, all exercises and 0 completed sets appear immediately.' },
  { id: 'switch', title: 'Machine busy', steps: 'Open a later exercise, log a set, then return to the first exercise.', expected: 'Either exercise can be logged. Progress stays with the right exercise.' },
  { id: 'live-edit', title: 'Change a running workout', steps: 'Log a set. Choose Edit workout, add another set and save for this workout.', expected: 'The logged set remains. The extra set is available; the saved preset stays unchanged.' },
  { id: 'template-edit', title: 'Update the template too', steps: 'Edit a running workout. Choose Workout + preset, save, then open the preset.', expected: 'Both the running workout and the saved preset contain the change.' },
  { id: 'resume', title: 'Resume and previous sets', steps: 'Log a set, reload, then continue the workout.', expected: 'The same workout and progress return. Last-time weight and reps are visible.' },
  { id: 'progress', title: 'Compare progress', steps: 'Open Progress. Switch between Weeks and Preset workouts.', expected: 'Logged weight × reps contributes to the correct totals.' },
  { id: 'schedule', title: 'Suggested workout', steps: 'Assign a preset to today or save a rotation in Workout plan.', expected: 'Today or Up next offers the correct preset.' },
];

export const normaliseFeedback = (items) => (Array.isArray(items) ? items : [])
  .filter((item) => item && typeof item === 'object' && item.id)
  .map((item) => ({
    id: String(item.id).slice(0, 80),
    caseId: String(item.caseId || 'general').slice(0, 80),
    result: ['pass', 'issue', 'feedback'].includes(item.result) ? item.result : 'feedback',
    message: String(item.message || '').trim().slice(0, 2000),
    createdAt: Number.isNaN(new Date(item.createdAt).getTime()) ? new Date(0).toISOString() : new Date(item.createdAt).toISOString(),
  }));

export const mergeFeedback = (...lists) => [...new Map(lists.flatMap(normaliseFeedback).map((item) => [item.id, item])).values()];

export function createFeedbackController({ storage, onToast }) {
  let entries;
  try { entries = normaliseFeedback(JSON.parse(storage.getItem(FEEDBACK_STORAGE_KEY) || '[]')); }
  catch { entries = []; }
  const select = document.querySelector('#feedbackCase');
  const form = document.querySelector('#feedbackForm');
  const result = document.querySelector('#feedbackResult');
  const message = document.querySelector('#feedbackMessage');
  UAT_CASES.forEach((test) => {
    const option = document.createElement('option');
    option.value = test.id;
    option.textContent = test.title;
    select.append(option);
  });
  const describe = () => {
    const test = UAT_CASES.find(({ id }) => id === select.value);
    document.querySelector('#feedbackInstructions').hidden = !test;
    document.querySelector('#feedbackSteps').textContent = test?.steps || '';
    document.querySelector('#feedbackExpected').textContent = test?.expected || '';
    result.value = test ? 'pass' : 'feedback';
  };
  const render = () => {
    const tested = new Set(entries.filter(({ result }) => result !== 'feedback').map(({ caseId }) => caseId));
    document.querySelector('#feedbackCount').textContent = `${tested.size}/${UAT_CASES.length} tested`;
    const list = document.querySelector('#feedbackHistory');
    list.replaceChildren();
    for (const entry of [...entries].reverse()) {
      const item = document.createElement('article');
      item.className = 'feedback-entry';
      const title = document.createElement('strong');
      title.textContent = `${entry.result === 'pass' ? '✓' : entry.result === 'issue' ? '!' : '·'} ${UAT_CASES.find(({ id }) => id === entry.caseId)?.title || 'General feedback'}`;
      const text = document.createElement('p');
      text.textContent = entry.message;
      const time = document.createElement('small');
      time.textContent = new Date(entry.createdAt).toLocaleString();
      item.append(title, text, time);
      list.append(item);
    }
  };
  select.addEventListener('change', describe);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (result.value !== 'pass' && !message.value.trim()) {
      message.setCustomValidity('Add a short note.');
      message.reportValidity();
      return;
    }
    const next = [...entries, { id: crypto.randomUUID(), caseId: select.value, result: result.value, message: message.value.trim(), createdAt: new Date().toISOString() }];
    try { storage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next)); }
    catch { onToast('Feedback could not be saved. Please try again.'); return; }
    entries = next;
    message.value = '';
    render();
    onToast('Feedback saved. Thank you 🐌');
  });
  message.addEventListener('input', () => message.setCustomValidity(''));
  result.addEventListener('change', () => message.setCustomValidity(''));
  describe(); render();
  return {
    getFeedback: () => normaliseFeedback(entries),
    importBackup(text) {
      const input = JSON.parse(text);
      entries = mergeFeedback(entries, input?.feedback);
      storage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(entries));
      render();
    },
  };
}
