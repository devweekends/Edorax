import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from './domain/catalog';

const api: DesktopAPI = {
  ide: {
    status: (course) => ipcRenderer.invoke('ide:status', course),
    resume: (course) => ipcRenderer.invoke('ide:resume', course),
    open: (create, course) => ipcRenderer.invoke('ide:open', create, course),
    importSnippet: (source, filename, course) =>
      ipcRenderer.invoke('ide:snippet', source, filename, course),
    bounds: (value, course) => ipcRenderer.invoke('ide:bounds', value, course),
    stop: () => ipcRenderer.invoke('ide:stop'),
    newTerminal: () => ipcRenderer.invoke('ide:terminal'),
    revealExplorer: () => ipcRenderer.invoke('ide:revealExplorer'),
    selectTheme: () => ipcRenderer.invoke('ide:select-theme'),
    openExtensions: () => ipcRenderer.invoke('ide:open-extensions'),
    openWithMenu: (position) =>
      ipcRenderer.invoke('ide:open-with-menu', position),
  },
  labs: {
    prepareTerminal: (course) =>
      ipcRenderer.invoke('labs:prepare-terminal', course),
    configure: (blockId, mode, createProject) =>
      ipcRenderer.invoke('labs:configure', blockId, mode, createProject),
    listFiles: (blockId) => ipcRenderer.invoke('labs:files', blockId),
    readProjectFile: (blockId, path) =>
      ipcRenderer.invoke('labs:file-read', blockId, path),
    saveProjectFile: (blockId, path, content) =>
      ipcRenderer.invoke('labs:file-save', blockId, path, content),
    createEntry: (blockId, path, kind) =>
      ipcRenderer.invoke('labs:file-create', blockId, path, kind),
    status: (blockId) => ipcRenderer.invoke('labs:status', blockId),
    start: (blockId) => ipcRenderer.invoke('labs:start', blockId),
    stop: (blockId) => ipcRenderer.invoke('labs:stop', blockId),
    reset: (blockId) => ipcRenderer.invoke('labs:reset', blockId),
    readFile: (blockId) => ipcRenderer.invoke('labs:read-file', blockId),
    saveFile: (blockId, content) =>
      ipcRenderer.invoke('labs:save-file', blockId, content),
    openTerminal: (blockId, id) =>
      ipcRenderer.invoke('labs:terminal-open', blockId, id),
    closeTerminal: (blockId, id) =>
      ipcRenderer.invoke('labs:terminal-close', blockId, id),
    terminalInput: (blockId, id, data) =>
      ipcRenderer.invoke('labs:terminal-input', blockId, id, data),
    resizeTerminal: (blockId, id, cols, rows) =>
      ipcRenderer.invoke('labs:terminal-resize', blockId, id, cols, rows),
    onTerminalData: (listener) => {
      const receive = (
        _event: Electron.IpcRendererEvent,
        data: { id: string; data: string },
      ) => listener(data);
      ipcRenderer.on('labs:terminal-data', receive);
      return () => {
        ipcRenderer.removeListener('labs:terminal-data', receive);
      };
    },
  },
  shellLabs: {
    dockerState: () => ipcRenderer.invoke('shell-labs:docker-state'),
    startDocker: () => ipcRenderer.invoke('shell-labs:docker-start'),
    setUpDocker: () => ipcRenderer.invoke('shell-labs:docker-setup'),
    onDockerProgress: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, data: Parameters<typeof listener>[0]) => listener(data);
      ipcRenderer.on('shell-labs:docker-progress', receive);
      return () => {
        ipcRenderer.removeListener('shell-labs:docker-progress', receive);
      };
    },
    list: () => ipcRenderer.invoke('shell-labs:list'),
    view: (slug) => ipcRenderer.invoke('shell-labs:view', slug),
    status: (slug) => ipcRenderer.invoke('shell-labs:status', slug),
    start: (slug) => ipcRenderer.invoke('shell-labs:start', slug),
    stop: (slug) => ipcRenderer.invoke('shell-labs:stop', slug),
    reset: (slug) => ipcRenderer.invoke('shell-labs:reset', slug),
    check: (slug, stepId) => ipcRenderer.invoke('shell-labs:check', slug, stepId),
    answer: (slug, stepId, option) => ipcRenderer.invoke('shell-labs:answer', slug, stepId, option),
    checkAll: (slug) => ipcRenderer.invoke('shell-labs:check-all', slug),
    openTerminal: (slug, id) => ipcRenderer.invoke('shell-labs:terminal-open', slug, id),
    closeTerminal: (slug, id) => ipcRenderer.invoke('shell-labs:terminal-close', slug, id),
    terminalInput: (slug, id, data) => ipcRenderer.invoke('shell-labs:terminal-input', slug, id, data),
    resizeTerminal: (slug, id, cols, rows) =>
      ipcRenderer.invoke('shell-labs:terminal-resize', slug, id, cols, rows),
    onStartProgress: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, data: Parameters<typeof listener>[0]) => listener(data);
      ipcRenderer.on('shell-labs:start-progress', receive);
      return () => {
        ipcRenderer.removeListener('shell-labs:start-progress', receive);
      };
    },
    onTerminalData: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, data: { id: string; data: string }) => listener(data);
      ipcRenderer.on('shell-labs:terminal-data', receive);
      return () => {
        ipcRenderer.removeListener('shell-labs:terminal-data', receive);
      };
    },
  },
  remote: {
    request: (path, method, body) =>
      ipcRenderer.invoke('remote:request', path, method, body),
  },
  openWeb: (path) => ipcRenderer.invoke('app:open-web', path),
  quizLockdown: (active) => ipcRenderer.invoke('quiz:lockdown', active),
  onQuizScreens: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: { screens: number }) => listener(state);
    ipcRenderer.on('quiz:screens', receive);
    return () => {
      ipcRenderer.removeListener('quiz:screens', receive);
    };
  },
  platform: process.platform,
  offline: {
    status: (slug) => ipcRenderer.invoke('offline:status', slug),
    download: (slug) => ipcRenderer.invoke('offline:download', slug),
    remove: (slug) => ipcRenderer.invoke('offline:remove', slug),
    sync: () => ipcRenderer.invoke('offline:sync'),
    onStatus: (listener) => {
      const receive = (_event: Electron.IpcRendererEvent, status: unknown) =>
        listener(status as Parameters<typeof listener>[0]);
      ipcRenderer.on('offline:sync-status', receive);
      return () => {
        ipcRenderer.removeListener('offline:sync-status', receive);
      };
    },
  },
  webOrigin: () => ipcRenderer.invoke('app:web-origin'),
  integrityRequest: (path, method, body) =>
    ipcRenderer.invoke('learning:integrity', path, method, body),
  learning: {
    updateTrack: (course, kind, slug) =>
      ipcRenderer.invoke('learning:update-track', course, kind, slug),
    quiz: (id) => ipcRenderer.invoke('learning:quiz', id),
    submitQuiz: (id, answers) =>
      ipcRenderer.invoke('learning:submit-quiz', id, answers),
    lesson: (course, chapter) =>
      ipcRenderer.invoke('learning:lesson', course, chapter),
    overview: (course) => ipcRenderer.invoke('learning:overview', course),
    upgradeCurriculum: (course) =>
      ipcRenderer.invoke('learning:upgrade-curriculum', course),
    block: (id) => ipcRenderer.invoke('learning:block', id),
    aiInterview: (id, action, payload) =>
      ipcRenderer.invoke('learning:ai-interview', id, action, payload),
    answer: (id, payload) => ipcRenderer.invoke('learning:answer', id, payload),
    complete: (id) => ipcRenderer.invoke('learning:complete', id),
    saveLog: (id, answers) =>
      ipcRenderer.invoke('learning:save-log', id, answers),
    checklist: (id, item, checked) =>
      ipcRenderer.invoke('learning:checklist', id, item, checked),
  },
  startLearning: (slug) => ipcRenderer.invoke('course:start-learning', slug),
  enroll: (courseId) => ipcRenderer.invoke('enrollment:create', courseId),
  listCourses: () => ipcRenderer.invoke('catalog:list'),
  audiobooks: {
    library: () => ipcRenderer.invoke('audiobooks:library'),
    download: (slug) => ipcRenderer.invoke('audiobooks:download', slug),
    remove: (slug) => ipcRenderer.invoke('audiobooks:remove', slug),
  },
  courseDetail: (slug) => ipcRenderer.invoke('catalog:detail', slug),
  learnerProfile: () => ipcRenderer.invoke('learner:profile'),
  home: () => ipcRenderer.invoke('learner:home'),
  progress: () => ipcRenderer.invoke('learner:progress'),
  leaderboard: {
    context: () => ipcRenderer.invoke('leaderboard:context'),
    hub: (selection: unknown) => ipcRenderer.invoke('leaderboard:hub', selection),
    setOptIn: (optIn: boolean) => ipcRenderer.invoke('leaderboard:opt-in', optIn),
  },
  signIn: () => ipcRenderer.invoke('auth:sign-in'),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  cancelSignIn: () => ipcRenderer.invoke('auth:cancel-sign-in'),
  signOut: () => ipcRenderer.invoke('auth:sign-out'),
};
contextBridge.exposeInMainWorld('buildment', api);
