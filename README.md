# Schneggen-Twerkout

A small, snail-themed workout tracker where progress graphs are free.

Production: [schnegge.strotzenheim.com](https://schnegge.strotzenheim.com)

## Features

- one-set-at-a-time logging for weight and reps, reps only, time, or distance;
- progress graphs with daily bests, latest result, personal best, and percentage change;
- workout streaks, today's summary, editable history, and custom exercise names;
- local-only storage with JSON export/import;
- installable, offline-capable phone experience;
- no accounts, analytics, advertising, or remote workout database.

## Local checks

Requirements: Node.js 20+ and Docker.

```sh
npm test
docker build -t schneggen-twerkout:local .
docker run --rm -p 8080:8080 schneggen-twerkout:local
```

Open `http://localhost:8080` and check `http://localhost:8080/healthz`.

## Privacy and backups

Workout records stay in that browser's local storage. They are not sent to the server. Export a JSON backup before clearing browser data or changing devices; Import restores that file in another browser.
