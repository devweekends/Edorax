import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopUpdatePolicy } from "@/shared/api/desktop-updates";

const serverApiFetch = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/api-server", () => ({ serverApiFetch }));

const { saveDesktopUpdateRules, forceDesktopUpdateToLatest } = await import("@/server/actions/admin/desktop-updates");
const { ApiError } = await import("@/lib/api-client");

function view(latest: Record<string, string>, minimum = "0.1.0") {
  const policies: DesktopUpdatePolicy[] = (["darwin", "win32", "linux"] as const).map((platform) => ({
    platform,
    minimumVersion: minimum,
    latestVersion: latest[platform],
    downloadUrl: "https://example.com/get",
    message: "",
    blockedVersions: [],
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
  }));
  return { policies };
}

beforeEach(() => {
  serverApiFetch.mockReset();
  revalidatePath.mockReset();
});

describe("saveDesktopUpdateRules", () => {
  it("PUTs the platforms and fields and revalidates the page", async () => {
    serverApiFetch.mockResolvedValue(view({ darwin: "0.3.0", win32: "0.3.0", linux: "0.3.0" }));
    const result = await saveDesktopUpdateRules({
      platforms: ["darwin", "win32"],
      fields: { minimumVersion: "0.2.0", blockedVersions: ["0.1.4"] },
    });
    expect(result).toEqual({
      ok: true,
      message: "Saved for macOS and Windows: minimum version 0.2.0, blocked versions (0.1.4).",
    });
    expect(serverApiFetch).toHaveBeenCalledWith("/api/v1/admin/desktop-updates", {
      method: "PUT",
      json: { platforms: ["darwin", "win32"], fields: { minimumVersion: "0.2.0", blockedVersions: ["0.1.4"] } },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/desktop-updates");
  });

  it("does not call the API for invalid input", async () => {
    const result = await saveDesktopUpdateRules({ platforms: ["darwin"], fields: { minimumVersion: "banana" } });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Minimum version");
    const none = await saveDesktopUpdateRules({ platforms: [], fields: { minimumVersion: "0.2.0" } });
    expect(none).toEqual({ ok: false, message: "Choose at least one platform." });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("returns the server's message when the API rejects the change", async () => {
    serverApiFetch.mockRejectedValue(new ApiError("downloadUrl must be https", 400, "VALIDATION_ERROR"));
    const result = await saveDesktopUpdateRules({ platforms: ["linux"], fields: { latestVersion: "0.5.0" } });
    expect(result).toEqual({ ok: false, message: "downloadUrl must be https" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("forceDesktopUpdateToLatest", () => {
  it("sends one PUT per distinct latest version", async () => {
    serverApiFetch.mockImplementation(async (_path: string, init?: { method?: string }) =>
      init?.method === "PUT" ? view({}) : view({ darwin: "0.3.0", win32: "0.3.1", linux: "0.3.0" })
    );
    const result = await forceDesktopUpdateToLatest({
      confirmed: { darwin: "0.3.0", win32: "0.3.1", linux: "0.3.0" },
    });
    const puts = serverApiFetch.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts.map(([, init]) => init.json)).toEqual([
      { platforms: ["win32"], fields: { minimumVersion: "0.3.1" } },
      { platforms: ["darwin", "linux"], fields: { minimumVersion: "0.3.0" } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Windows to 0.3.1; macOS and Linux to 0.3.0");
  });

  it("sends nothing when a latest version changed after the admin confirmed", async () => {
    serverApiFetch.mockResolvedValue(view({ darwin: "0.4.0", win32: "0.3.1", linux: "0.3.0" }));
    const result = await forceDesktopUpdateToLatest({ confirmed: { darwin: "0.3.0" } });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("macOS changed to 0.4.0");
    expect(serverApiFetch).toHaveBeenCalledTimes(1);
  });

  it("names what was saved when a later group fails", async () => {
    serverApiFetch.mockImplementation(async (_path: string, init?: { method?: string; json?: { platforms: string[] } }) => {
      if (init?.method !== "PUT") return view({ darwin: "0.3.0", win32: "0.3.1", linux: "0.3.0" });
      if (init.json?.platforms.includes("darwin")) throw new ApiError("minimumVersion is invalid", 400, "VALIDATION_ERROR");
      return view({});
    });
    const result = await forceDesktopUpdateToLatest({
      confirmed: { darwin: "0.3.0", win32: "0.3.1", linux: "0.3.0" },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Could not update macOS and Linux: minimumVersion is invalid");
    expect(result.message).toContain("Already saved: Windows to 0.3.1");
  });

  it("refuses an empty selection", async () => {
    expect(await forceDesktopUpdateToLatest({ confirmed: {} })).toEqual({ ok: false, message: "Choose at least one platform." });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});
