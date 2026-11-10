import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  session,
  WebContentsView,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { execFile } from 'node:child_process';
import { access, mkdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { dialog } from 'electron';
import { TheiaRuntime } from './runtime';
import { CourseFolders, validateCourse } from './course-folders';

const execFileAsync = promisify(execFile);
const OPEN_WITH_APPS: Record<string, { name: string; label: string }> = {
  finder: { name: 'Finder', label: 'Finder' },
  'visual-studio-code': { name: 'Visual Studio Code', label: 'VS Code' },
  terminal: { name: 'Terminal', label: 'Terminal' },
  'android-studio': { name: 'Android Studio', label: 'Android Studio' },
  xcode: { name: 'Xcode', label: 'Xcode' },
  warp: { name: 'Warp', label: 'Warp' },
  iterm: { name: 'iTerm', label: 'iTerm' },
  'github-desktop': { name: 'GitHub Desktop', label: 'GitHub Desktop' },
};

function appDirectories() {
  return [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/System/Applications',
    '/System/Applications/Utilities',
    '/System/Library/CoreServices',
  ];
}

async function findAppBundle(appName: string): Promise<string | null> {
  for (const directory of appDirectories()) {
    const candidate = path.join(directory, `${appName}.app`);
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try the next directory */
    }
  }
  return null;
}

const appIconCache = new Map<string, Electron.NativeImage | null>();

async function appIcon(appPath: string): Promise<Electron.NativeImage | null> {
  if (appIconCache.has(appPath)) return appIconCache.get(appPath) ?? null;
  let icon: Electron.NativeImage | null = null;
  try {
    const image = await nativeImage.createThumbnailFromPath(appPath, {
      width: 16,
      height: 16,
    });
    if (!image.isEmpty()) icon = image;
  } catch {
    /* the menu entry simply appears without an icon */
  }
  appIconCache.set(appPath, icon);
  return icon;
}

async function openFolderWith(appId: string, folder: string) {
  if (appId === 'finder') {
    await execFileAsync('open', [folder]);
    return;
  }
  const app = OPEN_WITH_APPS[appId];
  if (!app) throw new Error('Unknown app.');
  await execFileAsync('open', ['-a', app.name, folder]);
}

export function installIDE(
  getWindow: () => BrowserWindow | null,
  requireRenderer: (event: IpcMainInvokeEvent) => void,
  folders: CourseFolders,
) {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'ide')
    : path.join(app.getAppPath(), 'ide');
  const runtime = new TheiaRuntime(
    directory,
    path.join(app.getPath('userData'), 'theia'),
  );
  let view: WebContentsView | undefined;
  let viewVisible = false;
  let attachedWindow: BrowserWindow | undefined;
  const ideSession = session.fromPartition('edorax-local-ide');
  ideSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  ideSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const current = runtime.status();
    const headers = { ...details.requestHeaders };
    if (
      current &&
      new URL(details.url).origin === new URL(current.url).origin
    ) {
      headers['X-Edorax-IDE-Token'] = runtime.authentication();
    }
    callback({ requestHeaders: headers });
  });
  const closeView = () => {
    if (!view) return;
    if (attachedWindow && !attachedWindow.isDestroyed())
      attachedWindow.contentView.removeChildView(view);
    view.webContents.close();
    view = undefined;
    viewVisible = false;
    attachedWindow = undefined;
  };
  const stop = async () => {
    closeView();
    await runtime.stop();
  };
  const hide = () => {
    if (!view || !viewVisible) return;
    view.setVisible(false);
    viewVisible = false;
  };
  let activeCourse: string | null = null;
  let switching: Promise<unknown> = Promise.resolve();
  function sequential<T>(action: () => Promise<T>): Promise<T> {
    const task = switching.then(action);
    switching = task.catch(() => {});
    return task;
  }
  ipcMain.handle('ide:status', (event, course) => {
    requireRenderer(event);
    validateCourse(course);
    return activeCourse === course ? runtime.status() : null;
  });
  ipcMain.handle('ide:resume', (event, course) => {
    requireRenderer(event);
    validateCourse(course);
    return sequential(async () => {
      if (activeCourse === course && runtime.status() && view)
        return runtime.status();
      hide();
      await stop();
      activeCourse = null;
      const folder = await folders.get(course);
      return folder ? launch(course, folder) : null;
    });
  });
  ipcMain.handle('ide:open', (event, createProject, course) => {
    requireRenderer(event);
    validateCourse(course);
    return sequential(async () => {
      const window = getWindow();
      if (!window) throw new Error('The Edorax window is closed.');
      let folder: string;
      if (createProject === true) {
        const choice = await dialog.showSaveDialog(window, {
          title: 'Create local project',
          buttonLabel: 'Create project',
          defaultPath: path.join(app.getPath('documents'), 'edorax-project'),
        });
        if (choice.canceled || !choice.filePath) return null;
        await mkdir(choice.filePath);
        folder = await realpath(choice.filePath);
      } else {
        const choice = await dialog.showOpenDialog(window, {
          title: 'Open local project',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (choice.canceled || !choice.filePaths[0]) return null;
        folder = await realpath(choice.filePaths[0]);
      }
      await folders.set(course, folder);
      return launch(course, folder);
    });
  });
  async function launch(course: string, folder: string) {
    const window = getWindow();
    if (!window) throw new Error('The Edorax window is closed.');
    activeCourse = null;
    closeView();
    const current = await runtime.start(
      folder,
      new URL(window.webContents.getURL()).origin,
    );
    if (window.isDestroyed()) {
      await runtime.stop();
      throw new Error('The Edorax window is closed.');
    }
    view = new WebContentsView({
      webPreferences: {
        session: ideSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    view.setBackgroundColor(
      nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    );
    attachedWindow = window;
    view.setVisible(false);
    window.contentView.addChildView(view);
    view.webContents.on('will-navigate', (navigation, url) => {
      if (new URL(url).origin !== new URL(current.url).origin)
        navigation.preventDefault();
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    view.webContents.on('render-process-gone', () => {
      void stop();
    });
    await view.webContents.loadURL(
      `${current.url}#${encodeURI(current.folder)}`,
    );
    activeCourse = course;
    return current;
  }
  ipcMain.handle('ide:bounds', (event, bounds, course) => {
    requireRenderer(event);
    if (!view || activeCourse !== course) return;
    if (!bounds) {
      if (viewVisible) {
        view.setVisible(false);
        viewVisible = false;
      }
      return;
    }
    const { x, y, width, height } = bounds;
    if (
      ![x, y, width, height].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    )
      throw new Error('Invalid workspace bounds.');
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    const [maxWidth, maxHeight] = window.getContentSize();
    const left = Math.max(0, Math.min(maxWidth, Math.floor(x)));
    const top = Math.max(0, Math.min(maxHeight, Math.floor(y)));
    const w = Math.max(0, Math.min(maxWidth - left, Math.floor(width)));
    const h = Math.max(0, Math.min(maxHeight - top, Math.floor(height)));
    const current = view.getBounds();
    if (
      current.x !== left ||
      current.y !== top ||
      current.width !== w ||
      current.height !== h
    ) {
      view.setBounds({ x: left, y: top, width: w, height: h });
    }
    const shouldBeVisible = w > 0 && h > 0;
    if (viewVisible !== shouldBeVisible) {
      view.setVisible(shouldBeVisible);
      viewVisible = shouldBeVisible;
    }
  });
  ipcMain.handle('ide:terminal', async (event) => {
    requireRenderer(event);
    if (!view) throw new Error('Open a local project first.');
    await view.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edorax:new-terminal'))`,
    );
  });
  ipcMain.handle('ide:select-theme', async (event) => {
    requireRenderer(event);
    if (!view) throw new Error('Open a local project first.');
    await view.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edorax:select-theme'))`,
    );
  });
  ipcMain.handle('ide:open-extensions', async (event) => {
    requireRenderer(event);
    if (!view) throw new Error('Open a local project first.');
    await view.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edorax:open-extensions'))`,
    );
  });
  ipcMain.handle('ide:open-with-menu', async (event, position) => {
    requireRenderer(event);
    const current = runtime.status();
    if (!current) throw new Error('Open a local project first.');
    const window = getWindow();
    if (!window || window.isDestroyed())
      throw new Error('The Edorax window is closed.');
    const x =
      typeof position?.x === 'number' && Number.isFinite(position.x)
        ? Math.floor(position.x)
        : undefined;
    const y =
      typeof position?.y === 'number' && Number.isFinite(position.y)
        ? Math.floor(position.y)
        : undefined;
    const items: Electron.MenuItemConstructorOptions[] = [];
    for (const [id, app] of Object.entries(OPEN_WITH_APPS)) {
      const appPath = await findAppBundle(app.name);
      if (!appPath) continue;
      const icon = await appIcon(appPath);
      items.push({
        label: app.label,
        ...(icon ? { icon } : {}),
        click: () => {
          void openFolderWith(id, current.folder);
        },
      });
    }
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Copy path',
      icon: nativeImage.createMenuSymbol('doc.on.doc'),
      click: () => clipboard.writeText(current.folder),
    });
    const menu = Menu.buildFromTemplate(items);
    menu.popup({ window, x, y });
  });

  const waitForTheiaReady = (contents: Electron.WebContents) =>
    new Promise<void>((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        void contents
          .executeJavaScript(
            `document.documentElement.dataset.edoraxReady === 'true'`,
          )
          .then((ready) => {
            if (ready) {
              clearInterval(timer);
              resolve();
            } else if (++attempts >= 100) {
              clearInterval(timer);
              reject(new Error('IDE is still loading.'));
            }
          })
          .catch(() => {
            if (++attempts >= 100) {
              clearInterval(timer);
              reject(new Error('IDE is still loading.'));
            }
          });
      }, 100);
    });

  // Reveal the file explorer (Navigator) when requested
  ipcMain.handle('ide:revealExplorer', async (event) => {
    requireRenderer(event);
    if (!view) throw new Error('IDE not open');
    await waitForTheiaReady(view.webContents);
    await view.webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent('edorax:reveal-explorer'))`,
    );
  });
  ipcMain.handle('ide:snippet', async (event, source, filename, course) => {
    requireRenderer(event);
    if (!view || activeCourse !== course)
      throw new Error('Open this course’s project first.');
    const result = await runtime.importSnippet(source, filename);
    // Only a main-created file URI crosses into the IDE; course source is never evaluated.
    await view.webContents.executeJavaScript(
      `new Promise((resolve, reject) => { let attempts = 0; const timer = setInterval(() => { if (document.documentElement.dataset.edoraxReady === 'true') { clearInterval(timer); window.dispatchEvent(new CustomEvent('edorax:open-file', {detail: ${JSON.stringify(result.uri)}})); resolve(true); } else if (++attempts > 100) { clearInterval(timer); reject(new Error('IDE is still loading. The snippet was saved in your project.')); } }, 100); })`,
    );
    return result;
  });
  ipcMain.handle('ide:stop', async (event) => {
    requireRenderer(event);
    await stop();
  });
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting || !runtime.status()) return;
    event.preventDefault();
    quitting = true;
    void stop().finally(() => app.quit());
  });
  return { stop, hide };
}
