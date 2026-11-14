import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DesktopUpdatePolicy } from "@/shared/api/desktop-updates";

const serverApiFetch = vi.fn();
vi.mock("@/lib/api-server", () => ({ serverApiFetch }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: AdminDesktopUpdatesPage } = await import("@/app/(admin)/admin/desktop-updates/page");

const policies: DesktopUpdatePolicy[] = [
  {
    platform: "darwin",
    minimumVersion: "0.2.0",
    latestVersion: "0.3.0",
    downloadUrl: "https://example.com/mac",
    message: "",
    blockedVersions: ["0.1.4", "0.1.5"],
    updatedAt: "2026-11-14T10:32:00.000Z",
    updatedBy: { id: "u1", name: "Ada Admin", email: "ada@example.com" },
    isDefault: false,
  },
  {
    platform: "win32",
    minimumVersion: "0.1.0",
    latestVersion: "0.1.0",
    downloadUrl: "https://example.com/win",
    message: "",
    blockedVersions: [],
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
  },
  {
    platform: "linux",
    minimumVersion: "0.1.0",
    latestVersion: "0.1.0",
    downloadUrl: "https://example.com/linux",
    message: "",
    blockedVersions: [],
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
  },
];

describe("admin desktop updates page", () => {
  it("shows the three platforms, who changed them and the defaults note", async () => {
    serverApiFetch.mockResolvedValue({ policies });
    const html = renderToStaticMarkup(createElement("div", null, await AdminDesktopUpdatesPage()));

    expect(serverApiFetch).toHaveBeenCalledWith("/api/v1/admin/desktop-updates");
    for (const label of ["macOS", "Windows", "Linux"]) expect(html).toContain(label);
    expect(html).toContain("0.1.4, 0.1.5");
    expect(html).toContain("Changed by Ada Admin on");
    expect(html).toContain("14 Nov 2026, 10:32 UTC");
    expect(html).toContain("Not set: using defaults");
    expect(html).toContain("Change the update rules");
    expect(html).toContain("Select all");
    expect(html).toContain("Force everyone to the latest version");
    expect(html).toContain("Choose at least one platform.");
  });

  it("labels every input and starts with nothing selected and the buttons off", async () => {
    serverApiFetch.mockResolvedValue({ policies });
    const html = renderToStaticMarkup(createElement("div", null, await AdminDesktopUpdatesPage()));
    for (const text of [
      "Minimum version",
      "Latest version",
      "Download link",
      "Message shown to users (optional)",
      "Force these exact versions to update",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("checked");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save changes<\/button>/);
  });
});
