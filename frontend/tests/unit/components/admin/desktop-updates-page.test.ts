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
  it("shows one simple card per platform with who changed it and the defaults note", async () => {
    serverApiFetch.mockResolvedValue({ policies });
    const html = renderToStaticMarkup(createElement("div", null, await AdminDesktopUpdatesPage()));

    expect(serverApiFetch).toHaveBeenCalledWith("/api/v1/admin/desktop-updates");
    for (const label of ["macOS", "Windows", "Linux"]) expect(html).toContain(label);
    expect(html).toContain("Changed by Ada Admin on");
    expect(html).toContain("14 Nov 2026, 10:32 UTC");
    expect(html).toContain("Not set yet: using the server defaults.");
    expect(html).toContain("Make everyone update");
    expect(html).toContain("Force all platforms to the latest");
    // The saved values are in the fields.
    expect(html).toContain('value="0.3.0"');
    expect(html).toContain('value="0.2.0"');
    expect(html).toContain('value="0.1.4, 0.1.5"');
  });

  it("labels every input and keeps the extra options in a closed section", async () => {
    serverApiFetch.mockResolvedValue({ policies });
    const html = renderToStaticMarkup(createElement("div", null, await AdminDesktopUpdatesPage()));
    for (const text of ["Latest version", "Must update below", "Download link", "Message for users (optional)", "Block exact versions (optional)"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("More options");
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("turns the force buttons off when a platform already requires its latest version", async () => {
    serverApiFetch.mockResolvedValue({ policies: policies.map((policy) => ({ ...policy, minimumVersion: policy.latestVersion })) });
    const html = renderToStaticMarkup(createElement("div", null, await AdminDesktopUpdatesPage()));
    expect(html).toContain("Every platform already requires its latest version.");
    expect(html.match(/<button[^>]*disabled=""[^>]*>Force/g)?.length).toBe(4);
  });
});
