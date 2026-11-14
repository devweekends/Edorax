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
