# Production operations

## Service

- Public URL: `https://schnegge.strotzenheim.com`
- Health check: `GET /healthz` returns HTTP 200 and `ok`
- Runtime: dependency-free Node.js service with built-in SQLite on port 8080
- Public edge: the shared Hetzner Caddy gateway on `production_gateway`
- DNS: Porkbun record `schnegge.strotzenheim.com` points to the shared Hetzner IPv4 address
- External dependencies: none at runtime beyond DNS and the shared gateway
- Interface: concise labels with a small curated set of playful r-to-w spellings; stored profile names and workout data are unchanged

## Persistence and backup

Profile names, workout data, presets, per-profile weekday/rotation plans, planned sets, and active-workout state are stored in SQLite at `/data/schneggen.sqlite` on the `schneggen_twerkout_data` named volume. Sets logged from an active preset retain their workout and preset IDs for per-workout volume comparisons. The browser keeps an offline cache and merges it into the server on first sync so existing data is preserved. Petra is created automatically; historical imports use `npm run import-profile -- <profile> <backup-file>`, and an imported day can be linked to a preset with `npm run tag-workout -- <profile> <preset> <YYYY-MM-DD>` while the database volume is mounted. JSON import remains merge-safe and includes the workout plan.

The shared `production-data-backup` job uses SQLite's online backup command, verifies `PRAGMA integrity_check`, compresses the copy, and retains daily backups for 14 days. Restore into a stopped app from a verified backup, keep the damaged database separately, then start the same reviewed revision and verify Petra's set count and public behavior.

## Release

Release 1.7 uses additive JSON fields only: stable exercise IDs, selected exercise and temporary profile feedback. It does not migrate, reset or replace the SQLite database or named volume. Compare hashes of every stored profile state before and after container replacement, not only Petra's set count. Feedback is append-preserved and included in JSON backups; removing the temporary UI later must not delete stored feedback.

Updated clients send the loaded profile revision with every save. Stale or old unversioned clients receive HTTP 409 instead of overwriting another device's state. Reload updates old offline assets; unsynced local data remains in the browser and is combined on reload (local values win for identical IDs). The sync status shows offline/conflicting writes. No automatic deletion or database reset is used to resolve conflicts.

1. Test the exact Git revision with `npm test`, an API/database smoke test, and a container health check.
2. Build the image with the short Git revision as its immutable tag.
3. Deploy only the `schneggen-twerkout` Compose project on the shared network.
4. Verify the container, `/healthz`, the public HTTPS page, weekday and rotation suggestions, weekly and preset volume graphs, Petra's server-side set count, a fresh verified backup, and existing neighboring sites.
5. Record the revision and verification in `Merkelmore/production-operations`.

## Rollback

Retain the preceding image, release directory, and SQLite volume. Set `APP_REVISION` to the preceding verified revision, recreate only this Compose project, and verify the same health and public checks. The earlier static revision ignores but does not delete the server database. A DNS rollback removes only the `schnegge` record; it must not alter the apex, mail, analytics, or TXT records on `strotzenheim.com`.

Before reverting to pre-1.7 code, take a fresh online backup of all profile JSON, including feedback and exercise IDs. That older server can drop unknown JSON fields on its next profile save; retain the fresh backup for a merge-only recovery/re-promotion. Never restore an old backup over newly logged workouts. Prefer re-promotion after fixing forward, and preserve both backups and the current volume.

## Owner actions

None. The name-only gate is not secure authentication and requires no secret or paid service. Add real authentication only if private multi-user access becomes a requirement.

