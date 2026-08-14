# Schneggen-Twerkout

A small, snail-themed workout tracker where progress graphs are free.

The production app is served at `https://schnegge.strotzenheim.com`.

## Local checks

Requirements: Node.js 20+ and, for the container check, Docker.

```sh
npm test
docker build -t schneggen-twerkout:local .
docker run --rm -p 8080:8080 schneggen-twerkout:local
```

Open `http://localhost:8080` and check `http://localhost:8080/healthz`.

## Privacy

The finished tracker stores workouts in the user's browser. It has no accounts, analytics, advertising, or server-side workout database. Export/import provides a portable backup.

