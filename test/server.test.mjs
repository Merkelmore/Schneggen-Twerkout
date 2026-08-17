import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createApplicationServer } from '../server/http.mjs';
import {
  getOrCreateProfile,
  importProfileBackup,
  openProfileDatabase,
  saveProfileState,
} from '../server/state.mjs';

const makeRecord = (overrides = {}) => ({
  id: overrides.id || 'set-1',
  exercise: overrides.exercise || 'Hip thrust',
  type: 'strength',
  date: '2026-08-17T15:00:00.000Z',
  weight: overrides.weight ?? 80,
  reps: overrides.reps ?? 8,
  notes: '',
  createdAt: '2026-08-17T15:00:00.000Z',
});

test('SQLite profiles are unique by name and persist normalised state', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'schneggen-db-'));
  const database = openProfileDatabase(join(directory, 'profiles.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const petra = getOrCreateProfile(database, 'Petra');
  const samePetra = getOrCreateProfile(database, '  pETRa ');
  assert.equal(samePetra.profile.name, 'Petra');
  assert.equal(petra.state.presets.length, 3);

  const saved = saveProfileState(database, 'Petra', {
    records: [makeRecord()],
    presets: petra.state.presets,
    firstVisitSeen: true,
  });
  assert.equal(saved.state.records.length, 1);
  assert.equal(saved.state.firstVisitSeen, true);
  assert.ok(saved.revision > petra.revision);
});

test('private backup import merges records and presets into Petra', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'schneggen-import-'));
  const database = openProfileDatabase(join(directory, 'profiles.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const result = importProfileBackup(database, 'Petra', JSON.stringify({
    records: [makeRecord({ id: 'history-set', exercise: 'Chest Press (Machine)', weight: 30, reps: 5 })],
    presets: [{ id: 'upper', name: 'Upper Body Day', exercises: ['Chest Press (Machine)'] }],
  }));
  assert.equal(result.state.records.length, 1);
  assert.ok(result.state.presets.some(({ name }) => name === 'Upper Body Day'));
});

test('HTTP service stores profile state and serves the secured app', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'schneggen-http-'));
  const application = createApplicationServer({
    databasePath: join(directory, 'profiles.sqlite'),
    publicDirectory: fileURLToPath(new URL('../public', import.meta.url)),
  });
  context.after(async () => {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
  const { port } = application.server.address();
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/healthz`);
  assert.equal(await health.text(), 'ok\n');
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);

  const created = await fetch(`${base}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Leon' }),
  });
  assert.equal(created.status, 200);
  assert.equal((await created.json()).profile.name, 'Leon');

  const updated = await fetch(`${base}/api/profiles/Leon/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: { records: [makeRecord({ id: 'api-set' })], presets: [] } }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).state.records[0].id, 'api-set');

  const loaded = await fetch(`${base}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'leon' }),
  });
  assert.equal((await loaded.json()).state.records.length, 1);
});
