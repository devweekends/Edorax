// Version rules for the forced-update check. Pure: no Electron, no network, no clock.

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated parts after the "-", numbers kept as numbers. Empty for a release. */
  prerelease: (number | string)[];
};
export type UpdateStatus = 'required' | 'available' | 'ok';
export type UpdatePolicyVersions = { minimumVersion: string; latestVersion: string };

const CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Reads "1.2.3", "v1.2.3" or "1.2.3-beta.1" (build info after "+" is ignored). Returns null when it is not a version. */
export function parseVersion(value: unknown): ParsedVersion | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^v/, '');
  if (text.length > 64) return null;
  const match = CORE.exec(text);
  if (!match) return null;
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  const prerelease: (number | string)[] = [];
  for (const part of match[4] ? match[4].split('.') : []) {
    if (/^\d+$/.test(part)) {
      // A numeric part with a leading zero is not valid semver.
      if (part.length > 1 && part.startsWith('0')) return null;
      const number = Number(part);
      if (!Number.isSafeInteger(number)) return null;
      prerelease.push(number);
    } else prerelease.push(part);
  }
  return { major, minor, patch, prerelease };
}

function comparePart(a: number | string, b: number | string): -1 | 0 | 1 {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  // A number is lower than text.
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** -1 when a is older than b, 1 when newer, 0 when equal, null when either is not a valid version. A prerelease is older than its release. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0;
  if (!left.prerelease.length) return 1;
  if (!right.prerelease.length) return -1;
  const shared = Math.min(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < shared; i += 1) {
    const result = comparePart(left.prerelease[i], right.prerelease[i]);
    if (result) return result;
  }
  if (left.prerelease.length === right.prerelease.length) return 0;
  return left.prerelease.length < right.prerelease.length ? -1 : 1;
}

/**
 * required: this app is older than the minimum. available: older than the latest. ok: anything else.
 * Bad data never locks anyone out: an invalid app version or an invalid policy version gives "ok" for that rule.
 */
export function updateStatus(current: unknown, policy: UpdatePolicyVersions | null | undefined): UpdateStatus {
  if (!policy) return 'ok';
  if (compareVersions(current, policy.minimumVersion) === -1) return 'required';
  if (compareVersions(current, policy.latestVersion) === -1) return 'available';
  return 'ok';
}
