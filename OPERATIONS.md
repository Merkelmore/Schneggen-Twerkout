# Production operations

## Service

- Public URL: `https://schnegge.strotzenheim.com`
- Health check: `GET /healthz` returns HTTP 200 and `ok`
- Runtime: static files served by an unprivileged Caddy container on port 8080
- Public edge: the shared Hetzner Caddy gateway on `production_gateway`
- DNS: Porkbun record `schnegge.strotzenheim.com` points to the shared Hetzner IPv4 address
- External dependencies: none at runtime beyond DNS and the shared gateway

## Persistence and backup

Workout data, presets, and active-workout state are browser-local and are never written to the server. JSON export/import backs up sets and presets; an in-progress workout is intentionally device-session state and is not exported. Production has no application data volume to back up.

## Release

1. Test the exact Git revision with `npm test` and a container health check.
2. Build the image with the short Git revision as its immutable tag.
3. Deploy only the `schneggen-twerkout` Compose project on the shared network.
4. Verify the container, `/healthz`, the public HTTPS page, and existing neighboring sites.
5. Record the revision and verification in `Merkelmore/production-operations`.

## Rollback

Retain the preceding image and release directory. Set `APP_REVISION` to the preceding verified revision, recreate only this Compose project, and verify the same health and public checks. A DNS rollback removes only the `schnegge` record; it must not alter the apex, mail, analytics, or TXT records on `strotzenheim.com`.

## Owner actions

None. The app requires no secret, paid service, account, or database.

