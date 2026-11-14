// Every request the app makes to the Edorax backend carries the app version, so the server can
// ask old apps to update. All backend calls build their headers here, so none is missed.
export const DESKTOP_VERSION_HEADER = 'X-Edorax-Desktop-Version';
export const UPDATE_REQUIRED_STATUS = 426;
export const UPDATE_REQUIRED_CODE = 'DESKTOP_UPDATE_REQUIRED';

let desktopVersion = '';

/** Called once by the main process with app.getVersion(). */
export function setDesktopVersion(version: string) {
  desktopVersion = version;
}

export function withDesktopVersion<T extends Record<string, string>>(headers: T): T {
  if (desktopVersion) (headers as Record<string, string>)[DESKTOP_VERSION_HEADER] = desktopVersion;
  return headers;
}

export type UpdateRequiredInfo = { minimumVersion: string; downloadUrl: string; message: string };

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
  };
}
