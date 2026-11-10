# Edorax

[Edorax](https://www.edorax.com/) is a project-based learning platform. Mentors write MDX chapters with graded checkpoints such as quizzes, tests, must-reads, open questions, and runnable code. Learners work through those chapters. Progress and reports are computed on the server.

The platform source is in this repository. Course packages, Agent IP, and editorial work live in the private [`devweekends/Edorax-core`](https://github.com/devweekends/Edorax-core) repository. Export archives are excluded from both repositories. Existing canvas and lab implementations stay in `packages/learning-ui` so the web and desktop apps can keep rendering them. See [content separation](docs/15-content-separation.mdx).

The full product and technical spec lives in [`docs/`](docs/README.mdx). Start there. Security, gating, and grading rules are spelled out in the topic docs linked from that map.

The LMS uses Postgres. It does not use Mongo. Mongo is what some course lessons teach, not what the platform runs on.

## What you can do today

- Write and publish courses as MDX, with an in-app editor and versioned releases.
- Teach with interactive blocks: quizzes, code exercises, open questions, predict questions, diagrams, videos, AI interviews, and capstone checks.
- Enroll learners, lock later modules until earlier ones are complete, and review submitted work.
- Let learners rate courses, ask a mentor for help, and (when configured) ask a short question about a chapter.
- Browse a public catalog, listen to narrated courses as [audiobooks](docs/16-learning-areas.mdx), and run visual labs on a board.
- Use XP, streaks, levels, credits, and opt-in leaderboards (each can be turned off with a server flag). See [gamification](docs/14-gamification.mdx).
- Request paid course access, apply discount codes, and manage organization enrollments and credits. Checkout does not collect card payments in the app; an administrator grants access after payment is arranged.
- Run an instructor workspace with reports, campaigns, coupons, and a wallet for payouts.
- Use a platform admin area for users, organizations, discounts, and course access.
- Connect organizations through the public [`/integrations/v1`](docs/organization-api.mdx) API.
- Use the [desktop app](desktop/README.md) for the catalog, a native reader, and a course IDE with local or Docker workspaces.

Some learner areas are still being built. Bite-sized practice, puzzles, on-call voice tutors, guided labs, and shell labs have overview pages but are not open yet. See [learning areas](docs/16-learning-areas.mdx).

## Stack

Two independent apps, each with its own `package.json` and lockfile, can be deployed from its own folder (Vercel root directory `frontend`; Heroku, Render, or Fly from `server`). The split from the original Next.js monolith is recorded in [`docs/phases/backend-split.mdx`](docs/phases/backend-split.mdx).

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Web app. UI only. Every read and write goes through the API. | Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, Playwright, Vitest |
| `server/` | API. Owns Postgres, sessions, email, background jobs, content scripts, and the contract code in `src/shared`. | Express 5, TypeScript, Prisma 7, Zod, Vitest and supertest |
| `packages/learning-ui/` | Shared canvases and visual labs used by the web and desktop apps. | React library, linked as a local `file:` dependency |
| `desktop/` | Electron desktop app. Optional for local web development. | Electron Forge, React, TypeScript, Tailwind |

The code both web apps run (block schemas and graders, API wire types, enums, MDX block extraction, and pure helpers) lives in `server/src/shared`. The web app carries a committed copy in `frontend/src/shared`. `pnpm sync-shared` refreshes it, and CI fails when it is stale. There is no workspace link between the two app folders, which is what lets each deploy on its own.

Browser code calls same-origin `/api/v1/*`. Next.js proxies it to the API (`API_URL`). Organizations and other tenants call `/integrations/v1/*` on the API host directly.

## Prerequisites

- Node.js 20.19 or later. CI and the Docker images use Node 20. The API package requires `>=20.19`. The root `package.json` lists `engines.node` as `24.x` (used by some host deploys).
- [pnpm](https://pnpm.io) 12.11.2 (the version pinned in each app's `packageManager` field)
- Docker, for local Postgres, or point `DATABASE_URL` at any Postgres instance instead

## Setup

```bash
pnpm install && pnpm install:all       # root: the `concurrently` helper; then server/ and frontend/
cp server/.env.example server/.env     # DATABASE_URL, APP_URL, email keys
cp frontend/.env.example frontend/.env # API_URL (the web app never talks to Postgres)
docker compose up -d                   # starts local Postgres on :5432
pnpm db:ready                          # migrate deploy + prisma generate (use after git pull)
pnpm db:seed                           # 1 admin, 1 mentor, 3 mentees, 1 course placeholder, 4 preview enrollments
pnpm dev                               # API on :4000, web on :3000
```

Run one side on its own with `pnpm --dir server dev` or `pnpm --dir frontend dev`. You can also `cd` into the folder and treat it as a normal project. Nothing outside that folder is required for that app to start, except a reachable API for the web app.

### Email delivery (optional for local dev)

Sessions, sign-up, verification emails, and magic links are all handled by the API. Set `AUTH_RESEND_KEY` and `EMAIL_FROM` in `server/.env` (from [Resend](https://resend.com/api-keys)) to send real email. Without a key, the API logs the links instead and activates new accounts immediately, so the whole flow stays testable offline.

### Local dev login (no email keys needed)

After seeding, the [login page](http://localhost:3000/login) shows a one-click picker for the seeded accounts. It is hidden when `NODE_ENV=production`. The accounts are:

- `admin@buildment.dev`
- `mentor@buildment.dev`
- `mentee1@buildment.dev`
- `mentee2@buildment.dev`
- `mentee3@buildment.dev`

Clicking one signs in through the normal login API. You can also call `GET /api/v1/auth/dev-login?email=...` on the API, which mints a real database session for that seeded user. That route returns 404 when `NODE_ENV=production`.

A clean clone seeds a small catalog placeholder. Full course lessons are published from the private `Edorax-core` repository.

### AI review drafts (optional)

Mentors can ask OpenRouter to draft feedback for a pending open-question response. Configure the credential on the server only. Never use a `NEXT_PUBLIC_` prefix.

```bash
OPENROUTER_API_KEY=your-rotated-key
OPENROUTER_REVIEW_MODEL=google/gemini-2.5-flash # optional
```

The request is made only after the mentor clicks Draft with AI. The mentor sees and edits the draft, then chooses the final verdict. See [`docs/05-review-queue.mdx`](docs/05-review-queue.mdx) for the data-sharing boundary.

## Common commands

Run from the repo root unless noted.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the API and the web app together |
| `pnpm build` | Build server, then frontend |
| `pnpm test` | Vitest in both apps (the server suite needs Postgres) |
| `pnpm typecheck` / `pnpm lint` | Type-check / lint both apps |
| `pnpm sync-shared` | Refresh `frontend/src/shared` from `server/src/shared` after editing contract code |
| `pnpm db:migrate` | `prisma migrate dev` (server) |
| `pnpm db:seed` | Re-run the seed script (idempotent; it upserts) |
| `pnpm db:studio` | Prisma Studio, a GUI for the local database |
| `pnpm content:import` | Legacy local import when `BUILDMENT_CONTENT_ROOT` points to a private content checkout |
| `pnpm content:validate` | Compile-check every stored chapter the way publish does (needs a database) |
| `pnpm --dir server content:validate:source` | Compile-check a private course checkout (no database) |
| `pnpm --dir server content:audit` | Structural audit (gates, learning logs, STYLE heuristics) |
| `pnpm --dir server db:seed:showcase` | Add realistic, repeatable demo history after the course import |
| `pnpm --dir frontend exec playwright test` | Browser end-to-end suite (starts API and web itself; see `frontend/playwright.config.ts`) |
| `pnpm --dir desktop start` | Start the Electron app (install it first with `pnpm --dir desktop install`; the API should already be running) |

Content and seed scripts live in `server/scripts`, next to the database they write. The content-root environment variable is still named `BUILDMENT_CONTENT_ROOT`.

## Environment variables

Copy the example files and fill in values as needed. Names only, from those files:

**Server (`server/.env.example`):** `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `APP_URL`, `CORS_ORIGINS`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`, `CRON_SECRET`, `DISABLE_RATE_LIMITS`, `OPENROUTER_API_KEY`, `OPENROUTER_REVIEW_MODEL`, `AI_KEY_ENCRYPTION_KEY`, `OPENROUTER_INTERVIEW_MODEL`, `ANTHROPIC_API_KEY`, `LEARNER_QA_ENABLED`, `LEARNER_QA_MODEL`, `LEARNER_QA_DAILY_LIMIT`, `LEARNER_QA_GLOBAL_DAILY_LIMIT`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `INTEGRITY_MEDIA_SECRET`, `JOBS_ENABLED`, `WEEKLY_GOAL_REMINDER_HOUR_UTC`, `INTEGRITY_RETENTION_HOUR_UTC`, `NOTIFICATION_WORKER_ENABLED`, `NOTIFICATION_WORKER_INTERVAL_MS`, `REMINDER_DAILY_LIMIT`, `REALTIME_TOKEN_SECRET`, `GAMIFICATION_XP`, `GAMIFICATION_STREAK_FREEZES`, `GAMIFICATION_LEVELS`, `GAMIFICATION_CAREER_LEVELS`, `GAMIFICATION_LEADERBOARDS`, `GAMIFICATION_CREDITS`.

**Frontend (`frontend/.env.example`):** `API_URL`, `NEXT_PUBLIC_REALTIME_URL`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `APP_URL`, `NARRATION_BASE_URL`.

For local development you only need `DATABASE_URL` and `APP_URL` on the server, and `API_URL` on the frontend. The rest are optional. Email, AI, object storage, Sentry, and PostHog stay off unless you set their keys.

The desktop app uses `BUILDMENT_API_URL` and `BUILDMENT_WEB_URL` when it should talk to a deployment other than `http://localhost:4000` and `http://localhost:3000`. See [`desktop/README.md`](desktop/README.md).

## Tests

```bash
pnpm test                                # Vitest for the API and the web app
pnpm --dir frontend exec playwright test # browser end-to-end tests
```

The API test suite needs Postgres (`DATABASE_URL`, or `TEST_DATABASE_URL`). CI starts Postgres 16, runs `pnpm db:ready` and `pnpm db:seed`, then runs the server tests. Frontend unit tests do not need a database.

## Deploying

Each folder deploys on its own. Nothing outside it is needed for that deploy.

- **Web on Vercel:** import the repository, set Root Directory to `frontend`, and keep the Next.js preset. Environment: `API_URL` (the API's public URL) and `APP_URL` (the Vercel URL). Browser traffic to `/api/v1/*` and `/integrations/v1/*` is proxied to the API on the server, so there is no CORS and the session cookie just works. Live notifications use Server-Sent Events through the same proxy. Optionally set `NEXT_PUBLIC_REALTIME_URL` to the API's public URL (at build time) to open the stream straight to the API instead.
- **API on Heroku:** deploy this repository. The root `Procfile` supports a root deployment. `server/Procfile` supports a monorepo buildpack with `APP_BASE=server`. The release phase runs `prisma migrate deploy`. Publish course updates separately from the private `Edorax-core` workflow against the same database. The `build` script generates the Prisma client and compiles. Config vars: `DATABASE_URL`, `APP_URL` (the web URL, used in email links), `CORS_ORIGINS`, the email and OpenRouter keys from `server/.env.example`, and `CRON_SECRET`. Scheduled jobs (hourly study reminders, daily cleanup, and the daily weekly-goal and integrity jobs) run inside the process. Set `JOBS_ENABLED=false` on every dyno but one, or hand the schedule to an external scheduler calling `POST /api/v1/jobs/*` (study reminders hourly). The notification email worker also runs in the process and is safe on every dyno. With more than one dyno, set the same `REALTIME_TOKEN_SECRET` everywhere. See [`docs/12-notifications.mdx`](docs/12-notifications.mdx) for what live push needs across replicas.
- **Containers anywhere:** `docker build -f server/Dockerfile -t edorax-api .` and `docker build -t edorax-web frontend/` (Next.js standalone output). `docker compose --profile app up --build` runs Postgres, migrations, and both apps locally.
- **CI** (`.github/workflows/ci.yml`): one job per app (typecheck, lint, tests against Postgres, production build), a check that `frontend/src/shared` matches `server/src/shared`, and, on `main`, both image builds.

The live site is [www.edorax.com](https://www.edorax.com/).

## Project layout

```
frontend/                Web app (Next.js)
server/                  API (Express, Prisma, jobs, content scripts)
packages/learning-ui/    Shared canvases and visual labs
desktop/                 Electron desktop app
docs/                    Product and technical docs
docker-compose.yml       Local Postgres, and an optional full-stack profile
```

See [`docs/07-architecture.mdx`](docs/07-architecture.mdx) for the route and folder layout, and [`docs/11-decisions-and-open-questions.mdx`](docs/11-decisions-and-open-questions.mdx) for a running log of decisions, including places where the stack drifted from the original spec (for example Next.js 16 instead of 15, and Prisma 7's driver-adapter requirement).

The [desktop app](desktop/README.md) and the [API](server/README.md) have their own READMEs.

## Docs

Start at [`docs/README.mdx`](docs/README.mdx). Useful entry points:

- [Product overview](docs/00-product-overview.mdx)
- [Architecture](docs/07-architecture.mdx)
- [Learning areas](docs/16-learning-areas.mdx)
- [Content separation](docs/15-content-separation.mdx)
- [Capstone checks and certificates](docs/16-capstone-checker-and-certificates.mdx)
- [Organization API](docs/organization-api.mdx)
- [Notifications](docs/12-notifications.mdx)
- [Gamification](docs/14-gamification.mdx)

## Contributing

There is no `CONTRIBUTING` file in this repository yet. Open a pull request against `main`. After you edit contract code in `server/src/shared`, run `pnpm sync-shared` and commit the updated copy in `frontend/src/shared`.
