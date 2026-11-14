# @buildment/server

The Buildment API: Express 5 + TypeScript (ESM), Prisma 7 on PostgreSQL, Zod validation.

```
src/
├─ index.ts          process entry: connect DB, listen, graceful shutdown
├─ app.ts            Express app assembly (importable by tests)
├─ config/env.ts     every env var, validated once at boot
├─ routes/           URL → middleware chain → controller
│  ├─ v1/            first-party API (/api/v1) — { success, data } envelope
│  └─ integrations   public organisation API (/integrations/v1) — published contract
├─ validations/      Zod schemas for params / query / body, reused by services
├─ controllers/      thin: read validated input, call a service, send a response
├─ services/         all business logic and Prisma access, grouped by domain
├─ middlewares/      authenticate, requireOrganization, validate, rate limits, error handlers
├─ shared/           contract code both apps run: block schemas + graders, API wire types,
│                    enums, MDX block extraction, pure helpers (copied to frontend/src/shared)
├─ jobs/             in-process scheduler (hourly study reminders, daily cleanup) and the
│                    notification worker (outbox email + live push)
├─ realtime/         live notification stream (Server-Sent Events, per-user, session auth)
├─ utils/            errors (AppError family), responses (ok/created), logger
├─ types/            Express request augmentation, SessionUser, view models
└─ generated/prisma  Prisma client (generated, git-ignored)
tests/
├─ api/              supertest suites against a real Postgres
├─ scripts/          unit tests for the content scripts
└─ helpers/          fixtures that build and tear down their own course/org
scripts/             course import/validation/audit, demo seeds, stats backfill, sync-shared (tsx)
prisma/              schema, migrations, seed
Dockerfile           production platform image (build from repository root)
Procfile             Heroku APP_BASE=server: release = migrate, web = node dist/index.js
```

## Conventions

- **Flow:** route → `validate(...)` → controller → service. Controllers never touch Prisma.
- **Errors:** services throw `NotFoundError`, `ForbiddenError("...", "STABLE_CODE")`, etc. from
  `utils/errors`. The global handler turns them into `{ success: false, message, code, errors? }`.
  Express 5 forwards rejected promises, so no `catchAsync` wrappers.
- **Auth:** opaque session tokens in the `Session` table, accepted as `Authorization: Bearer` or
  the `authjs.session-token` cookie. `authenticate` rejects, `optionalAuth` only decorates.
- **Config:** import `env` from `config/env.ts`; never read `process.env` elsewhere.
- **Shared code:** `src/shared` is the single source of the code both apps run. After editing it,
  run `pnpm sync-shared` to refresh `frontend/src/shared` and commit both; CI runs
  `pnpm sync-shared:check`. Files there must stay free of Express, Prisma and React imports.
- **Authorization:** `requireInstructor` / `requireAdmin` gate the routers; course, thread and
  enrollment ownership is decided in `services/teach/access.ts` and nowhere else.
- **Jobs:** `jobs/scheduler.ts` runs daily jobs at their UTC hour and hourly jobs at their minute
  inside the process (`JOBS_ENABLED`, `WEEKLY_GOAL_REMINDER_HOUR_UTC`,
  `INTEGRITY_RETENTION_HOUR_UTC`); daily goal reminders require `AUTH_RESEND_KEY` and an explicit
  learner opt-in. `/api/v1/jobs/*` + `CRON_SECRET` exist for external schedulers and multi-replica
  deployments.
- **Notifications:** product events call the builders in `services/notifications/events.ts`, which
  go through `notify()`; channels per event live in `services/notifications/config.ts`. Never call
  `sendEmail` for a product event — it goes through the email outbox and the worker
  (`jobs/notification-worker.ts`). Auth email (verification, magic links, invites) still sends
  directly. Email bodies are EJS templates in `services/email/templates`. See
  [`docs/12-notifications.mdx`](../docs/12-notifications.mdx).

## Organization integrations

The public partner contract is under `/integrations/v1`. See the [organization progress report
contract](../docs/organization-api.mdx) for the authenticated learner progress request and its
module/chapter response fields.

## Course images (Cloudflare R2)

Set `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in the API environment. The endpoint is the account S3 endpoint, without the bucket suffix. Use an R2 S3 token scoped to the `buildment` bucket. Never put the secret in the frontend environment or source code.

Course creators can upload cover images in course settings and insert images from the chapter editor. JPEG, PNG, WebP, GIF, and AVIF files up to 8 MB are accepted. Uploads go through the authenticated API; the bucket can remain private, and browser CORS or an R2 public development URL are not required. Covers are served publicly through `/api/v1/media`, while chapter images are served only to course instructors, administrators, and learners with content access.

## Shell labs

Shell labs are YAML files in the private content repository (`labs/shell`: `index.yaml` lists the slugs in order, one `<slug>.yaml` per lab). The `shell_labs` table holds each lab as JSON (`data`, with checks and solutions, because the desktop app runs the checks), plus `position`, `active` and a `contentHash`. A lab removed from `index.yaml` is set to `active = false`, never deleted.

```bash
# Set BUILDMENT_CONTENT_ROOT to the content checkout (the same one the courses use), or pass --root <path>
pnpm labs:check      # validate only, no database
pnpm labs:publish    # validate everything, then import; prints added, updated, unchanged, deactivated and the version
```

A validation problem names the lab and step, exits non-zero and changes nothing.

Both endpoints need a signed-in, verified user:

- `GET /api/v1/shell-labs/version` returns `{ success, data: { version, count } }`
- `GET /api/v1/shell-labs` returns `{ success, data: { version, labs } }` (active labs in `index.yaml` order)

With no labs imported, `version` is `""` and `labs` is `[]`.

Deploy order: migrate first (`pnpm exec prisma migrate deploy`), then publish (`pnpm labs:publish`).

## Desktop updates

The desktop app can be forced to update, per platform (`darwin` = macOS, `win32` = Windows, `linux` = Linux). Platform admins manage the policy in the admin dashboard; it is stored in the `desktop_update_policies` table (one row per platform). A change takes effect at once on the instance that saved it and within 30 seconds on every other instance (policies are cached in memory for 30 seconds). A database error never blocks requests: the last cached policy, or the default policy, is used and the error is logged.

Per platform: `minimumVersion`, `latestVersion`, `downloadUrl` (https, 500 characters max), `message` (280 characters max, optional) and `blockedVersions` (up to 50 exact versions). Versions are plain semver (`0.1.0`, `0.2.0-beta.1`), compared numerically (`0.10.0` is higher than `0.9.0`; `0.2.0-beta.1` is lower than `0.2.0`). A blocked version is refused even when it is above the minimum; it is compared as semver, so `0.1.0` and `0.1.0+build5` are the same version. `latestVersion` can not be lower than `minimumVersion`.

**Default policy.** A platform without a saved row uses the default policy from these environment variables (validated at boot; an invalid version stops the server). The admin dashboard overrides them per platform.

| Variable | Default | |
|---|---|---|
| `DESKTOP_MIN_VERSION` | `0.0.0` | oldest version allowed; `0.0.0` blocks nothing |
| `DESKTOP_LATEST_VERSION` | same as min | newest released version |
| `DESKTOP_DOWNLOAD_URL` | `https://github.com/devweekends/Edorax/releases/latest` | where to download |
| `DESKTOP_UPDATE_MESSAGE` | empty | optional short text for the update screen |

Endpoints:

- `GET /api/v1/desktop/version?platform=darwin|win32|linux` (public, `Cache-Control: max-age=60`) returns `{ success, data: { minimumVersion, latestVersion, downloadUrl, message, blockedVersions } }` for that platform. A missing or unknown `platform` returns the default policy (with `blockedVersions: []`).
- `GET /api/v1/admin/desktop-updates` (admin) returns `{ success, data: { policies } }`: always 3 entries in the order darwin, win32, linux, each `{ platform, minimumVersion, latestVersion, downloadUrl, message, blockedVersions, updatedAt, updatedBy, isDefault }`. `isDefault` is true (and `updatedAt`, `updatedBy` are `null`) when nothing is saved for the platform.
- `PUT /api/v1/admin/desktop-updates` (admin) with `{ platforms: ["darwin", "linux"], fields: { minimumVersion?, latestVersion?, downloadUrl?, message?, blockedVersions? } }` applies the given fields to each listed platform in one transaction (a platform with no row starts from the default policy), records one audit entry (`desktop-update-policy.changed`, with from and to for each platform) and returns the same body as `GET`. A bad value answers `400` with a message that names the field.

Headers the app sends on every request:

- `X-Edorax-Desktop-Version: <semver>`
- `X-Edorax-Desktop-Platform: darwin|win32|linux`

The API answers `426` with `{ success: false, code: "DESKTOP_UPDATE_REQUIRED", message, data: { minimumVersion, latestVersion, downloadUrl, blockedVersions } }` when the version is lower than the platform's `minimumVersion` or is exactly one of its `blockedVersions`. A missing or unknown platform header uses the default policy.

Never blocked: `GET /api/v1/desktop/version`, `GET /health`, requests without the version header (web app, old apps) and requests with an invalid version header.

To force an update: publish the new release, then in the admin dashboard raise the minimum version (and the latest version) for the platforms that have it. To undo it, lower the minimum again. No deploy or restart is needed. Deploy order for this feature: migrate first (`pnpm exec prisma migrate deploy`).

## Commands

| Command | |
|---|---|
| `pnpm dev` | `tsx watch` with pretty logs |
| `pnpm build` / `pnpm start` | compile to `dist/` and run it |
| `pnpm test` | unit + API tests (`DATABASE_URL`, or `TEST_DATABASE_URL`, must point at Postgres) |
| `pnpm typecheck` / `pnpm lint` | |
| `pnpm db:migrate` / `db:ready` / `db:seed` / `db:studio` | Prisma |
| `pnpm content:import` / `content:validate` / `content:validate:source` / `content:audit` | content pipeline with a private checkout through `BUILDMENT_CONTENT_ROOT` |
| `pnpm labs:check` / `labs:publish` | validate / publish shell labs from `BUILDMENT_CONTENT_ROOT` |
| `pnpm db:seed:showcase` / `db:seed:integration` / `stats:backfill` | demo data and maintenance |
| `pnpm db:pull-production` | replace the local database with a copy of production (reads Heroku only; needs the Heroku CLI and Docker) |
| `pnpm sync-shared` / `sync-shared:check` | copy `src/shared` into the web app / verify the copy is current |

## Docker

```bash
docker build -f server/Dockerfile -t buildment-api . # from repository root
docker run --rm --env-file server/.env buildment-api pnpm exec prisma migrate deploy
docker run -p 4000:4000 --env-file server/.env buildment-api
```

The image carries the compiled API, Prisma schema, migrations, and scripts. Course source and
Agent IP stay in the private `Buildment-core` checkout. Its publish workflow runs the platform
publisher separately against the same database.
