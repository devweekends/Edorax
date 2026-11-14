import type { UpdateStatus } from './app-version';

/** What the server says about app versions. Strings may be empty when nothing is known. */
export interface UpdatePolicy {
  minimumVersion: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
}

/** What the window shows. Versions and downloadUrl are "" when the app has no policy yet. */
export interface AppUpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  minimumVersion: string;
  downloadUrl: string;
  message: string;
}

export interface AppUpdateAPI {
  /** The status the app holds now. Does not use the network. */
  status(): Promise<AppUpdateState>;
  /** Asks the server again now and returns the new status. Never rejects. */
  check(): Promise<AppUpdateState>;
  /** Opens the download page from the server policy in the browser. Only https addresses are opened. */
  openDownload(): Promise<{ ok: boolean }>;
  onChange(listener: (state: AppUpdateState) => void): () => void;
}

export function isAppUpdateState(value: unknown): value is AppUpdateState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'required' || v.status === 'available' || v.status === 'ok') &&
    ['currentVersion', 'latestVersion', 'minimumVersion', 'downloadUrl', 'message'].every((key) => typeof v[key] === 'string')
  );
}
