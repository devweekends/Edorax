import { describe, expect, it } from "vitest";
import {
  addBlockedVersion,
  buildUpdateRequest,
  compareVersions,
  describeForcePlan,
  describeSave,
  formatUpdatedAt,
  isHttpsUrl,
  isValidVersion,
  joinPlatformLabels,
  planForceToLatest,
  removeBlockedVersion,
  type RulesFormValues,
} from "@/lib/desktop-updates";
import type { DesktopUpdatePolicy } from "@/shared/api/desktop-updates";

const empty: RulesFormValues = { minimumVersion: "", latestVersion: "", downloadUrl: "", message: "", blockedVersions: [] };

function policy(overrides: Partial<DesktopUpdatePolicy> & Pick<DesktopUpdatePolicy, "platform">): DesktopUpdatePolicy {
  return {
    minimumVersion: "0.1.0",
    latestVersion: "0.1.0",
    downloadUrl: "https://example.com/get",
    message: "",
    blockedVersions: [],
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
    ...overrides,
  };
}

describe("version checks", () => {
  it("accepts plain semver and rejects everything else", () => {
    for (const ok of ["0.2.0", "1.10.3", "0.0.0"]) expect(isValidVersion(ok)).toBe(true);
    for (const bad of ["", "1.2", "v1.2.3", "1.2.3-beta", "01.2.3", "1.2.3.4", " 1.2.3", "a.b.c"]) {
      expect(isValidVersion(bad)).toBe(false);
    }
  });

  it("compares numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.2.1", "0.3.0")).toBeLessThan(0);
  });

  it("only accepts https links", () => {
    expect(isHttpsUrl("https://example.com/a")).toBe(true);
    expect(isHttpsUrl("http://example.com")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("example.com")).toBe(false);
  });
});

describe("blocked version list", () => {
  it("adds a trimmed valid version", () => {
    expect(addBlockedVersion(["0.1.1"], " 0.1.2 ")).toEqual({ ok: true, list: ["0.1.1", "0.1.2"] });
  });

  it("refuses duplicates, bad versions and empty input without changing the list", () => {
    const list = ["0.1.1"];
    for (const input of ["0.1.1", "nope", "  "]) {
      const result = addBlockedVersion(list, input);
      expect(result.ok).toBe(false);
      expect(result.list).toEqual(["0.1.1"]);
    }
  });

  it("stops at 50 entries", () => {
    const full = Array.from({ length: 50 }, (_, index) => `0.1.${index}`);
    expect(addBlockedVersion(full, "9.9.9").ok).toBe(false);
  });

  it("removes one version and keeps the rest", () => {
    expect(removeBlockedVersion(["0.1.1", "0.1.2"], "0.1.1")).toEqual(["0.1.2"]);
    expect(removeBlockedVersion(["0.1.1"], "9.9.9")).toEqual(["0.1.1"]);
  });
});

describe("buildUpdateRequest", () => {
  it("sends only the filled fields, platforms in a fixed order", () => {
    const result = buildUpdateRequest({
      platforms: ["linux", "darwin"],
      values: { ...empty, minimumVersion: " 0.2.0 ", message: "  Please update.  " },
    });
    expect(result).toEqual({
      ok: true,
      request: { platforms: ["darwin", "linux"], fields: { minimumVersion: "0.2.0", message: "Please update." } },
    });
  });

  it("never sends an empty value unless a clear action is on", () => {
    expect(buildUpdateRequest({ platforms: ["darwin"], values: empty })).toEqual({
      ok: false,
      errors: ["Nothing to change. Fill in at least one field."],
    });
    const cleared = buildUpdateRequest({
      platforms: ["darwin", "win32"],
      values: empty,
      clear: { message: true, blockedVersions: true },
    });
    expect(cleared).toEqual({
      ok: true,
      request: { platforms: ["darwin", "win32"], fields: { message: "", blockedVersions: [] } },
    });
  });

  it("requires a platform", () => {
    const result = buildUpdateRequest({ platforms: [], values: { ...empty, minimumVersion: "0.2.0" } });
    expect(result).toEqual({ ok: false, errors: ["Choose at least one platform."] });
  });

  it("reports bad fields", () => {
    const result = buildUpdateRequest({
      platforms: ["darwin"],
      values: { ...empty, minimumVersion: "v2", latestVersion: "1.x", downloadUrl: "http://x.com", message: "a".repeat(281) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(4);
  });

  it("rejects latest below minimum when both are typed", () => {
    const result = buildUpdateRequest({
      platforms: ["darwin", "linux"],
      values: { ...empty, minimumVersion: "0.5.0", latestVersion: "0.4.0" },
    });
    expect(result).toEqual({ ok: false, errors: ["Latest version cannot be lower than the minimum version."] });
  });

  it("checks one typed version against the saved one for a single platform", () => {
    const current = policy({ platform: "darwin", minimumVersion: "0.3.0", latestVersion: "0.4.0" });
    const bad = buildUpdateRequest({
      platforms: ["darwin"],
      values: { ...prefillOf(current), latestVersion: "0.2.0" },
      current,
    });
    expect(bad.ok).toBe(false);
    const good = buildUpdateRequest({
      platforms: ["darwin"],
      values: { ...prefillOf(current), minimumVersion: "0.4.0" },
      current,
    });
    expect(good).toEqual({ ok: true, request: { platforms: ["darwin"], fields: { minimumVersion: "0.4.0" } } });
  });

  it("leaves out prefilled values that did not change (one platform)", () => {
    const current = policy({ platform: "win32", minimumVersion: "0.2.0", latestVersion: "0.3.0", message: "Hi", blockedVersions: ["0.1.5"] });
    expect(buildUpdateRequest({ platforms: ["win32"], values: prefillOf(current), current })).toEqual({
      ok: false,
      errors: ["Nothing to change. Fill in at least one field."],
    });
    const edited = buildUpdateRequest({
      platforms: ["win32"],
      values: { ...prefillOf(current), blockedVersions: [] },
      current,
    });
    expect(edited).toEqual({ ok: true, request: { platforms: ["win32"], fields: { blockedVersions: [] } } });
  });

  it("with several platforms, an empty blocked list means no change", () => {
    const result = buildUpdateRequest({
      platforms: ["darwin", "win32"],
      values: { ...empty, blockedVersions: ["0.1.5"] },
    });
    expect(result).toEqual({ ok: true, request: { platforms: ["darwin", "win32"], fields: { blockedVersions: ["0.1.5"] } } });
  });

  it("rejects typing a value and clearing the same field", () => {
    const result = buildUpdateRequest({
      platforms: ["darwin"],
      values: { ...empty, message: "Hello" },
      clear: { message: true },
    });
    expect(result.ok).toBe(false);
  });
});

function prefillOf(p: DesktopUpdatePolicy): RulesFormValues {
  return {
    minimumVersion: p.minimumVersion,
    latestVersion: p.latestVersion,
    downloadUrl: p.downloadUrl,
    message: p.message,
    blockedVersions: [...p.blockedVersions],
  };
}

describe("planForceToLatest", () => {
  const policies = [
    policy({ platform: "darwin", minimumVersion: "0.1.0", latestVersion: "0.3.0" }),
    policy({ platform: "win32", minimumVersion: "0.1.0", latestVersion: "0.3.1" }),
    policy({ platform: "linux", minimumVersion: "0.1.0", latestVersion: "0.3.0" }),
  ];

  it("makes one group per distinct latest version, newest first", () => {
    const plan = planForceToLatest(["linux", "win32", "darwin"], policies);
    expect(plan.groups).toEqual([
      { version: "0.3.1", platforms: ["win32"] },
      { version: "0.3.0", platforms: ["darwin", "linux"] },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(describeForcePlan(plan.groups)).toBe("Windows to 0.3.1; macOS and Linux to 0.3.0");
  });

  it("only plans the selected platforms", () => {
    expect(planForceToLatest(["win32"], policies).groups).toEqual([{ version: "0.3.1", platforms: ["win32"] }]);
    expect(planForceToLatest([], policies).groups).toEqual([]);
  });

  it("skips a platform that is already at its latest minimum or has no valid latest", () => {
    const plan = planForceToLatest(["darwin", "win32", "linux"], [
      policy({ platform: "darwin", minimumVersion: "0.3.0", latestVersion: "0.3.0" }),
      policy({ platform: "win32", latestVersion: "" }),
      policies[2],
    ]);
    expect(plan.groups).toEqual([{ version: "0.3.0", platforms: ["linux"] }]);
    expect(plan.skipped.map((item) => item.platform)).toEqual(["darwin", "win32"]);
  });
});

describe("text helpers", () => {
  it("joins platform names", () => {
    expect(joinPlatformLabels(["darwin"])).toBe("macOS");
    expect(joinPlatformLabels(["darwin", "win32"])).toBe("macOS and Windows");
    expect(joinPlatformLabels(["darwin", "win32", "linux"])).toBe("macOS, Windows and Linux");
  });

  it("describes a save", () => {
    expect(
      describeSave({
        platforms: ["darwin", "linux"],
        fields: { minimumVersion: "0.2.0", message: "", blockedVersions: ["0.1.4"] },
      })
    ).toBe("Saved for macOS and Linux: minimum version 0.2.0, message cleared, blocked versions (0.1.4).");
  });

  it("formats time in fixed UTC", () => {
    expect(formatUpdatedAt("2026-11-14T10:32:00.000Z")).toBe("14 Nov 2026, 10:32 UTC");
    expect(formatUpdatedAt("not a date")).toBe("not a date");
  });
});
