import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ships the full workout tracker interface', async () => {
  const html = await read('public/index.html');
  assert.match(html, /Schneggen-/);
  assert.match(html, /Progress, unlocked\./);
  assert.match(html, /id="setForm"/);
  assert.match(html, /src="\/app\.js\?v=4"/);
  assert.match(html, /id="workoutsView"/);
  assert.match(html, /id="presetForm"/);
  assert.match(html, /id="lastPerformanceCard"/);
  assert.match(html, /id="profileGate"/);
  assert.match(html, /id="profileNameInput"/);
  assert.match(html, /id="profileButton"/);
  assert.doesNotMatch(html, /available soon/i);
});

test('keeps health and install assets stable', async () => {
  assert.equal(await read('public/healthz'), 'ok\n');
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Schneggen-Twewkout');
  assert.equal(manifest.display, 'standalone');
  assert.doesNotMatch(`${manifest.name}${manifest.short_name}${manifest.description}`, /r/i);
  assert.match(await read('public/sw.js'), /schneggen-twerkout-v4/);
  assert.match(await read('public/sw.js'), /presets\.js\?v=4/);
  assert.match(await read('public/sw.js'), /workouts\.js\?v=4/);
  assert.match(await read('public/sw.js'), /profiles\.js\?v=4/);
  assert.match(await read('public/sw.js'), /w-speech\.js/);
});

test('uses no remote scripts, analytics, or fonts', async () => {
  const html = await read('public/index.html');
  const scripts = await Promise.all([
    read('public/app.js'),
    read('public/workouts.js'),
    read('public/presets.js'),
    read('public/profiles.js'),
    read('public/w-speech.js'),
  ]);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\//);
  scripts.forEach((script) => {
    assert.doesNotMatch(script, /fetch\(['"]https?:\/\//);
    assert.doesNotMatch(script, /analytics|telemetry/i);
  });
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
