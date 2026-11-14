import { execFile } from 'node:child_process';
import { screen as electronScreen } from 'electron';
import { isAllowedRemoteRequest, isAllowedWebPath } from './domain/remote';
import { installIDE } from './ide/controller';
import { CourseFolders, validateCourse } from './ide/course-folders';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';

// Prevent npm lifecycle environment variables from leaking to child processes and breaking tools like nvm
for (const key of Object.keys(process.env)) {
  if (key.toLowerCase().startsWith('npm_')) {
    delete process.env[key];
  }
}

import { LocalRuntime } from './labs/local-runtime';
import {
  app,
  dialog,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { backendBase } from './api';
import { loadAudiobookLibrary } from './audiobooks/library';
import { downloadBook, registerAudioProtocol, registerAudioScheme, removeBook } from './audiobooks/offline';

registerAudioScheme();
import { createPreviewClient } from './api';
import { setDesktopVersion } from './api/client-info';
import { createUpdateService } from './update/update-service';
import { createBrowserAuth } from './auth/browser-auth';
import { OfflineStore, type DownloadedCourse, prepareEncryption } from './offline/store';

import { LabRuntime, localDocker } from './labs/runtime';
import { ShellLabRuntime } from './shell-labs/runtime';
import { defaultDownloadsDir, dockerReadiness, setUpDocker, startDockerDesktop } from './shell-labs/docker-setup';
import { configureShellLabs, getShellLab, getShellLabs, refreshShellLabs } from './shell-labs/catalog';
import { devShellLabsDir } from './shell-labs/loader';
import { shellLabSummary, shellLabView, type ShellLabsRefresh } from './domain/shell-labs';

let ideController: ReturnType<typeof installIDE> | undefined;
const locals = new Map<string, LocalRuntime>();
const labs = new Map<string, LabRuntime>();
const shellLabs = new Map<string, ShellLabRuntime>();
const runtimeRequire = createRequire(__filename);
function disposeLabs() {
  for (const lab of labs.values()) lab.dispose();
  labs.clear();
  for (const local of locals.values()) local.dispose();
  locals.clear();
  for (const shell of shellLabs.values()) shell.dispose();
  shellLabs.clear();
}
/**
 * Downloads newer shell labs when the server has them. Never throws. A running lab keeps the lab
 * object it started with; new definitions apply to labs opened afterwards. Runtimes with no terminal
 * attached are dropped for labs whose definition changed, so the next open uses the new one.
 */
async function refreshLabsFromServer(): Promise<ShellLabsRefresh> {
  const { changed, ...answer } = await refreshShellLabs(async (apiPath) =>
    previewClient.sessionSnapshot()
      ? previewClient.request(apiPath, 'GET')
      : { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to download labs.' },
  );
  for (const [scope, runtime] of shellLabs)
    if (changed.some((slug) => scope.endsWith(`:shell:${slug}`)) && runtime.idle()) {
      runtime.dispose();
      shellLabs.delete(scope);
    }
  return answer;
}
async function shellLabRuntime(slug: unknown) {
  const lab = getShellLab(slug);
  if (!lab) throw new Error('Unknown shell lab.');
  const user = await previewClient.resolveLocalLabUser();
  if (!user) throw new Error('Sign in to open a shell lab.');
  const scope = `${user}:shell:${lab.slug}`;
  if (!shellLabs.has(scope))
    shellLabs.set(
      scope,
      new ShellLabRuntime(localDocker(), lab, scope, (data) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('shell-labs:terminal-data', data);
      }, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('shell-labs:start-progress', { slug: lab.slug, ...progress });
      }),
    );
  return shellLabs.get(scope)!;
}
async function labRuntime(blockId: string) {
  if (
    typeof blockId !== 'string' ||
    !/^(course:)?[a-zA-Z0-9_-]{1,160}$/.test(blockId)
  )
    throw new Error('Invalid course exercise.');
  if (locals.has(blockId)) return locals.get(blockId)!;
  const user = await previewClient.resolveLocalLabUser();
  if (!user) throw new Error('Sign in to open a course workspace.');
  const scope = `${user}:${blockId}`;
  const existing = labs.get(scope);
  if (existing) return existing;
  let starter: string;
  if (blockId.startsWith('course:')) {
    const result = await courseOverview(blockId.slice(7));
    if (!result.ok) throw new Error(result.message);
    if (result.data.access !== 'active')
      throw new Error('Enroll in this course to start its workspace.');
    starter = '// Course workspace\nconsole.log("Ready to learn");\n';
  } else {
    const result = await blockState(blockId);
    if (!result.ok) throw new Error(result.message);
    if (
      result.data.type !== 'CODE' ||
      result.data.config.language !== 'javascript'
    )
      throw new Error(
        'This course activity does not support a local code workspace.',
      );
    starter =
      result.data.initialState?.source ?? result.data.config.starterCode;
  }
  if (previewClient.localLabUser() !== user)
    throw new Error('Your session changed. Reopen the workspace.');
  // Recheck after authorization to avoid duplicate runtimes from concurrent requests.
  if (!labs.has(scope))
    labs.set(
      scope,
      new LabRuntime(
        localDocker(),
        (data) => {
          if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('labs:terminal-data', data);
        },
        scope,
        starter,
      ),
    );
  return labs.get(scope)!;
}
app.setName('Edorax');
const iconFile =
  process.platform === 'darwin' ? 'edorax-dock.png' : 'edorax.png';
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, iconFile)
  : path.join(app.getAppPath(), 'assets', iconFile);

let mainWindow: BrowserWindow | null = null;

// Quiz lockdown: while a quiz is open the window stays on top, is excluded from screenshots and
// screen recording (Windows), and copy, paste, print, save, reload and devtools shortcuts are blocked.
// The web integrity rules still apply: leaving full screen is noted and the quiz is covered.
let quizLockdownActive = false;
const LOCKED_SHORTCUT_KEYS = new Set(['c', 'x', 'v', 'p', 's', 'u', 'r', 'i', 'insert']);
function applyQuizLockdown(active: boolean) {
  quizLockdownActive = active;
  setQuizDisplayMode(active);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Kiosk hides the window frame and taskbar. It is used only while a quiz is open; the
  // Exit quiz button restores the normal window. Alt+F4 still closes the app.
  if (active) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setKiosk(true);
    mainWindow.setFullScreen(true);
  } else {
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setMenuBarVisibility(true);
  }
  mainWindow.setAlwaysOnTop(active, 'screen-saver');
  mainWindow.setContentProtection(active);
}
// Windows only: DisplaySwitch.exe switches between PC-screen-only, duplicate and extended modes.
// Quiz mode uses /internal (PC screen only) and restores /extend when the quiz ends.
let displayModeChangedForQuiz = false;
function setQuizDisplayMode(active: boolean) {
  if (process.platform !== 'win32') return;
  if (active) {
    if (screenCount() <= 1) return;
    displayModeChangedForQuiz = true;
    execFile('DisplaySwitch.exe', ['/internal'], () => undefined);
  } else if (displayModeChangedForQuiz) {
    displayModeChangedForQuiz = false;
    execFile('DisplaySwitch.exe', ['/extend'], () => undefined);
  }
}
function screenCount() {
  return electronScreen.getAllDisplays().length;
}
function notifyQuizScreens() {
  if (quizLockdownActive && mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('quiz:screens', { screens: screenCount() });
}
function guardQuizShortcuts(webContents: Electron.WebContents) {
  webContents.on('before-input-event', (event, input) => {
    if (!quizLockdownActive || input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const shortcut = input.control || input.meta;
    const blocked =
      (shortcut && LOCKED_SHORTCUT_KEYS.has(key)) ||
      (input.shift && key === 'insert') ||
      key === 'f12' ||
      key === 'f5' ||
      key === 'printscreen';
    if (blocked) event.preventDefault();
  });
}
const apiBase =
  process.env.BUILDMENT_API_URL ||
  'https://buildment-eca06ffd3e8f.herokuapp.com';
// Every backend request carries this version; a server that wants a newer app answers 426.
setDesktopVersion(app.getVersion());
const appUpdates = createUpdateService({
  currentVersion: app.getVersion(),
  base: apiBase,
  file: path.join(app.getPath('userData'), 'update-policy.json'),
  openExternal: (url) => shell.openExternal(url),
  onChange: (state) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('app:update-status-changed', state);
  },
});
const previewClient = createPreviewClient(apiBase, fetch, {
  onUpdateRequired: (info) => appUpdates.noteUpdateRequired(info),
});
const offline = new OfflineStore();
const courseFolders = new CourseFolders(
  path.join(app.getPath('userData'), 'course-folders.json'),
);
const connectionFailure = (result: { ok: boolean; code?: string }) =>
  !result.ok && result.code === 'CONNECTION_ERROR';
async function courseOverview(slug: string) {
  if (offline.pending().length) {
    const synced = await syncPending();
    if (synced.pending) {
      const saved = offline.course(slug);
      if (synced.code === 'CONNECTION_ERROR' && saved)
        return { ok: true as const, data: saved.overview };
      return {
        ok: false as const,
        code: synced.code ?? 'SYNC_REQUIRED',
        message: `Could not sync your offline changes: ${synced.message}`,
      };
    }
  }
  const result = await previewClient.learning.overview(slug);
  const saved = offline.course(slug);
  return connectionFailure(result) && saved
    ? { ok: true as const, data: saved.overview }
    : result;
}
async function blockState(id: string) {
  const result = await previewClient.learning.block(id);
  if (!connectionFailure(result)) return result;
  const saved = offline
    .courses()
    .map((course) => course.blocks[id])
    .find(Boolean);
  return saved ? { ok: true as const, data: saved } : result;
}
export type SyncStatus = {
  pending: number;
  message: string | null;
  code: string | null;
  /** Changes that reached the server during this run. */
  synced: number;
  /** Messages for changes the server rejected; those changes are removed from the queue. */
  dropped: string[];
};
let syncTask: Promise<SyncStatus> | null = null;
function broadcastSync(status: SyncStatus) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('offline:sync-status', status);
}
function pushChange(change: ReturnType<typeof offline.pending>[number]) {
  if (change.kind === 'log')
    return previewClient.learning.saveLog(change.chapterId, change.answers);
  if (change.kind === 'checklist')
    return previewClient.learning.checklist(change.chapterId, change.item, change.checked);
  return previewClient.learning.complete(change.chapterId);
}
function syncPending(): Promise<SyncStatus> {
  if (syncTask) return syncTask;
  syncTask = (async (): Promise<SyncStatus> => {
    let synced = 0;
    const dropped: string[] = [];
    for (const change of offline.pending()) {
      const result = await pushChange(change);
      if (connectionFailure(result)) {
        // Still offline: keep everything queued, in order, and try again later.
        const status: SyncStatus = {
          pending: offline.pending().length,
          message: 'Waiting for a connection to sync your changes.',
          code: 'CONNECTION_ERROR',
          synced,
          dropped,
        };
        broadcastSync(status);
        return status;
      }
      // The server rejected this change (for example, the chapter is now locked). Retrying will not
      // help, so remove it and let the learner know, instead of blocking every change behind it.
      if (result.ok) synced += 1;
      else dropped.push(result.message);
      await offline.shiftPending();
    }
    const pending = offline.pending().length;
    const status: SyncStatus = {
      pending,
      message: pending ? 'New changes are still waiting to sync.' : null,
      code: null,
      synced,
      dropped,
    };
    broadcastSync(status);
    return status;
  })().finally(() => {
    syncTask = null;
  });
  return syncTask;
}
async function downloadCourse(slug: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug))
    return {
      ok: false as const,
      code: 'INVALID_INPUT',
      message: 'Invalid course.',
    };
  if (!offline.available())
    return {
      ok: false as const,
      code: 'SECURE_STORAGE_UNAVAILABLE',
      message:
        'Secure system storage is unavailable. Enable your OS keyring to download courses.',
    };
  if (!previewClient.sessionSnapshot())
    return {
      ok: false as const,
      code: 'AUTH_REQUIRED',
      message: 'Sign in while online before downloading a course.',
    };
  const synced = await syncPending();
  if (synced.pending)
    return {
      ok: false as const,
      code: 'SYNC_REQUIRED',
      message: `Sync saved changes before updating this course: ${synced.message}`,
    };
  const overview = await previewClient.learning.overview(slug);
  if (!overview.ok) return overview;
  if (overview.data.access !== 'active' || !overview.data.syllabus)
    return {
      ok: false as const,
      code: 'ACCESS_REQUIRED',
      message: 'Enroll in this course before downloading it.',
    };
  const [catalog, detail] = await Promise.all([
    previewClient.listCourses(),
    previewClient.courseDetail(slug),
  ]);
  if (!catalog.ok)
    return {
      ok: false as const,
      code: 'DOWNLOAD_FAILED',
      message: catalog.message,
    };
  if (!detail.ok) return detail;
  const summary = catalog.courses.find((course) => course.slug === slug);
  if (!summary || detail.data.access !== 'active')
    return {
      ok: false as const,
      code: 'ACCESS_REQUIRED',
      message: 'This course is not available for download.',
    };
  const lessons: DownloadedCourse['lessons'] = {};
  const blocks: DownloadedCourse['blocks'] = {};
  let releaseId: string | null = null;
  let locked = 0;
  const chapters = overview.data.syllabus.modules.flatMap(
    (module) => module.chapters,
  );
  for (const chapter of chapters) {
    const result = await previewClient.learning.downloadChapter(
      slug,
      chapter.slug,
    );
    if (!result.ok) return result;
    if (releaseId && releaseId !== result.data.releaseId)
      return {
        ok: false as const,
        code: 'RELEASE_CHANGED',
        message: 'The course changed during download. Please try again.',
      };
    releaseId = result.data.releaseId;
    lessons[chapter.slug] = result.data.lesson;
    if (result.data.lesson.locked || !result.data.lesson.content) {
      locked++;
      continue;
    }
    Object.assign(blocks, result.data.blocks);
  }
  const unlocked = Object.keys(lessons).length - locked;
  if (!releaseId || unlocked === 0)
    return {
      ok: false as const,
      code: 'NO_LESSONS',
      message: 'No unlocked lessons are available to download yet.',
    };
  // The package replaces the previous download only after every request succeeds.
  await offline.setCourse(slug, {
    releaseId,
    downloadedAt: new Date().toISOString(),
    summary,
    detail: detail.data,
    overview: overview.data,
    lessons,
    blocks,
  });
  return { ok: true as const, data: { chapters: unlocked, locked } };
}
const browserAuth = createBrowserAuth(
  process.env.BUILDMENT_WEB_URL || 'https://edorax.com',
  previewClient.exchange,
  (url) => shell.openExternal(url),
);
function cancelBrowserAuth() {
  previewClient.cancelSignIn();
  browserAuth.cancel();
}
app.on('before-quit', () => {
  appUpdates.stop();
  cancelBrowserAuth();
  disposeLabs();
});
function requireRenderer(event: IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error('Untrusted request');
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'fileMenu' as const },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
  mainWindow = new BrowserWindow({
    title: 'Edorax',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 20 },
        }
      : {}),
    icon: appIcon,
    width: 1240,
    height: 840,
    minWidth: 760,
    minHeight: 600,
    // Never expose the native window's empty surface before the first paint.
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141310' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const window = mainWindow;
  window.on('focus', () => appUpdates.onFocus());
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Reading references open in the browser; no remote Electron windows.
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (
      MAIN_WINDOW_VITE_DEV_SERVER_URL &&
      url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    )
      return;
    event.preventDefault();
  });
  mainWindow.webContents.on('did-start-loading', () => {
    ideController?.hide();
  });
  // Camera access is requested only by the quiz's explicit opt-in control.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const trusted =
        contents === mainWindow?.webContents && details.isMainFrame;
      const videoOnly =
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'video';
      callback(Boolean(trusted && permission === 'media' && videoOnly));
    },
  );
  mainWindow.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) => {
      return (
        contents === mainWindow?.webContents &&
        permission === 'media' &&
        details.mediaType === 'video'
      );
    },
  );
  mainWindow.webContents.on('render-process-gone', () => {
    disposeLabs();
    void ideController?.stop();
  });
  mainWindow.on('closed', () => {
    void ideController?.stop();
    disposeLabs();
    mainWindow = null;
  });
  const showLoadError = (error: unknown) => {
    if (
      MAIN_WINDOW_VITE_DEV_SERVER_URL &&
      (error as { code?: string })?.code === 'ERR_ABORTED' &&
      !window.isDestroyed()
    ) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          void window
            .loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
            .catch(showLoadError);
        }
      }, 500);
      return;
    }
    console.error('Could not load the Edorax renderer:', error);
    if (window.isDestroyed()) return;
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><title>Edorax</title></head><body style="background:#ffffff;color:#171717;padding:48px;font:16px Segoe UI,sans-serif"><h1>Edorax could not open</h1><p>The local interface could not be loaded.</p><p>Close this window, stop the development command with Ctrl+C, and run <strong>pnpm start</strong> again from the desktop folder.</p></body></html>';
    void window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
  };
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    void mainWindow
      .loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      .catch(showLoadError);
  else
    void mainWindow
      .loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      )
      .catch(showLoadError);
}

if (started) app.quit();
else {
  app.whenReady().then(async () => {
    await prepareEncryption();
    registerAudioProtocol();
    await offline.open();
    const saved = offline.session();
    if (saved) previewClient.restoreSession(saved);
    // Labs: the saved copy first, else the development folder; then ask the server without waiting.
    configureShellLabs({
      cacheFile: path.join(app.getPath('userData'), 'shell-labs.json'),
      devDir: devShellLabsDir(),
    });
    appUpdates.start();
    void refreshLabsFromServer();
    app.setAboutPanelOptions({
      applicationName: 'Edorax',
      applicationVersion: app.getVersion(),
    });
    installApplicationMenu();
    ideController = installIDE(
      () => mainWindow,
      requireRenderer,
      courseFolders,
    );
    ipcMain.handle('labs:prepare-terminal', async (event, course) => {
      requireRenderer(event);
      validateCourse(course);
      const blockId = `terminal-${createHash('sha256').update(course).digest('hex')}`;
      let folder: string;
      try {
        folder = (await courseFolders.get(course)) ?? app.getPath('home');
      } catch {
        // A missing or moved course folder never blocks the terminal.
        folder = app.getPath('home');
      }
      if (locals.get(blockId)?.root !== folder) {
        locals.get(blockId)?.dispose();
        const pty = runtimeRequire(
          path.join(app.getAppPath(), 'node_modules/node-pty'),
        );
        locals.set(
          blockId,
          new LocalRuntime(folder, pty, (data) => {
            if (mainWindow && !mainWindow.isDestroyed())
              mainWindow.webContents.send('labs:terminal-data', data);
          }),
        );
      }
      await locals.get(blockId)!.start();
      return { blockId, folder };
    });
    ipcMain.handle(
      'labs:configure',
      async (event, blockId, mode, createProject) => {
        requireRenderer(event);
        if (
          typeof blockId !== 'string' ||
          !/^(course:)?[a-zA-Z0-9_-]{1,160}$/.test(blockId)
        )
          throw new Error('Invalid workspace.');
        if (mode === 'local') {
          let selectedPath: string;
          if (createProject === true) {
            const selection = await dialog.showSaveDialog(mainWindow!, {
              title: 'Create project folder',
              buttonLabel: 'Create project',
              defaultPath: path.join(
                app.getPath('documents'),
                'edorax-project',
              ),
            });
            if (selection.canceled || !selection.filePath) return null;
            await mkdir(selection.filePath);
            selectedPath = selection.filePath;
          } else {
            const selection = await dialog.showOpenDialog(mainWindow!, {
              title: 'Open local project folder',
              properties: ['openDirectory', 'createDirectory'],
            });
            if (selection.canceled || !selection.filePaths[0]) return null;
            selectedPath = selection.filePaths[0];
          }
          const root = await realpath(selectedPath);
          const pty = runtimeRequire(
            app.isPackaged
              ? path.join(
                  process.resourcesPath,
                  'app.asar/node_modules/node-pty',
                )
              : path.join(app.getAppPath(), 'node_modules/node-pty'),
          );
          labs.get(`${previewClient.localLabUser()}:${blockId}`)?.dispose();
          locals.get(blockId)?.dispose();
          locals.set(
            blockId,
            new LocalRuntime(root, pty, (data) => {
              if (mainWindow && !mainWindow.isDestroyed())
                mainWindow.webContents.send('labs:terminal-data', data);
            }),
          );
          return { mode, folder: root };
        }
        if (mode !== 'docker') throw new Error('Unknown runtime.');
        locals.get(blockId)?.dispose();
        locals.delete(blockId);
        return { mode };
      },
    );
    const labHandlers: Record<
      string,
      (lab: LabRuntime | LocalRuntime, ...args: any[]) => unknown
    > = {
      files: (lab) => lab.listFiles(),
      'file-read': (lab, path) => lab.readProjectFile(path),
      'file-save': (lab, path, content) => lab.saveProjectFile(path, content),
      'file-create': (lab, path, kind) => lab.createEntry(path, kind),
      status: (lab) => lab.status(),
      start: (lab) => lab.start(),
      stop: (lab) => lab.stop(),
      reset: (lab) => lab.reset(),
      'read-file': (lab) => lab.readFile(),
      'save-file': (lab, content) => lab.saveFile(content),
      'terminal-open': (lab, id) => lab.openTerminal(id),
      'terminal-close': (lab, id) => lab.closeTerminal(id),
      'terminal-input': (lab, id, data) => lab.terminalInput(id, data),
      'terminal-resize': (lab, id, cols, rows) =>
        lab.resizeTerminal(id, cols, rows),
    };
    for (const [name, handler] of Object.entries(labHandlers)) {
      ipcMain.handle(`labs:${name}`, async (event, blockId, ...args) => {
        requireRenderer(event);
        return handler(await labRuntime(blockId), ...args);
      });
    }
    // Docker setup. Everything here is the learner pressing a button; nothing installs by itself.
    let dockerSetupRunning: Promise<unknown> | null = null;
    ipcMain.handle('shell-labs:docker-state', (event) => {
      requireRenderer(event);
      return dockerReadiness(localDocker());
    });
    ipcMain.handle('shell-labs:docker-start', (event) => {
      requireRenderer(event);
      return startDockerDesktop();
    });
    ipcMain.handle('shell-labs:docker-setup', async (event) => {
      requireRenderer(event);
      if (dockerSetupRunning) throw new Error('Docker setup is already running.');
      const send = (progress: unknown) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shell-labs:docker-progress', progress);
      };
      const run = setUpDocker(send, {
        platform: process.platform,
        arch: process.arch,
        downloadsDir: defaultDownloadsDir(app.getPath('downloads')),
        openPath: (file) => shell.openPath(file),
        openExternal: (url) => shell.openExternal(url),
        showInFolder: (file) => shell.showItemInFolder(file),
      });
      dockerSetupRunning = run;
      try {
        return await run;
      } finally {
        dockerSetupRunning = null;
      }
    });
    ipcMain.handle('shell-labs:list', (event) => {
      requireRenderer(event);
      return getShellLabs().map(shellLabSummary);
    });
    ipcMain.handle('shell-labs:refresh', (event) => {
      requireRenderer(event);
      return refreshLabsFromServer();
    });
    ipcMain.handle('shell-labs:view', (event, slug) => {
      requireRenderer(event);
      const lab = getShellLab(slug);
      if (!lab) throw new Error('Unknown shell lab.');
      return shellLabView(lab);
    });
    const shellHandlers: Record<
      string,
      (lab: ShellLabRuntime, ...args: unknown[]) => unknown
    > = {
      status: (lab) => lab.status(),
      start: (lab) => lab.start(),
      stop: (lab) => lab.stop(),
      reset: (lab) => lab.reset(),
      check: (lab, stepId) => lab.check(stepId),
      'check-all': (lab) => lab.checkAll(),
      answer: (lab, stepId, option) => lab.answer(stepId, option),
      'terminal-open': (lab, id) => lab.openTerminal(id),
      'terminal-close': (lab, id) => lab.closeTerminal(id),
      'terminal-input': (lab, id, data) => lab.terminalInput(id, data),
      'terminal-resize': (lab, id, cols, rows) =>
        lab.resizeTerminal(id, cols, rows),
    };
    for (const [name, handler] of Object.entries(shellHandlers)) {
      ipcMain.handle(`shell-labs:${name}`, async (event, slug, ...args) => {
        requireRenderer(event);
        return handler(await shellLabRuntime(slug), ...args);
      });
    }
    ipcMain.handle('course:start-learning', (event, slug) => {
      requireRenderer(event);
      return previewClient.nextLesson(slug).then((result) => {
        if (!connectionFailure(result)) return result;
        const href = offline.course(slug)?.overview.syllabus?.continueHref;
        return href ? { ok: true as const, data: { href } } : result;
      });
    });
    ipcMain.handle('app:update-status', (event) => {
      requireRenderer(event);
      return appUpdates.state();
    });
    ipcMain.handle('app:update-check', (event) => {
      requireRenderer(event);
      return appUpdates.check();
    });
    ipcMain.handle('app:open-download', (event) => {
      requireRenderer(event);
      return appUpdates.openDownload();
    });
    ipcMain.handle('app:web-origin', (event) => {
      requireRenderer(event);
      return new URL(process.env.BUILDMENT_WEB_URL || 'http://localhost:3000')
        .origin;
    });
    ipcMain.handle('learning:integrity', (event, path, method, body) => {
      requireRenderer(event);
      return previewClient.integrityRequest(path, method, body);
    });
    ipcMain.handle('learning:lesson', (event, course, chapter) => {
      requireRenderer(event);
      return previewClient.learning.lesson(course, chapter).then((result) =>
        connectionFailure(result) && offline.course(course)?.lessons[chapter]
          ? {
              ok: true as const,
              data: offline.course(course)!.lessons[chapter]!,
            }
          : result,
      );
    });
    ipcMain.handle('learning:update-track', (event, course, kind, slug) => {
      requireRenderer(event);
      return previewClient.learning.updateTrack(course, kind, slug);
    });
    ipcMain.handle('learning:overview', (event, course) => {
      requireRenderer(event);
      return courseOverview(course);
    });
    ipcMain.handle('learning:upgrade-curriculum', (event, course) => {
      requireRenderer(event);
      return previewClient.learning.upgradeCurriculum(course);
    });
    ipcMain.handle('learning:block', (event, id) => {
      requireRenderer(event);
      return blockState(id);
    });
    ipcMain.handle('learning:ai-interview', (event, id, action, payload) => {
      requireRenderer(event);
      return previewClient.learning.aiInterview(id, action, payload);
    });
    ipcMain.handle('learning:answer', (event, id, payload) => {
      requireRenderer(event);
      return previewClient.learning.answer(id, payload);
    });
    ipcMain.handle('learning:quiz', (event, id) => {
      requireRenderer(event);
      return previewClient.learning.quiz(id);
    });
    ipcMain.handle('learning:submit-quiz', (event, id, answers) => {
      requireRenderer(event);
      return previewClient.learning.submitQuiz(id, answers);
    });
    ipcMain.handle('learning:complete', (event, id) => {
      requireRenderer(event);
      return previewClient.learning.complete(id).then(async (result) => {
        if (!connectionFailure(result) || typeof id !== 'string' || !id || id.length > 200)
          return result;
        await offline.queueAction({ kind: 'complete', chapterId: id });
        broadcastSync({ pending: offline.pending().length, message: 'Saved offline.', code: 'QUEUED', synced: 0, dropped: [] });
        return { ok: true as const, data: { queued: true } };
      });
    });
    ipcMain.handle('learning:save-log', (event, id, answers) => {
      requireRenderer(event);
      return previewClient.learning
        .saveLog(id, answers)
        .then(async (result) => {
          if (!connectionFailure(result)) return result;
          if (
            typeof id !== 'string' ||
            !answers ||
            typeof answers !== 'object' ||
            Object.values(answers).some((value) => typeof value !== 'string') ||
            !offline.hasChapter(id)
          )
            return result;
          await offline.queue({ kind: 'log', chapterId: id, answers });
          return { ok: true as const, data: null };
        });
    });
    ipcMain.handle('learning:checklist', (event, id, item, checked) => {
      requireRenderer(event);
      return previewClient.learning
        .checklist(id, item, checked)
        .then(async (result) => {
          if (!connectionFailure(result)) return result;
          if (
            typeof id !== 'string' ||
            typeof item !== 'string' ||
            typeof checked !== 'boolean' ||
            !offline.hasChapter(id)
          )
            return result;
          await offline.queue({
            kind: 'checklist',
            chapterId: id,
            item,
            checked,
          });
          return { ok: true as const, data: null };
        });
    });
    ipcMain.handle('enrollment:create', (event, courseId) => {
      requireRenderer(event);
      return previewClient.enroll(courseId);
    });
    ipcMain.handle('catalog:detail', (event, slug) => {
      requireRenderer(event);
      return previewClient
        .courseDetail(slug)
        .then((result) =>
          connectionFailure(result) && offline.course(slug)
            ? { ok: true as const, data: offline.course(slug)!.detail }
            : result,
        );
    });
    ipcMain.handle('learner:profile', (event) => {
      requireRenderer(event);
      return previewClient.learnerProfile();
    });
    ipcMain.handle('leaderboard:context', (event) => {
      requireRenderer(event);
      return previewClient.leaderboardContext();
    });
    ipcMain.handle('leaderboard:hub', (event, selection) => {
      requireRenderer(event);
      return previewClient.leaderboardHub(selection);
    });
    ipcMain.handle('leaderboard:opt-in', (event, optIn) => {
      requireRenderer(event);
      return previewClient.setLeaderboardOptIn(optIn);
    });
    ipcMain.handle('remote:request', (event, path, method, body) => {
      requireRenderer(event);
      if (!isAllowedRemoteRequest(path, method)) {
        return { ok: false as const, code: 'FORBIDDEN', message: 'This action is not available on desktop.' };
      }
      return previewClient.request(path as string, method as string, body);
    });
    ipcMain.handle('app:open-web', (event, path) => {
      requireRenderer(event);
      if (!isAllowedWebPath(path)) return;
      void shell.openExternal(
        new URL(path as string, process.env.BUILDMENT_WEB_URL || 'https://edorax.com').toString(),
      );
    });
    ipcMain.handle('learner:home', (event) => {
      requireRenderer(event);
      return previewClient.learnerHome();
    });
    ipcMain.handle('learner:progress', (event) => {
      requireRenderer(event);
      return previewClient.learnerProgress();
    });
    ipcMain.handle('auth:status', async (event) => {
      requireRenderer(event);
      const result = await previewClient.authStatus();
      if (result.ok && result.data.signedIn) void syncPending();
      if (result.ok && !result.data.signedIn) await offline.expireSession();
      return result;
    });
    ipcMain.handle('auth:sign-in', async (event) => {
      requireRenderer(event);
      disposeLabs();
      const result = await browserAuth.start();
      if (result.ok) {
        try {
          await previewClient.resolveLocalLabUser();
          const session = previewClient.sessionSnapshot();
          if (session) await offline.setSession(session);
        } catch (error) {
          console.error(
            'Signed in, but could not enable offline access:',
            error,
          );
        }
      }
      if (result.ok) void refreshLabsFromServer();
      if (result.ok && mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      return result;
    });
    ipcMain.handle('auth:cancel-sign-in', (event) => {
      requireRenderer(event);
      cancelBrowserAuth();
    });
    ipcMain.handle('auth:sign-out', async (event) => {
      requireRenderer(event);
      if (offline.pending().length) {
        const synced = await syncPending();
        if (synced.pending)
          return {
            ok: false as const,
            code: 'PENDING_CHANGES',
            message:
              'Your offline notes or checklist changes have not synced. Connect to the internet before signing out.',
          };
      }
      disposeLabs();
      cancelBrowserAuth();
      await offline.clear();
      return previewClient.signOut();
    });
    const trustedAudioRequest = (event: Electron.IpcMainInvokeEvent) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame
      ) {
        throw new Error('Untrusted request');
      }
    };
    ipcMain.handle('audiobooks:download', async (event, slug: string) => {
      trustedAudioRequest(event);
      const library = await loadAudiobookLibrary(previewClient);
      const book = library.books.find((entry) => entry.slug === slug);
      if (!book) return { ok: false, message: 'This audiobook is not available right now.' };
      if (book.downloaded) return { ok: true };
      try {
        await downloadBook(book);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Download failed.' };
      }
    });
    ipcMain.handle('audiobooks:remove', async (event, slug: string) => {
      trustedAudioRequest(event);
      try {
        await removeBook(slug);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Could not remove the download.' };
      }
    });
    ipcMain.handle('audiobooks:library', async (event) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame
      ) {
        throw new Error('Untrusted request');
      }
      return loadAudiobookLibrary(previewClient);
    });
    ipcMain.handle('catalog:list', (event) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame
      ) {
        throw new Error('Untrusted request');
      }
      try {
        backendBase(apiBase);
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Invalid backend configuration.',
        };
      }
      return previewClient.listCourses().then((result) =>
        !result.ok &&
        result.code === 'CONNECTION_ERROR' &&
        offline.courses().length
          ? {
              ok: true as const,
              courses: offline.courses().map((course) => course.summary),
            }
          : result,
      );
    });
    ipcMain.handle('offline:status', (event, slug) => {
      requireRenderer(event);
      const course =
        typeof slug === 'string' ? offline.course(slug) : undefined;
      const chapters = course
        ? Object.values(course.lessons).filter(
            (lesson) => !lesson.locked && Boolean(lesson.content),
          ).length
        : 0;
      return {
        available: offline.available(),
        downloadedAt: course?.downloadedAt ?? null,
        chapters,
        pending: offline.pending().length,
      };
    });
    ipcMain.handle('offline:download', (event, slug) => {
      requireRenderer(event);
      return downloadCourse(slug);
    });
    ipcMain.handle('offline:remove', async (event, slug) => {
      requireRenderer(event);
      if (typeof slug === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(slug))
        await offline.removeCourse(slug);
    });
    ipcMain.handle('offline:sync', (event) => {
      requireRenderer(event);
      return syncPending();
    });
    app.on('browser-window-created', (_event, win) => guardQuizShortcuts(win.webContents));
    electronScreen.on('display-added', notifyQuizScreens);
    electronScreen.on('display-removed', notifyQuizScreens);
    ipcMain.handle('quiz:lockdown', (event, active) => {
      requireRenderer(event);
      applyQuizLockdown(active === true);
      return { screens: screenCount() };
    });
    // Retry queued changes in the background so they sync as soon as the connection returns.
    setInterval(() => {
      if (offline.pending().length && !syncTask) void syncPending();
    }, 20_000);
    createWindow();
    app.on('activate', () => {
      if (!mainWindow) createWindow();
    });
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
