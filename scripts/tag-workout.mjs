#!/usr/bin/env node

import { openProfileDatabase, tagProfileWorkoutDay } from '../server/state.mjs';

const [, , profileName, presetName, day] = process.argv;
if (!profileName || !presetName || !day) {
  console.error('Usage: npm run tag-workout -- <profile> <preset> <YYYY-MM-DD>');
  process.exit(1);
}

const database = openProfileDatabase(process.env.SCHNEGGEN_DB_PATH || './schneggen.sqlite');
try {
  const result = tagProfileWorkoutDay(database, profileName, presetName, day);
  console.log(JSON.stringify({ profile: profileName, preset: presetName, day, tagged: result.tagged }));
} finally {
  database.close();
}
