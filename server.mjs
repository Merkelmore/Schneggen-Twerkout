import { resolve } from 'node:path';

import { createApplicationServer } from './server/http.mjs';

const port = Number(process.env.PORT || 8080);
const databasePath = process.env.SCHNEGGEN_DB_PATH || '/data/schneggen.sqlite';
const publicDirectory = resolve('public');
const application = createApplicationServer({ databasePath, publicDirectory });

application.server.listen(port, '0.0.0.0', () => {
  console.log(`Schneggen-Twerkout listening on ${port}`);
});

const stop = async () => {
  await application.close();
  process.exit(0);
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
