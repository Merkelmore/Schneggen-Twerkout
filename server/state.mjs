import { DatabaseSync } from 'node:sqlite';

import { mergeRecords, normaliseRecord, parseBackup, sortRecords } from '../public/data.js';
import {
  createStarterPresets,
  normaliseActiveWorkout,
  normalisePresets,
  parsePresetBackup,
} from '../public/presets.js';
import { normaliseProfileName } from '../public/profiles.js';

const MAX_RECORDS = 50_000;
const MAX_PRESETS = 100;

const profileKey = (name) => normaliseProfileName(name).toLocaleLowerCase();

export const initialProfileState = () => ({
  records: [],
  presets: createStarterPresets(),
  activeWorkout: null,
  firstVisitSeen: false,
});

export const normaliseServerState = (input = {}) => {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const records = sortRecords((Array.isArray(value.records) ? value.records : [])
    .slice(0, MAX_RECORDS)
    .map(normaliseRecord)
    .filter(Boolean));
  const presets = normalisePresets(
    (Array.isArray(value.presets) ? value.presets : []).slice(0, MAX_PRESETS),
  );

  return {
    records,
    presets,
    activeWorkout: normaliseActiveWorkout(value.activeWorkout),
    firstVisitSeen: value.firstVisitSeen === true,
  };
};

const mergePresets = (current, imported) => {
  const ids = new Set(current.map((preset) => preset.id));
  const names = new Set(current.map((preset) => preset.name.toLocaleLowerCase()));
  return [
    ...current,
    ...imported.filter((preset) => (
      !ids.has(preset.id) && !names.has(preset.name.toLocaleLowerCase())
    )),
  ];
};

export function openProfileDatabase(path) {
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 10000;
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  getOrCreateProfile(database, 'Petra');
  return database;
}

export function getOrCreateProfile(database, rawName) {
  const name = normaliseProfileName(rawName);
  if (!name) throw new TypeError('Enter a name.');
  const key = profileKey(name);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT OR IGNORE INTO profiles (name, name_key, state_json, revision, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(name, key, JSON.stringify(initialProfileState()), now, now);

  const row = database.prepare(`
    SELECT name, state_json, revision, created_at, updated_at
    FROM profiles
    WHERE name_key = ?
  `).get(key);
  return {
    profile: {
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    state: normaliseServerState(JSON.parse(row.state_json)),
    revision: Number(row.revision),
  };
}

export function saveProfileState(database, rawName, input) {
  const current = getOrCreateProfile(database, rawName);
  const state = normaliseServerState(input);
  const updatedAt = new Date().toISOString();
  database.prepare(`
    UPDATE profiles
    SET state_json = ?, revision = revision + 1, updated_at = ?
    WHERE name_key = ?
  `).run(JSON.stringify(state), updatedAt, profileKey(rawName));
  return {
    ...getOrCreateProfile(database, rawName),
    previousRevision: current.revision,
  };
}

export function importProfileBackup(database, rawName, text) {
  const current = getOrCreateProfile(database, rawName);
  const importedRecords = parseBackup(text);
  const importedPresets = parsePresetBackup(text) ?? [];
  return saveProfileState(database, rawName, {
    ...current.state,
    records: mergeRecords(current.state.records, importedRecords),
    presets: mergePresets(current.state.presets, importedPresets),
  });
}
