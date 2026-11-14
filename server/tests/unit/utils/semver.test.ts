import { describe, expect, it } from "vitest";
import { compareSemver, isValidSemver, parseSemver } from "../../../src/utils/semver.js";

describe("parseSemver", () => {
  it("parses releases, prereleases and build metadata", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1n, minor: 2n, patch: 3n, prerelease: [] });
    expect(parseSemver("0.2.0-beta.1")?.prerelease).toEqual(["beta", "1"]);
    expect(parseSemver("1.0.0+build.5")?.prerelease).toEqual([]);
    expect(parseSemver("1.0.0-rc.1+build.5")?.prerelease).toEqual(["rc", "1"]);
    expect(parseSemver(" 1.2.3 ")?.major).toBe(1n);
  });

  it.each(["", "1", "1.2", "1.2.3.4", "v1.2.3", "01.2.3", "1.02.3", "1.2.3-", "1.2.3-01", "1.2.3-a..b", "a.b.c", "1.2.3 beta", "1.2.3, 1.2.4", "-1.2.3"])(
    "rejects %j",
    (value) => {
      expect(isValidSemver(value)).toBe(false);
    }
  );

  it("rejects values that are not strings", () => {
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(123)).toBeNull();
  });
});

describe("compareSemver", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["0.0.0", "0.0.0", 0],
    ["1.0.0", "2.0.0", -1],
    ["2.0.0", "1.9.9", 1],
    ["0.1.0", "0.2.0", -1],
    ["0.1.1", "0.1.0", 1],
    // numeric, never text
    ["0.9.0", "0.10.0", -1],
    ["0.10.0", "0.9.0", 1],
    ["1.2.9", "1.2.10", -1],
    ["10.0.0", "9.0.0", 1],
    ["1.0.0", "1.0.0+build", 0],
    ["1.0.0+a", "1.0.0+b", 0],
    // prerelease
    ["0.2.0-beta.1", "0.2.0", -1],
    ["0.2.0", "0.2.0-beta.1", 1],
    ["0.2.0-beta.1", "0.2.0-beta.2", -1],
    ["0.2.0-beta.2", "0.2.0-beta.10", -1],
    ["0.2.0-beta.10", "0.2.0-beta.9", 1],
    ["0.2.0-alpha", "0.2.0-beta", -1],
    ["0.2.0-alpha", "0.2.0-alpha.1", -1],
    ["0.2.0-alpha.1", "0.2.0-alpha.beta", -1],
    ["0.2.0-rc.1", "0.2.0-beta.9", 1],
    ["0.2.0-beta.1", "0.1.9", 1],
    ["0.2.0-beta.1", "0.2.0-beta.1", 0],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
    ["1.0.0-alpha.beta", "1.0.0-beta", -1],
    ["1.0.0-beta", "1.0.0-beta.2", -1],
    ["1.0.0-beta.2", "1.0.0-beta.11", -1],
    ["1.0.0-beta.11", "1.0.0-rc.1", -1],
    ["1.0.0-rc.1", "1.0.0", -1],
    // very large numbers stay exact
    ["1.0.99999999999999999999", "1.0.100000000000000000000", -1],
  ] as const)("compare(%s, %s) = %i", (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
    expect(compareSemver(b, a)).toBe(-expected || 0);
  });

  it("throws on invalid input", () => {
    expect(() => compareSemver("nope", "1.0.0")).toThrow(/Invalid semver/);
    expect(() => compareSemver("1.0.0", "1.0")).toThrow(/Invalid semver/);
  });
});
