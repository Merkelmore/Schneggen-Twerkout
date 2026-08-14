import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('placeholder names the product and availability', async () => {
  const html = await read('public/index.html');
  assert.match(html, /Schneggen-/);
  assert.match(html, /Twerkout/);
  assert.match(html, /available soon/i);
});

test('health endpoint is stable', async () => {
  assert.equal((await read('public/healthz')).trim(), 'ok');
});

test('production container is isolated on the shared gateway', async () => {
  const compose = await read('compose.production.yml');
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:\s+\- ALL/);
  assert.match(compose, /name: production_gateway/);
  assert.doesNotMatch(compose, /ports:/);
});

