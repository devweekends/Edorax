import fs from 'node:fs';
import path from 'node:path';
import { backendBase } from '../api/catalog';
import { getDesktopPlatform, supportedPlatform, updateRequiredFrom, withDesktopHeaders, type UpdateRequiredInfo } from '../api/client-info';
import type { AppUpdateState, UpdatePolicy } from '../domain/app-update';
import { isBlockedByList, updateStatus, validVersionList } from '../domain/app-version';

export const POLICY_PATH = '/api/v1/desktop/version';
export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
export const FOCUS_CHECK_GAP_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10_000;

/** The download address is opened in the browser, so only a plain https address is accepted. Returns "" otherwise. */
export function safeDownloadUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** Reads the server answer. Returns null unless it has the expected shape. */
export function parsePolicy(body: unknown): UpdatePolicy | null {
  if (!body || typeof body !== 'object') return null;
  const envelope = body as { success?: unknown; data?: unknown };
  if (envelope.success !== true || !envelope.data || typeof envelope.data !== 'object') return null;
  const data = envelope.data as Record<string, unknown>;
  if (typeof data.minimumVersion !== 'string' || typeof data.latestVersion !== 'string') return null;
  return {
    minimumVersion: text(data.minimumVersion, 64),
    latestVersion: text(data.latestVersion, 64),
    downloadUrl: safeDownloadUrl(data.downloadUrl),
    message: text(data.message, 500),
    // Missing (older server) or not a list: no blocked versions. Invalid entries are dropped one by one.
    blockedVersions: validVersionList(data.blockedVersions),
  };
}

type Saved = { policy: UpdatePolicy | null; forced: boolean };

/** A saved policy from another platform is ignored. A file saved before platforms existed has no platform and still loads. */
function readSaved(file: string, platform: string): Saved {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { policy?: unknown; forced?: unknown; platform?: unknown };
    if (saved.platform !== undefined && saved.platform !== platform) return { policy: null, forced: false };
    const policy = saved.policy && typeof saved.policy === 'object' ? parsePolicy({ success: true, data: saved.policy }) : null;
    return { policy, forced: saved.forced === true };
  } catch {
    return { policy: null, forced: false };
  }
}

export interface UpdateServiceOptions {
  currentVersion: string;
  /** The backend origin, for example https://api.example.com. */
  base: string;
  /** darwin, win32 or linux. Defaults to the platform set for all requests; any other value means "no platform". */
  platform?: string;
  request?: typeof fetch;
  /** Where the last good policy is kept (inside the user data folder). */
  file: string;
  openExternal(url: string): Promise<unknown> | unknown;
  onChange?(state: AppUpdateState): void;
  now?(): number;
}

/**
 * Keeps the app's update status. The server policy is fetched at start, every 4 hours and when the
 * window gets focus (at most once per 10 minutes). The last good policy is kept on disk: a failed
 * request changes nothing, so an app already known to be too old stays blocked while offline, and an
 * app with no policy is never blocked.
 */
export function createUpdateService(options: UpdateServiceOptions) {
  const request = options.request ?? fetch;
  const now = options.now ?? Date.now;
  const platform = supportedPlatform(options.platform ?? getDesktopPlatform());
  const saved = readSaved(options.file, platform);
  let policy = saved.policy;
  let forced = saved.forced;
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<AppUpdateState> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastKey = '';
  let writes = 0;

  function state(): AppUpdateState {
    const status = forced ? 'required' : updateStatus(options.currentVersion, policy);
    return {
      status,
      currentVersion: options.currentVersion,
      latestVersion: policy?.latestVersion ?? '',
      minimumVersion: policy?.minimumVersion ?? '',
      downloadUrl: policy?.downloadUrl ?? '',
      message: policy?.message ?? '',
      blocked: isBlockedByList(options.currentVersion, policy),
    };
  }
  function announce() {
    const current = state();
    const key = JSON.stringify(current);
    if (key === lastKey) return;
    lastKey = key;
    options.onChange?.(current);
  }
  lastKey = JSON.stringify(state());

  /** Written to a temporary file and renamed, so a crash never leaves half a file. */
  let queue: Promise<void> = Promise.resolve();
  function persist(): Promise<void> {
    queue = queue.then(write);
    return queue;
  }
  async function write() {
    const temporary = `${options.file}.${process.pid}.${++writes}.tmp`;
    try {
      await fs.promises.mkdir(path.dirname(options.file), { recursive: true });
      await fs.promises.writeFile(temporary, JSON.stringify({ policy, forced, platform }));
      await fs.promises.rename(temporary, options.file);
    } catch {
      // The policy still holds in memory; only the offline memory is lost.
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  function applyRequired(info: UpdateRequiredInfo) {
    forced = true;
    const downloadUrl = safeDownloadUrl(info.downloadUrl) || policy?.downloadUrl || '';
    const minimumVersion = info.minimumVersion || policy?.minimumVersion || '';
    policy = {
      minimumVersion,
      latestVersion: policy?.latestVersion || minimumVersion,
      downloadUrl,
      message: info.message || policy?.message || '',
      blockedVersions: info.blockedVersions.length ? info.blockedVersions : (policy?.blockedVersions ?? []),
    };
  }

  async function run(): Promise<AppUpdateState> {
    lastAttempt = now();
    try {
      const query = platform ? `?platform=${platform}` : '';
      const response = await request(backendBase(options.base) + POLICY_PATH + query, {
        headers: withDesktopHeaders({ Accept: 'application/json' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
      const body: unknown = await response.json();
      const info = updateRequiredFrom(response.status, body);
      if (info) applyRequired(info);
      else {
        const next = response.ok ? parsePolicy(body) : null;
        // Anything else (server error, odd answer, no network) leaves what we know as it is.
        if (next) {
          policy = next;
          forced = false;
        }
      }
      await persist();
    } catch {
      // Offline or too slow: keep the last good policy.
    }
    announce();
    return state();
  }

  const service = {
    state,
    /** Asks the server. A check that is already running is shared. */
    check(): Promise<AppUpdateState> {
      inFlight ??= run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    /** The window got focus. Checks only when the last attempt is 10 minutes old or older. */
    onFocus() {
      if (now() - lastAttempt >= FOCUS_CHECK_GAP_MS) void service.check();
    },
    /** Any backend request came back "update required". Blocks at once, then reads the full policy. */
    noteUpdateRequired(info: UpdateRequiredInfo) {
      applyRequired(info);
      announce();
      void persist();
      if (!inFlight) void service.check();
    },
    start() {
      void service.check();
      timer ??= setInterval(() => void service.check(), CHECK_EVERY_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    /** Opens only the download address from the server policy, and only when it is https. */
    async openDownload(): Promise<{ ok: boolean }> {
      const url = safeDownloadUrl(policy?.downloadUrl);
      if (!url) return { ok: false };
      try {
        await options.openExternal(url);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
  };
  return service;
}
export type UpdateService = ReturnType<typeof createUpdateService>;
