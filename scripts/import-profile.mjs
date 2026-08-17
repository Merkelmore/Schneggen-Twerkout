import { readFile } from 'node:fs/promises';

import { importProfileBackup, openProfileDatabase } from '../server/state.mjs';

const [name, backupPath] = process.argv.slice(2);
if (!name || !backupPath) {
  console.error('Usage: node scripts/import-profile.mjs <profile-name> <backup.json>');
  process.exit(1);
}

const databasePath = process.env.SCHNEGGEN_DB_PATH || '/data/schneggen.sqlite';
const database = openProfileDatabase(databasePath);
try {
  const result = importProfileBackup(database, name, await readFile(backupPath, 'utf8'));
  console.log(JSON.stringify({
    profile: result.profile.name,
    records: result.state.records.length,
    presets: result.state.presets.length,
    revision: result.revision,
  }));
} finally {
  database.close();
}
