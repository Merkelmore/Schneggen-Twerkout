// Run against a disposable local database. No production profiles are touched.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApplicationServer } from '../server/http.mjs';

if (!process.env.SCHNEGGEN_PLAYWRIGHT_MODULE) throw new Error('Set SCHNEGGEN_PLAYWRIGHT_MODULE to your Playwright module.');
const { chromium } = await import(pathToFileURL(process.env.SCHNEGGEN_PLAYWRIGHT_MODULE).href);
const dir = await mkdtemp(join(tmpdir(), 'schneggen-ui-'));
const app = createApplicationServer({ databasePath: join(dir, 'test.sqlite'), publicDirectory: fileURLToPath(new URL('../public', import.meta.url)) });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.SCHNEGGEN_BROWSER_PATH });
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1100 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  const state = async () => (await (await fetch(`${base}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'UAT Tester' }) })).json()).state;
  const waitSaved = async () => { await page.waitForFunction(() => document.querySelector('#syncStatus').hidden); };
  await page.goto(base);
  await page.locator('#profileNameInput').fill('UAT Tester');
  await page.locator('#profileForm button').click();
  await page.locator('#newPresetButton').click();
  await page.locator('#presetNameInput').fill('Leg day UAT');
  for (const name of ['Squat', 'Leg curl']) {
    await page.locator('#presetExerciseInput').fill(name);
    await page.locator('#addPresetExerciseButton').click();
  }
  await page.locator('.draft-exercise-name').first().fill('Smith squat');
  for (const row of await page.locator('.planned-set-row').all()) {
    await row.locator('input').nth(0).fill('20');
    await row.locator('input').nth(1).fill('8');
  }
  const drag = async (list, from, to) => {
    const source = page.locator(`${list} > [data-reorder-row]`).nth(from).locator('.drag-handle');
    await source.scrollIntoViewIfNeeded();
    const start = await source.boundingBox();
    const target = await page.locator(`${list} > [data-reorder-row]`).nth(to).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 20, target.y + target.height * .7, { steps: 20 });
    await page.waitForFunction(() => document.querySelector('.drop-target'));
    await page.mouse.up();
  };
  await drag('#presetDraftList', 0, 1);
  assert.equal(await page.locator('.draft-exercise-name').first().inputValue(), 'Leg curl');
  await page.locator('#presetForm button[type="submit"]').click();
  const presetCard = page.locator('.preset-card').filter({ hasText: 'Leg day UAT' });
  await presetCard.locator('.start-workout-button').click();
  assert.equal(await page.locator('#activeWorkoutName').textContent(), 'Leg day UAT');
  assert.equal(await page.locator('#activeWorkoutMeta').textContent(), '0 of 2 sets');
  assert.equal(await page.locator('.session-exercise').count(), 2);
  assert.equal(await page.locator('#logView').isVisible(), true);
  await page.locator('.workout-exercise-row').last().click();
  assert.equal(await page.locator('#exerciseInput').inputValue(), 'Smith squat');
  await page.locator('#setForm button[type="submit"]').click();
  assert.equal(await page.locator('#activeWorkoutMeta').textContent(), '1 of 2 sets');
  assert.equal(await page.locator('.session-logged').textContent(), '20 kg × 8');
  assert.equal(await page.locator('#exerciseInput').inputValue(), 'Leg curl');
  await waitSaved();
  const originalRecords = JSON.stringify((await state()).records);
  await page.locator('#editWorkoutButton').click();
  await page.locator('.add-planned-set').first().click();
  await page.locator('#presetForm button[type="submit"]').click();
  await waitSaved();
  let saved = await state();
  assert.equal(saved.activeWorkout.exercises[0].plannedSets.length, 2);
  assert.equal(saved.presets.find(({ name }) => name === 'Leg day UAT').exercises[0].sets.length, 1);
  assert.equal(JSON.stringify(saved.records), originalRecords);
  await page.locator('#editWorkoutButton').click();
  await page.locator('.add-planned-set').first().click();
  await page.locator('#presetSaveScope').selectOption('both');
  await page.locator('#presetForm button[type="submit"]').click();
  await waitSaved();
  assert.equal((await state()).presets.find(({ name }) => name === 'Leg day UAT').exercises[0].sets.length, 3);
  await drag('#activeExerciseList', 0, 1);
  await waitSaved();
  await page.reload();
  await page.locator('#sessionBanner').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#activeWorkoutMeta').textContent(), '1 of 4 sets');
  await page.locator('[data-view="feedback"]').click();
  await page.locator('#feedbackCase').selectOption('switch');
  await page.locator('#feedbackResult').selectOption('issue');
  await page.locator('#feedbackMessage').fill('A test note, safely in my profile.');
  await page.locator('#feedbackForm button').click();
  await waitSaved();
  assert.equal((await state()).feedback.length, 1);
  assert.equal(JSON.stringify((await state()).records), originalRecords);
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const phone = await secondContext.newPage();
  phone.on('dialog', (dialog) => dialog.accept());
  await phone.goto(base);
  await phone.locator('#profileNameInput').fill('UAT Tester');
  await phone.locator('#profileForm button').click();
  await phone.locator('[data-view="feedback"]').click();
  assert.match(await phone.locator('#feedbackHistory').textContent(), /A test note/);
  await phone.locator('#sessionOverviewButton').click();
  await phone.locator('#weightInput').scrollIntoViewIfNeeded();
  await phone.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  const banner = await phone.locator('#sessionBanner').boundingBox();
  assert.ok(banner.y >= -1 && banner.y < 20, 'Workout title stays at top when scrolled');
  for (const width of [390, 320]) {
    await phone.setViewportSize({ width, height: 844 });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No overflow at ${width}px`);
  }
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.locator('#sessionOverviewButton').click();
  if (process.env.SCHNEGGEN_SCREENSHOT) await phone.screenshot({ path: process.env.SCHNEGGEN_SCREENSHOT, fullPage: true });
  // Actual touch events exercise the same handles used on phones.
  const source = phone.locator('#activeExerciseList .drag-handle').last();
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const listBox = await phone.locator('#activeExerciseList').boundingBox();
  const touch = await secondContext.newCDPSession(phone);
  const x = sourceBox.x + sourceBox.width / 2;
  const y = sourceBox.y + sourceBox.height / 2;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 20; step += 1) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (listBox.y + 12 - y) * step / 20 }] });
  }
  await phone.waitForFunction(() => document.querySelector('#activeExerciseList .drop-target'));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await phone.locator('.workout-exercise-copy strong').first().textContent(), 'Leg curl');
  await phone.locator('#finishWorkoutButton').click();
  assert.equal(await phone.locator('#sessionBanner').isVisible(), false);
  assert.equal(await phone.locator('#lastPerformanceCard').isVisible(), false);
  assert.deepEqual(failures, []);
  console.log('PASS: preset rename + real drag, immediate overview, out-of-order logging, both edit scopes, preserved history, session drag + reload, central feedback across browsers, 390/320px layout, sticky title, finish clears context.');
} finally {
  await browser.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
