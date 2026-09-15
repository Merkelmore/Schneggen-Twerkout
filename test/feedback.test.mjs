import assert from 'node:assert/strict';
import test from 'node:test';
import { UAT_CASES, normaliseFeedback, mergeFeedback } from '../public/feedback.js';
import { openProfileDatabase, getOrCreateProfile, saveProfileState, importProfileBackup } from '../server/state.mjs';
import { normaliseSyncState, mergeProfileStates } from '../public/sync.js';
import { serialiseBackup } from '../public/data.js';

const feedback = { id: 'test-1', caseId: 'start', result: 'issue', message: 'My note', createdAt: '2026-09-15T10:00:00Z' };

test('UAT cases have unique IDs, steps and expected outcomes', () => {
  assert.equal(new Set(UAT_CASES.map(({ id }) => id)).size, 9);
  assert.ok(UAT_CASES.every(({ steps, expected }) => steps && expected));
});

test('feedback is normalized, deduplicated and backed up', () => {
  const entries = normaliseFeedback([feedback, null, {}, { ...feedback, id: 'bad', result: 'invalid', createdAt: 'invalid' }]);
  assert.equal(entries.length, 2);
  assert.equal(entries[1].result, 'feedback');
  assert.equal(mergeFeedback([feedback], [feedback]).length, 1);
  assert.equal(normaliseSyncState({ feedback: [feedback] }).feedback.length, 1);
  assert.equal(mergeProfileStates({ feedback: [feedback] }, { feedback: [feedback] }).feedback.length, 1);
  assert.equal(JSON.parse(serialiseBackup([], { feedback: [feedback] })).feedback[0].message, 'My note');
});

test('central feedback survives other saves and import, isolated by profile', () => {
  const db = openProfileDatabase(':memory:');
  try {
    const before = getOrCreateProfile(db, 'Petra');
    saveProfileState(db, 'Petra', { ...before.state, feedback: [feedback] }, before.revision);
    saveProfileState(db, 'Petra', { firstVisitSeen: true });
    assert.equal(getOrCreateProfile(db, 'petra').state.feedback[0].message, 'My note');
    assert.equal(getOrCreateProfile(db, 'Another tester').state.feedback.length, 0);
    importProfileBackup(db, 'Petra', JSON.stringify({ records: [], feedback: [{ ...feedback, id: 'imported' }] }));
    assert.equal(getOrCreateProfile(db, 'Petra').state.feedback.length, 2);
    const raw = db.prepare('SELECT state_json FROM profiles WHERE name_key = ?').get('petra').state_json;
    assert.throws(() => saveProfileState(db, 'Petra', { records: [], feedback: [] }, before.revision), /another device/);
    assert.equal(db.prepare('SELECT state_json FROM profiles WHERE name_key = ?').get('petra').state_json, raw);
  } finally { db.close(); }
});
