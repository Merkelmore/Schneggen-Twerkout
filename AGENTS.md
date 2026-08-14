# Schneggen-Twerkout working rules

## Product

- Keep workout logging fast, friendly, and concise.
- Preserve existing workout data when changing the browser storage schema.
- Treat stored workout details as private user data. Do not add analytics, ads, or remote tracking.
- Keep the app usable on a phone and accessible with a keyboard and screen reader.

## Delivery

- Run `npm test` before proposing or releasing a revision.
- Production releases use the immutable Git commit as the image tag.
- Do not put secrets in this repository; the app is intentionally static and secret-free.
- Update `README.md` and `OPERATIONS.md` when behavior or the deployment contract changes.

