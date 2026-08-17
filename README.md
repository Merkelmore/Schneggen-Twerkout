# Schneggen-Twerkout

A snail-themed workout tracker with synced profiles, presets, and progress graphs.

Production: [schnegge.strotzenheim.com](https://schnegge.strotzenheim.com)

## Features

- one-set-at-a-time logging for weight and reps, reps only, time, or distance;
- a central volume dashboard comparing weekly totals and repeated preset workouts, plus exercise-level daily best graphs;
- workout streaks, today's summary, editable history, and custom exercise names;
- searchable workout presets with ordered exercises, planned set/weight/rep rows, three starter routines, and set-by-set progress;
- last-time weight and reps shown and prefilled when an exercise is opened from a workout;
- server-backed name profiles with a pre-created Petra profile and separate workout spaces;
- SQLite storage with a browser-local offline cache and merge-safe JSON import/export;
- installable, offline-capable phone experience;
- light Elmer Fudd-style wordplay on a few signature words such as `wowkout`, `pwogwess`, and `weady`, while ordinary wording and saved workout data keep their real r's;
- no passwords, analytics, advertising, Supabase, or third-party tracking.

## Local checks

Requirements: Node.js 24+ and Docker.

```sh
npm test
SCHNEGGEN_DB_PATH=./schneggen.sqlite npm start
```

Open `http://localhost:8080` and check `http://localhost:8080/healthz`.

## Privacy and backups

Profile names and workout data are stored in the app's private SQLite volume and cached in the browser for offline use. A name-only profile is convenient, not secure authentication: anyone who knows a profile name can open and change it. JSON export/import remains available for personal copies.
