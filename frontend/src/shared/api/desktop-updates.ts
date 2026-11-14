// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Types for the admin desktop-update policy API (/api/v1/admin/desktop-updates).

export type DesktopPlatform = "darwin" | "win32" | "linux";

export type DesktopUpdatePolicy = {
  platform: DesktopPlatform;
  minimumVersion: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
  blockedVersions: string[];
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null; email: string } | null;
  isDefault: boolean;
};

export type DesktopUpdatesView = { policies: DesktopUpdatePolicy[] };

/** Fields the PUT endpoint accepts. Only the fields present are changed. */
export type DesktopUpdateFields = {
  minimumVersion?: string;
  latestVersion?: string;
  downloadUrl?: string;
  message?: string;
  blockedVersions?: string[];
};

export type DesktopUpdateRequest = {
  platforms: DesktopPlatform[];
  fields: DesktopUpdateFields;
};
