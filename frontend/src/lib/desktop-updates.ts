import type {
  DesktopPlatform,
  DesktopUpdateFields,
  DesktopUpdatePolicy,
  DesktopUpdateRequest,
} from "@/shared/api/desktop-updates";

// Pure helpers for the admin "Desktop updates" page. Used by the browser form and
// again by the Server Action, so both check the same rules.

export const DESKTOP_PLATFORMS: readonly DesktopPlatform[] = ["darwin", "win32", "linux"];

export const PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

export const MESSAGE_MAX_LENGTH = 280;
export const BLOCKED_VERSIONS_MAX = 50;

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Plain semver only, such as 0.2.0. No "v" prefix, no pre-release tag. */
export function isValidVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/** Returns a negative number, 0 or a positive number. Both values must be valid versions. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isDesktopPlatform(value: unknown): value is DesktopPlatform {
  return typeof value === "string" && (DESKTOP_PLATFORMS as readonly string[]).includes(value);
}

export function platformLabel(platform: DesktopPlatform): string {
  return PLATFORM_LABELS[platform];
}

/** "macOS", "macOS and Windows", "macOS, Windows and Linux". */
export function joinPlatformLabels(platforms: readonly DesktopPlatform[]): string {
  const labels = platforms.map(platformLabel);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export type AddBlockedResult = { ok: true; list: string[] } | { ok: false; error: string; list: string[] };

/** Adds one version to the blocked list: trims it, checks it, ignores exact duplicates. */
export function addBlockedVersion(list: readonly string[], input: string): AddBlockedResult {
  const version = input.trim();
  if (!version) return { ok: false, error: "Type a version first, for example 0.1.4.", list: [...list] };
  if (!isValidVersion(version)) {
    return { ok: false, error: `"${version}" is not a version. Use three numbers like 0.1.4.`, list: [...list] };
  }
  if (list.includes(version)) return { ok: false, error: `${version} is already in the list.`, list: [...list] };
  if (list.length >= BLOCKED_VERSIONS_MAX) {
    return { ok: false, error: `You can list up to ${BLOCKED_VERSIONS_MAX} versions.`, list: [...list] };
  }
  return { ok: true, list: [...list, version] };
}

export function removeBlockedVersion(list: readonly string[], version: string): string[] {
  return list.filter((item) => item !== version);
}

export type RulesFormValues = {
  minimumVersion: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
  blockedVersions: string[];
};

export type RulesFormClear = { message: boolean; blockedVersions: boolean };

export type BuildBodyResult =
  | { ok: true; request: DesktopUpdateRequest }
  | { ok: false; errors: string[] };

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Builds the PUT body from the form. Only fields the admin filled are sent, so an
 * empty field never wipes a value. The message and the blocked list are cleared
 * only when the matching "clear" action is on. With exactly one platform, a field
 * that still equals the current value is left out (the form was prefilled from it).
 */
export function buildUpdateRequest(input: {
  platforms: readonly DesktopPlatform[];
  values: RulesFormValues;
  clear?: Partial<RulesFormClear>;
  /** The saved policy of the platform, when exactly one platform is selected. */
  current?: DesktopUpdatePolicy | null;
}): BuildBodyResult {
  const { values } = input;
  const clear = { message: false, blockedVersions: false, ...input.clear };
  const current = input.platforms.length === 1 ? (input.current ?? null) : null;
  const errors: string[] = [];

  const platforms = DESKTOP_PLATFORMS.filter((platform) => input.platforms.includes(platform));
  if (platforms.length === 0) errors.push("Choose at least one platform.");

  const fields: DesktopUpdateFields = {};

  const minimumVersion = values.minimumVersion.trim();
  if (minimumVersion) {
    if (!isValidVersion(minimumVersion)) errors.push("Minimum version must look like 0.2.0.");
    else if (minimumVersion !== current?.minimumVersion) fields.minimumVersion = minimumVersion;
  }

  const latestVersion = values.latestVersion.trim();
  if (latestVersion) {
    if (!isValidVersion(latestVersion)) errors.push("Latest version must look like 0.2.0.");
    else if (latestVersion !== current?.latestVersion) fields.latestVersion = latestVersion;
  }

  const downloadUrl = values.downloadUrl.trim();
  if (downloadUrl) {
    if (!isHttpsUrl(downloadUrl)) errors.push("Download link must start with https://.");
    else if (downloadUrl !== current?.downloadUrl) fields.downloadUrl = downloadUrl;
  }

  const message = values.message.trim();
  if (clear.message) {
    if (message) errors.push("Either type a message or choose to clear it, not both.");
    else fields.message = "";
  } else if (message) {
    if (message.length > MESSAGE_MAX_LENGTH) errors.push(`Message can be at most ${MESSAGE_MAX_LENGTH} characters.`);
    else if (message !== current?.message) fields.message = message;
  }

  const blocked = values.blockedVersions;
  if (blocked.length > BLOCKED_VERSIONS_MAX) errors.push(`You can list up to ${BLOCKED_VERSIONS_MAX} blocked versions.`);
  else if (blocked.some((version) => !isValidVersion(version))) errors.push("Every blocked version must look like 0.1.4.");
  else if (new Set(blocked).size !== blocked.length) errors.push("The blocked versions list has a repeated version.");
  else if (clear.blockedVersions) {
    if (blocked.length > 0) errors.push("Either list blocked versions or choose to remove them all, not both.");
    else fields.blockedVersions = [];
  } else if (current) {
    // One platform: the list was prefilled, so any difference is a deliberate edit
    // (including removing the last item).
    if (!sameList(blocked, current.blockedVersions)) fields.blockedVersions = [...blocked];
  } else if (blocked.length > 0) {
    fields.blockedVersions = [...blocked];
  }

  // latest >= minimum, checked here when both values are known (typed, or saved for one platform).
  if (errors.length === 0 && (minimumVersion || latestVersion)) {
    const knownMin = minimumVersion || current?.minimumVersion;
    const knownLatest = latestVersion || current?.latestVersion;
    if (knownMin && knownLatest && isValidVersion(knownMin) && isValidVersion(knownLatest) && compareVersions(knownLatest, knownMin) < 0) {
      errors.push("Latest version cannot be lower than the minimum version.");
    }
  }

  if (errors.length === 0 && Object.keys(fields).length === 0) {
    errors.push("Nothing to change. Fill in at least one field.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, request: { platforms, fields } };
}

/** One plain sentence about what a save changed, for the success message. */
export function describeSave(request: DesktopUpdateRequest): string {
  const { fields } = request;
  const parts: string[] = [];
  if (fields.minimumVersion !== undefined) parts.push(`minimum version ${fields.minimumVersion}`);
  if (fields.latestVersion !== undefined) parts.push(`latest version ${fields.latestVersion}`);
  if (fields.downloadUrl !== undefined) parts.push("download link");
  if (fields.message !== undefined) parts.push(fields.message === "" ? "message cleared" : "message");
  if (fields.blockedVersions !== undefined) {
    parts.push(
      fields.blockedVersions.length === 0
        ? "blocked versions cleared"
        : `blocked versions (${fields.blockedVersions.join(", ")})`
    );
  }
  return `Saved for ${joinPlatformLabels(request.platforms)}: ${parts.join(", ")}.`;
}

export type ForceGroup = { version: string; platforms: DesktopPlatform[] };

export type ForcePlan = {
  groups: ForceGroup[];
  /** Selected platforms that cannot be forced, with the reason. */
  skipped: { platform: DesktopPlatform; reason: string }[];
};

/**
 * "Force everyone to the latest version": the PUT applies one value to every listed
 * platform, so platforms are grouped by their own latest version, one PUT per group.
 * A platform whose minimum already equals its latest version is skipped.
 */
export function planForceToLatest(
  platforms: readonly DesktopPlatform[],
  policies: readonly DesktopUpdatePolicy[]
): ForcePlan {
  const groups = new Map<string, DesktopPlatform[]>();
  const skipped: ForcePlan["skipped"] = [];
  for (const platform of DESKTOP_PLATFORMS) {
    if (!platforms.includes(platform)) continue;
    const policy = policies.find((item) => item.platform === platform);
    if (!policy || !isValidVersion(policy.latestVersion)) {
      skipped.push({ platform, reason: "It has no valid latest version." });
      continue;
    }
    if (policy.minimumVersion === policy.latestVersion) {
      skipped.push({ platform, reason: `Its minimum version is already ${policy.latestVersion}.` });
      continue;
    }
    groups.set(policy.latestVersion, [...(groups.get(policy.latestVersion) ?? []), platform]);
  }
  const ordered = [...groups.entries()]
    .map(([version, list]) => ({ version, platforms: list }))
    .sort((a, b) => compareVersions(b.version, a.version));
  return { groups: ordered, skipped };
}

/** "macOS and Linux to 0.3.0, Windows to 0.3.1" */
export function describeForcePlan(groups: readonly ForceGroup[]): string {
  return groups.map((group) => `${joinPlatformLabels(group.platforms)} to ${group.version}`).join("; ");
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** Fixed UTC text so the server and the browser render the same string. */
export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${dateFormat.format(date)} UTC`;
}
