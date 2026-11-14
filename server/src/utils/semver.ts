// Small semantic-version helper (https://semver.org). No dependency: the desktop update gate
// only needs to parse "1.2.3" / "1.2.3-beta.1" and say which of two versions is higher.

export type SemVer = {
  major: bigint;
  minor: bigint;
  patch: bigint;
  /** Dot-separated prerelease identifiers; empty for a release. */
  prerelease: string[];
};

const NUMERIC = "0|[1-9]\\d*";
const PRERELEASE_ID = `(?:${NUMERIC}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const SEMVER_RE = new RegExp(
  `^(${NUMERIC})\\.(${NUMERIC})\\.(${NUMERIC})` +
    `(?:-(${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*))?` +
    `(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`
);

/** Parses a plain semver string (no leading "v"). Build metadata is accepted and ignored. Returns null when invalid. */
export function parseSemver(input: unknown): SemVer | null {
  if (typeof input !== "string") return null;
  const match = SEMVER_RE.exec(input.trim());
  if (!match) return null;
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

export function isValidSemver(input: unknown): boolean {
  return parseSemver(input) !== null;
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const isNumericId = (id: string) => /^\d+$/.test(id);

function comparePrerelease(a: string[], b: string[]): number {
  // A release is higher than any of its prereleases.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];
    if (left === right) continue;
    const leftNumeric = isNumericId(left);
    const rightNumeric = isNumericId(right);
    if (leftNumeric && rightNumeric) return compareBigInt(BigInt(left), BigInt(right));
    // Numeric identifiers are lower than alphanumeric ones.
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return left < right ? -1 : 1;
  }
  // All shared identifiers are equal: the longer list is higher.
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

/** Compares two parsed versions numerically: -1 when a is lower, 0 when equal, 1 when a is higher. */
export function compareParsed(a: SemVer, b: SemVer): -1 | 0 | 1 {
  const result =
    compareBigInt(a.major, b.major) ||
    compareBigInt(a.minor, b.minor) ||
    compareBigInt(a.patch, b.patch) ||
    comparePrerelease(a.prerelease, b.prerelease);
  return result < 0 ? -1 : result > 0 ? 1 : 0;
}

/** Compares two semver strings. Throws when either one is not valid semver. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left) throw new Error(`Invalid semver: ${a}`);
  if (!right) throw new Error(`Invalid semver: ${b}`);
  return compareParsed(left, right);
}
