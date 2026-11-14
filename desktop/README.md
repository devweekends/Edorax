# Buildment desktop

Electron Forge + React + TypeScript + Tailwind CSS. Includes the public course catalog, dedicated course previews, public curriculum outlines, browser sign-in, and a branded startup loader. Includes an integrated course IDE with local and Docker workspaces.

From the repository root:

```powershell
pnpm --dir desktop install
# Start your configured backend separately:
pnpm --dir server dev
# In separate terminals:
pnpm --dir frontend dev
pnpm --dir desktop start
```

The backend defaults to `http://localhost:4000`. To connect to another deployment, set its origin before starting the app:

```powershell
$env:BUILDMENT_API_URL = 'https://your-api.example.com'
npm --prefix desktop start
```

Remote backends must use HTTPS. The API must implement `GET /api/v1/catalog`, returning the existing Buildment success envelope. The app imports only shared API types from `server/`; it does not bundle backend runtime code. Run install/build commands from this repository checkout.

Sign-in opens the default browser (Chrome if configured as default). The web app defaults to `http://localhost:3000`; configure `BUILDMENT_WEB_URL` alongside `BUILDMENT_API_URL` for other deployments. Deploy the included web connection page and backend desktop authorization/exchange endpoints together. A short-lived, single-use code with proof verification returns through a loopback callback. Session tokens remain in Electron main-process memory, and closing the app requires signing in again. No database migration is required.

Course requests run in Electron's main process over a narrowly scoped preload bridge. Renderer Node integration is disabled. There are no credentials, fixture courses, or secrets in the application. Cover images use remote HTTPS URLs or local HTTP URLs; missing images show a decorative placeholder.

```powershell
npm --prefix desktop run typecheck
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run test:ui
npm --prefix desktop run package
```

On Windows, after packaging, `cd desktop` and run `npx tsx tests/desktop-smoke.mts` to check the packaged application's real preload and HTTP connection against a temporary local test API. It closes the app when finished.

UI tests use isolated backend fixtures through a mocked desktop bridge and require a locally installed Chrome. They do not validate a live backend. Packaging produces an application in `desktop/out/`; `npm --prefix desktop run make` creates a platform-specific distributable. Signing and publishing are not configured.

## Source organization

- `src/api/`: backend clients; session tokens stay in the main process.
- `src/ui/layout/`: workspace header and sidebar.
- `src/ui/auth/`: session hook, account menu, and sign-in prompt.
- `src/ui/courses/`: catalog and preview views, course cards, summary, and curriculum.
- `src/ui/App.tsx`: composes views and preserves catalog filters and navigation state.

Keep backend calls in the API clients. Pass data and callbacks into display components; keep shared session state in the session hook.

Support files live in src/auth/ (browser sign-in), src/domain/ (course types and helpers), src/types/ (build declarations), and src/styles/ (CSS). The root keeps only Electron and renderer entry points: main.ts, preload.ts, renderer.tsx, and startup.ts.

Start learning opens a native React reader in the desktop app, with course curriculum replacing the catalog sidebar. Lessons, quizzes, grading, and progress use the backend through authenticated IPC. Browser sign-in still uses BUILDMENT_WEB_URL; reading does not embed the website. MDX is parsed as literal data without executing expressions. Callouts, diagrams, visual walkthroughs, media, roadmaps, file trees, request traces, and interactive canvases use the same rendering components as web.

Reader state, parsing, and IPC adapters live in src/ui/learning/ and src/learning/. Course-block renderers live in ../packages/learning-ui and are registered through its shared src/lesson-blocks.tsx map, also used by web. This includes labs, course content blocks, exercises, Checklist, and Learning Log. Keep desktop API/IPC work in host adapters and use the package components for block presentation and interaction. Both apps install the package as @buildment/learning-ui; after editing it, run install in each app to refresh its local snapshot. Desktop quizzes use the shared integrity hook through an IPC transport: focus and clipboard events, fullscreen reminders, and optional camera snapshots follow the web rules. Signals are advisory mentor notes and never automatically fail a learner. Snapshot capture requires consent; screenshot detection is best effort.

## Enrolled course overview

After enrollment, desktop uses the same `CourseOverviewContent` and variant picker as web from `@buildment/learning-ui`. The learner overview endpoint supplies progress, pending reviews, chapter checkpoints and locks, resume links, and course tracks. Keep presentation changes in the shared package; desktop's `EnrolledCourse` adapter owns IPC requests and native lesson navigation. Project showcase images use the configured `BUILDMENT_WEB_URL` origin. Variant and specialisation choices use narrowly scoped `learning:update-track` IPC calls; credentials remain in the main process.

For the hosted service on macOS:

```sh
BUILDMENT_API_URL=https://buildment-eca06ffd3e8f.herokuapp.com \
BUILDMENT_WEB_URL=https://edorax.com npm --prefix desktop start
```

The reader sidebar and heading outline are shared with web. Desktop bundles DM Sans, Unbounded, and JetBrains Mono locally, so typography does not require a font-network request. HTTPS links in lesson prose open in the system browser; same-course chapter links stay in the desktop reader.

## Shell labs

Shell labs come from the Edorax server (`GET /api/v1/shell-labs/version` and `/api/v1/shell-labs`), not from the installer. The app checks the version when it starts, after sign-in and when the Shell tab opens, and downloads the full list only when the version changed. The last good list is saved as `shell-labs.json` in the app's user data folder, so labs still open offline. A first start with no saved list and no network shows no labs until the app is online and signed in. For development and tests, the app falls back to a folder of YAML files when there is no saved list: `EDORAX_LABS_DIR`, or `desktop/labs/shell`. `pnpm sync:labs` (with `EDORAX_CORE_DIR` set to an Edorax Core checkout) fills that folder; it is no longer part of the installer.

## Forced updates

The server decides which app versions may run, and the admin dashboard controls the rules separately for each platform (macOS, Windows and Linux): the minimum version, the latest version, the download address, the message and a list of blocked versions. Every backend request from the app carries two headers: `X-Edorax-Desktop-Version` (the `version` in `desktop/package.json`, read with `app.getVersion()`) and `X-Edorax-Desktop-Platform` (`darwin`, `win32` or `linux`, from `process.platform`; the platform header is left out on any other platform). The app reads its rules at `GET /api/v1/desktop/version?platform=<platform>`, which answers `{ minimumVersion, latestVersion, downloadUrl, message, blockedVersions }` (a missing `blockedVersions` counts as an empty list). A version below the minimum, or exactly equal to one of the blocked versions (build info after `+` is ignored), gets HTTP 426 with the code `DESKTOP_UPDATE_REQUIRED`, and the app then shows a full-window "Update required" screen that cannot be closed, with a download button (https addresses only) and a "Check again" button. A blocked version stays blocked even when it is the latest or above the minimum; its screen says "This version (X) has a known problem. Install version Y to continue." A version below the latest that is not required only sees a small banner that can be dismissed. The app reads the policy at start, every 4 hours and when the window gets focus (at most once per 10 minutes), and saves the last good one, with its platform, as `update-policy.json` in the user data folder (a file saved for another platform is ignored; an older file without `blockedVersions` still loads). Offline, an app already known to be too old or blocked stays blocked; an app that has never read a policy is not blocked, and bad or missing version data never blocks anyone (an invalid entry in `blockedVersions` is ignored, not the whole policy). Apps built before this feature send no version and cannot be forced. Every release must raise `version` in `desktop/package.json`, or the check cannot tell the new build from the old one.

## Edorax branding

The desktop name is Edorax. Sidebar/startup branding and packaged/Dock icons use `frontend/public/logo.svg`, the web app's current mark. After a web logo change, run `node desktop/scripts/sync-brand.mjs` on macOS with frontend dependencies installed to regenerate the SVG copy and PNG/ICNS/ICO assets. Restart Electron to refresh the native app name and Dock icon.

Quiz results and confirmed chapter completion use the shared web feedback player and bundled audio assets. The existing `buildment:sound=off` preference and reduced-motion setting suppress playback; unavailable audio must not block saving answers or progress.

## Course IDE: local projects and Docker

Open a course lesson and select **Open IDE** in the toolbar. The panel opens on
the right; **Focus IDE** expands it. **Open in IDE** on a code activity opens that
exercise's shared instructions, hints, checks and completion feedback. Tabs switch
between course practice and the lesson exercise. Closing the panel keeps its state
while the reader remains mounted.

Ordinary lesson code fences use Shiki's GitHub light/dark themes and the same
copy/language toolbar as the web reader. **Open in IDE** imports a snippet into
practice, with confirmation before replacing the buffer and closing file tabs.
It never executes code automatically. Save the snippet to the selected folder
before running it in the terminal.

**New project** creates a new folder at a location chosen with a native dialog;
it refuses an existing path. **Open folder** opens an existing project.
**Files** and **Browser** switch the workspace view; an active terminal can be
shown/hidden below without losing its session. Browser preview accepts HTTPS or
localhost/127.0.0.1 HTTP addresses. Its sandbox has no desktop bridge, project file,
or Edorax session access. Websites may refuse embedding, and apps requiring
same-origin storage may not work in this sandbox. Start development servers in
Local mode; Docker workspaces currently have no published ports/network.

Workspace status refreshes every five seconds while idle. If Docker is stopped or
unreachable, the panel asks you to open Docker Desktop; if only the lab container
is stopped, it offers **Start terminal** to resume. **Retry status** checks immediately.
A failed terminal attachment closes the stale terminal view and restores the start
action instead of leaving an Electron IPC error on screen.

Choose a runtime inside the IDE:

- **Local machine** (default): use **Open folder** to select a real project folder.
  The explorer reads that folder, Save file writes to it, and Start terminal opens
  the user's shell there. No Docker engine or workspace authentication is needed.
  Commands run on the user's machine with their normal account permissions.
- **Docker Linux**: Start terminal prepares an isolated Node 22 Linux workspace
  backed by a persistent volume. This mode requires Docker and authorized course
  access. Sign-in identity is resolved using the authenticated `/auth/me` endpoint,
  since desktop token exchange does not include a user object.

The project explorer supports nested folders, new files/folders, file tabs, saving,
and refresh. Refresh picks up terminal-created files. Files must be text up to
64 KB; the explorer limits listings to 200 entries and eight levels, and hides
node_modules/.git. Symbolic links and paths outside the selected project are
rejected. Local files are never bulk-reset. Save files before changing runtime or
project folder; non-entry-file drafts are scoped to the current panel session.

The editor's course answer is represented by `exercise.js`; use **Save to
workspace** to write it, or **Load from workspace** to import terminal changes
with confirmation. **Check my code** submits the editor's exercise.js through the
existing course API and refreshes progress. Extra project files are for practice;
the existing server grader still accepts a single JavaScript source file. Local
code can run without course submission; course grading still requires sign-in.

Docker workspaces are scoped by account and exercise/course. They have no network,
no host-directory or Docker-socket mounts, a read-only root, dropped capabilities,
and CPU/memory/process limits. Stop preserves their files; Reset asks before
removing that Docker workspace. Closing the panel preserves sessions; leaving the
lesson closes its terminal connection but Docker containers remain running until
stopped. Docker volume disk use is not quota-limited.

Local terminal uses node-pty. `scripts/prepare-pty.mjs` repairs macOS prebuilt
spawn-helper execute permissions during install/build. Forge includes the native
module and unpacks it outside ASAR so the helper can run. Load the module through
the app.asar path: node-pty performs its own helper-path translation. Mac ARM64 is tested;
Windows and Intel Mac still need runtime validation.

This is a project editor and terminal, not a full VS Code extension host.
Course-authored Linux/system lab contracts, other graded languages, multi-file
server grading, code-server, and AWS environments remain separate follow-up work.

Validation (repository root, run browser tests and packaging sequentially):

```sh
npm --prefix desktop run typecheck
npm --prefix frontend run typecheck
npm --prefix desktop test
npm --prefix desktop run test:labs
TEST_UI_PORT=5193 npm --prefix desktop run test:ui -- --workers=1
npm --prefix desktop run package
```

The real Docker test uses its own integration scope and skips existing resources.
Local filesystem/PTY tests use temporary folders and remove only their own files.

### Course folders and standalone terminal

Each course remembers its native-selected project folder across app restarts.
The IDE toolbar always exposes **Open folder** and **New project**; new projects
start empty. Switching courses restores that course's folder when the IDE opens.
A missing/moved folder shows a recovery message rather than opening another course.
Only one Theia backend is active: switching to another course's IDE closes the
previous backend (save your work first).

**Terminal** in the lesson toolbar opens a separate local xterm panel without
starting Theia. It starts in the course folder, or the user's home directory when
no folder has been selected. Hiding the panel preserves the shell; leaving the
course closes its connection. Changing the course project folder restarts the
terminal in the new folder when it is next opened.

Shell snippets expose **Run in terminal**, which submits their contents to the
local shell. The existing Docker exercise workspace remains separate from this
standalone terminal. New local projects start empty; no course template is generated.
The lesson toolbar keeps Close, Focus, Open folder, and New project accessible.
