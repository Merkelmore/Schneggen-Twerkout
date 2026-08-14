import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ships the full workout tracker interface', async () => {
  const html = await read('public/index.html');
  assert.match(html, /Schneggen-/);
  assert.match(html, /Progress, unlocked\./);
  assert.match(html, /id="setForm"/);
  assert.match(html, /src="\/app\.js"/);
  assert.doesNotMatch(html, /available soon/i);
});

test('keeps health and install assets stable', async () => {
  assert.equal((await read('public/healthz')).trim(), 'ok');
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Schneggen-Twerkout');
  assert.equal(manifest.display, 'standalone');
  assert.match(await read('public/sw.js'), /schneggen-twerkout-v1/);
});

test('uses no remote scripts, analytics, or fonts', async () => {
  const html = await read('public/index.html');
  const app = await read('public/app.js');
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  assert.doesNotMatch(app, /fetch\(['"]https?:\/\//);
  assert.doesNotMatch(app, /analytics|telemetry/i);
});

test('production container is isolated on the shared gateway', async () => {
  const compose = await read('compose.production.yml');
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:\s+\- ALL/);
  assert.match(compose, /name: production_gateway/);
  assert.doesNotMatch(compose, /ports:/);
});

test('server applies a restrictive content security policy', async () => {
  const caddy = await read('Caddyfile');
  assert.match(caddy, /Content-Security-Policy/);
  assert.match(caddy, /default-src 'self'/);
  assert.match(caddy, /frame-ancestors 'none'/);
});
