import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import { getOrCreateProfile, openProfileDatabase, saveProfileState } from './state.mjs';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const SECURITY_HEADERS = {
  'Cache-Control': 'no-cache',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

const sendJson = (response, status, value) => {
  response.writeHead(status, { ...SECURITY_HEADERS, ...JSON_HEADERS, 'Cache-Control': 'no-store' });
  response.end(`${JSON.stringify(value)}\n`);
};

const readJson = async (request) => {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RangeError('Request is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const profileStatePath = (pathname) => {
  const match = pathname.match(/^\/api\/profiles\/([^/]+)\/state$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

async function serveStatic(request, response, pathname, publicDirectory) {
  let relative;
  try {
    relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
  } catch {
    response.writeHead(400, SECURITY_HEADERS);
    response.end('Bad request.\n');
    return;
  }

  const root = resolve(publicDirectory);
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(404, SECURITY_HEADERS);
    response.end('Not found.\n');
    return;
  }

  try {
    const details = await stat(file);
    if (!details.isFile()) throw new Error('Not a file.');
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Length': details.size,
      'Content-Type': MIME_TYPES.get(extname(file)) || 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, SECURITY_HEADERS);
    response.end('Not found.\n');
  }
}

export function createApplicationServer({ databasePath, publicDirectory }) {
  const database = openProfileDatabase(databasePath);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    try {
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/healthz') {
        database.prepare('SELECT 1').get();
        response.writeHead(200, {
          ...SECURITY_HEADERS,
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end(request.method === 'HEAD' ? undefined : 'ok\n');
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/profiles') {
        const body = await readJson(request);
        sendJson(response, 200, getOrCreateProfile(database, body.name));
        return;
      }

      const profileName = profileStatePath(url.pathname);
      if (request.method === 'PUT' && profileName) {
        const body = await readJson(request);
        sendJson(response, 200, saveProfileState(database, profileName, body.state));
        return;
      }

      if ((request.method === 'GET' || request.method === 'HEAD') && !url.pathname.startsWith('/api/')) {
        await serveStatic(request, response, url.pathname, publicDirectory);
        return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        sendJson(response, 400, { error: error.message || 'Invalid request.' });
      } else if (error instanceof RangeError) {
        sendJson(response, 413, { error: error.message });
      } else {
        sendJson(response, 500, { error: 'Server error.' });
      }
    }
  });

  const close = async () => {
    if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
    database.close();
  };

  return { database, server, close };
}
