import { validVersionList } from '../domain/app-version';

// Every request the app makes to the Edorax backend carries the app version and the platform, so the
// server can ask old apps to update (the rules are per platform). All backend calls build their
// headers here, so none is missed.
export const DESKTOP_VERSION_HEADER = 'X-Edorax-Desktop-Version';
export const DESKTOP_PLATFORM_HEADER = 'X-Edorax-Desktop-Platform';
export const UPDATE_REQUIRED_STATUS = 426;
export const UPDATE_REQUIRED_CODE = 'DESKTOP_UPDATE_REQUIRED';

export type DesktopPlatform = 'darwin' | 'win32' | 'linux';
const PLATFORMS: readonly string[] = ['darwin', 'win32', 'linux'];

let desktopVersion = '';
let desktopPlatform: DesktopPlatform | '' = '';

/** Returns the platform when it is one the server knows, otherwise "" (no platform is sent). */
export function supportedPlatform(value: unknown): DesktopPlatform | '' {
  return typeof value === 'string' && PLATFORMS.includes(value) ? (value as DesktopPlatform) : '';
}

/** Called once by the main process with app.getVersion(). */
export function setDesktopVersion(version: string) {
  desktopVersion = version;
}

/** Called once by the main process with process.platform. Any value other than darwin, win32 or linux means "no platform". */
export function setDesktopPlatform(platform: string) {
  desktopPlatform = supportedPlatform(platform);
}

export function getDesktopPlatform(): DesktopPlatform | '' {
  return desktopPlatform;
}

/** Adds the version and platform headers. The platform header is left out for an unsupported platform. */
export function withDesktopHeaders<T extends Record<string, string>>(headers: T): T {
  const target = headers as Record<string, string>;
  if (desktopVersion) target[DESKTOP_VERSION_HEADER] = desktopVersion;
  if (desktopPlatform) target[DESKTOP_PLATFORM_HEADER] = desktopPlatform;
  return headers;
}

export type UpdateRequiredInfo = { minimumVersion: string; downloadUrl: string; message: string; blockedVersions: string[] };

/** Reads a backend answer. Returns the details when it is the "update required" answer, otherwise null. */
export function updateRequiredFrom(status: number, payload: unknown): UpdateRequiredInfo | null {
  if (status !== UPDATE_REQUIRED_STATUS || !payload || typeof payload !== 'object') return null;
  const body = payload as { code?: unknown; message?: unknown; data?: unknown };
  if (body.code !== UPDATE_REQUIRED_CODE) return null;
  const data = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : {};
  return {
    minimumVersion: typeof data.minimumVersion === 'string' ? data.minimumVersion : '',
    downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : '',
    message: typeof body.message === 'string' ? body.message.slice(0, 500) : '',
    blockedVersions: validVersionList(data.blockedVersions),
  };
}
