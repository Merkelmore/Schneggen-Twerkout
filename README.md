# Schneggen-Twerkout

A snail-themed workout tracker with local profiles, presets, and progress graphs.

Production: [schnegge.strotzenheim.com](https://schnegge.strotzenheim.com)

## Features

- one-set-at-a-time logging for weight and reps, reps only, time, or distance;
- progress graphs with daily bests, latest result, personal best, and percentage change;
- workout streaks, today's summary, editable history, and custom exercise names;
- editable workout presets with three first-visit starter routines and active-workout progress;
- last-time weight and reps shown and prefilled when an exercise is opened from a workout;
- local name profiles with a pre-created Petra profile and separate workout spaces;
- local-only storage for sets, presets, and active workouts with JSON export/import for sets and presets;
- installable, offline-capable phone experience;
- light Elmer Fudd-style wordplay on a few signature words such as `wowkout`, `pwogwess`, and `weady`, while ordinary wording and saved workout data keep their real r's;
- no passwords, analytics, advertising, or remote workout database.

## Local checks

Requirements: Node.js 20+ and Docker.

```sh
npm test
docker build -t schneggen-twerkout:local .
docker run --rm -p 8080:8080 schneggen-twerkout:local
```

Open `http://localhost:8080` and check `http://localhost:8080/healthz`.

## Privacy and backups

Profile names and workout records stay in that browser's local storage. They are not sent to the server. A name-only profile is a convenience, not secure authentication. Export the current profile's JSON backup before clearing browser data or changing devices; Import restores that file in another browser profile.
