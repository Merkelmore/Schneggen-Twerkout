# Schneggen-Twerkout

A snail-themed workout tracker with synced profiles, presets, and progress graphs.

Production: [schnegge.strotzenheim.com](https://schnegge.strotzenheim.com)

## Features

- an accordion workout list: all exercises stay visible, with editable set rows inside the open exercise;
- quick weight/rep buttons with a saved weight increment, copy-previous-set, inline editing, and 10-second undo;
- optional rest countdown with +30 seconds and skip; the deadline survives reloads and phone locks;
- a compact workout finish screen comparing total volume with the previous same-preset workout and a six-session graph;
- standalone and detailed logging for weight and reps, reps only, time, distance, or notes;
- a central volume dashboard comparing weekly totals and repeated preset workouts, plus exercise-level daily best graphs;
- workout streaks, today's summary, editable history, and custom exercise names;
- searchable workout presets with ordered exercises, planned set/weight/rep rows, three starter routines, and set-by-set progress;
- per-profile workout plans using weekday assignments or a repeating preset order, with a suggested one-tap start card;
- per-set last-time values, using the latest exercise session and stable slot numbers; planned targets take precedence over previous values when prefilling;
- persistent workout title and overview from the first set, with any-order exercise selection;
- rename exercises and drag to reorder using mouse, touch or pen; arrow buttons support keyboards;
- edit running workouts, add missed sets, or save changes back to the preset without rewriting logged sets;
- temporary UAT checklist and free-form feedback, saved centrally in each profile and included in backups;
- server-backed name profiles with a pre-created Petra profile and separate workout spaces;
- SQLite storage with a browser-local offline cache and merge-safe JSON import/export;
- installable, offline-capable phone experience;
- English controls, with light wordplay only in little snail comments such as `weady`; user names and exercise names are never rewritten;
- no passwords, analytics, advertising, Supabase, or third-party tracking.

## Local checks

Requirements: Node.js 24+ and Docker.

```sh
npm test
SCHNEGGEN_DB_PATH=./schneggen.sqlite npm start
```

Open `http://localhost:8080` and check `http://localhost:8080/healthz`.

For browser acceptance tests, set `SCHNEGGEN_PLAYWRIGHT_MODULE` to a local Playwright module and optionally `SCHNEGGEN_BROWSER_PATH` to a browser executable, then run `node scripts/ui-smoke.mjs`. It creates a disposable local database, not production data.

## Privacy and backups

Profile names and workout data are stored in the app's private SQLite volume and cached in the browser for offline use. A name-only profile is convenient, not secure authentication: anyone who knows a profile name can open and change it. JSON export/import remains available for personal copies.
