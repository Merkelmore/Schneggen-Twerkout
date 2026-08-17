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

Profile names, workout data, presets, planned sets, and active-workout state are stored in SQLite at `/data/schneggen.sqlite` on the `schneggen_twerkout_data` named volume. The browser keeps an offline cache and merges it into the server on first sync so existing data is preserved. Petra is created automatically; her historical import is added with `npm run import-profile -- Petra <backup-file>` while the database volume is mounted. JSON import remains merge-safe.

The shared `production-data-backup` job uses SQLite's online backup command, verifies `PRAGMA integrity_check`, compresses the copy, and retains daily backups for 14 days. Restore into a stopped app from a verified backup, keep the damaged database separately, then start the same reviewed revision and verify Petra's set count and public behavior.

## Release

1. Test the exact Git revision with `npm test`, an API/database smoke test, and a container health check.
2. Build the image with the short Git revision as its immutable tag.
3. Deploy only the `schneggen-twerkout` Compose project on the shared network.
4. Verify the container, `/healthz`, the public HTTPS page, Petra's server-side set count, a fresh verified backup, and existing neighboring sites.
5. Record the revision and verification in `Merkelmore/production-operations`.

## Rollback

Retain the preceding image, release directory, and SQLite volume. Set `APP_REVISION` to the preceding verified revision, recreate only this Compose project, and verify the same health and public checks. The earlier static revision ignores but does not delete the server database. A DNS rollback removes only the `schnegge` record; it must not alter the apex, mail, analytics, or TXT records on `strotzenheim.com`.

## Owner actions

None. The name-only gate is not secure authentication and requires no secret or paid service. Add real authentication only if private multi-user access becomes a requirement.

