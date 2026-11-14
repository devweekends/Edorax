import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { clearDesktopPolicyCache } from "../../src/services/desktop-update-policy.js";

// Per-platform forced-update policy stored in the database and managed by admins.
const app = createApp();
const VERSION = "X-Edorax-Desktop-Version";
const PLATFORM = "X-Edorax-Desktop-Platform";
const ENDPOINT = "/api/v1/admin/desktop-updates";
// /api/v1/auth/me needs sign-in; 401 proves the request got past the gate.
const probe = "/api/v1/auth/me";
const DEFAULT_URL = "https://github.com/devweekends/Edorax/releases/latest";

const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let adminId = "";
let menteeId = "";
let adminToken = "";
let menteeToken = "";
let savedRows: Awaited<ReturnType<typeof prisma.desktopUpdatePolicy.findMany>> = [];
const original = {
  min: env.DESKTOP_MIN_VERSION,
  latest: env.DESKTOP_LATEST_VERSION,
  url: env.DESKTOP_DOWNLOAD_URL,
  message: env.DESKTOP_UPDATE_MESSAGE,
};

const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const save = (body: unknown) => request(app).put(ENDPOINT).set(admin()).send(body as object);
const gate = (version: string, platform?: string) => {
  const req = request(app).get(probe).set(VERSION, version);
  return platform ? req.set(PLATFORM, platform) : req;
};

beforeAll(async () => {
  const adminUser = await prisma.user.create({ data: { email: `desk-admin-${tag}@test.local`, name: "Desk Admin", role: "ADMIN", emailVerified: new Date() } });
  const mentee = await prisma.user.create({ data: { email: `desk-mentee-${tag}@test.local`, name: "Desk Mentee", emailVerified: new Date() } });
  adminId = adminUser.id;
  menteeId = mentee.id;
  adminToken = (await createSession(adminId)).sessionToken;
  menteeToken = (await createSession(menteeId)).sessionToken;
  savedRows = await prisma.desktopUpdatePolicy.findMany();
});

beforeEach(async () => {
  env.DESKTOP_MIN_VERSION = "0.0.0";
  env.DESKTOP_LATEST_VERSION = "0.0.0";
  env.DESKTOP_DOWNLOAD_URL = DEFAULT_URL;
  env.DESKTOP_UPDATE_MESSAGE = undefined;
  await prisma.desktopUpdatePolicy.deleteMany();
  await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId } });
  clearDesktopPolicyCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Put back whatever rows existed before this file ran.
  await prisma.desktopUpdatePolicy.deleteMany();
  if (savedRows.length) await prisma.desktopUpdatePolicy.createMany({ data: savedRows });
  clearDesktopPolicyCache();
  env.DESKTOP_MIN_VERSION = original.min;
  env.DESKTOP_LATEST_VERSION = original.latest;
  env.DESKTOP_DOWNLOAD_URL = original.url;
  env.DESKTOP_UPDATE_MESSAGE = original.message;
  await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.session.deleteMany({ where: { userId: { in: [adminId, menteeId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, menteeId] } } });
});

describe("admin access", () => {
  it("needs a signed-in administrator", async () => {
    expect((await request(app).get(ENDPOINT)).status).toBe(401);
    expect((await request(app).put(ENDPOINT).send({ platforms: ["linux"], fields: { message: "x" } })).status).toBe(401);
    const get = await request(app).get(ENDPOINT).set({ Authorization: `Bearer ${menteeToken}` });
    expect(get.status).toBe(403);
    const put = await request(app).put(ENDPOINT).set({ Authorization: `Bearer ${menteeToken}` }).send({ platforms: ["linux"], fields: { message: "x" } });
    expect(put.status).toBe(403);
    expect(await prisma.desktopUpdatePolicy.count()).toBe(0);
  });
});

describe("GET /api/v1/admin/desktop-updates", () => {
  it("always returns three entries in order, as defaults when nothing is saved", async () => {
    env.DESKTOP_MIN_VERSION = "0.2.0";
    env.DESKTOP_LATEST_VERSION = "0.3.0";
    const res = await request(app).get(ENDPOINT).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.data.policies.map((p: { platform: string }) => p.platform)).toEqual(["darwin", "win32", "linux"]);
    for (const policy of res.body.data.policies) {
      expect(policy).toEqual({
        platform: policy.platform,
        minimumVersion: "0.2.0",
        latestVersion: "0.3.0",
        downloadUrl: DEFAULT_URL,
        message: "",
        blockedVersions: [],
        updatedAt: null,
        updatedBy: null,
        isDefault: true,
      });
    }
  });

  it("shows saved platforms with who saved them and the rest as defaults", async () => {
    await save({ platforms: ["win32"], fields: { minimumVersion: "1.0.0", latestVersion: "1.2.0" } });
    const res = await request(app).get(ENDPOINT).set(admin());
    const [darwin, win32, linux] = res.body.data.policies;
    expect(res.body.data.policies).toHaveLength(3);
    expect(darwin.isDefault).toBe(true);
    expect(linux.isDefault).toBe(true);
    expect(win32).toMatchObject({
      platform: "win32",
      minimumVersion: "1.0.0",
      latestVersion: "1.2.0",
      isDefault: false,
      updatedBy: { id: adminId, name: "Desk Admin", email: `desk-admin-${tag}@test.local` },
    });
    expect(typeof win32.updatedAt).toBe("string");
  });
});

describe("PUT /api/v1/admin/desktop-updates", () => {
  it("saves several platforms in one request and creates rows from the defaults", async () => {
    env.DESKTOP_DOWNLOAD_URL = "https://example.com/default";
    const res = await save({
      platforms: ["darwin", "linux"],
      fields: { minimumVersion: "0.4.0", latestVersion: "0.5.0", message: "Please update.", blockedVersions: ["0.4.2"] },
    });
    expect(res.status).toBe(200);
    const [darwin, win32, linux] = res.body.data.policies;
    for (const policy of [darwin, linux]) {
      expect(policy).toMatchObject({
        minimumVersion: "0.4.0",
        latestVersion: "0.5.0",
        message: "Please update.",
        blockedVersions: ["0.4.2"],
        downloadUrl: "https://example.com/default",
        isDefault: false,
      });
    }
    expect(win32.isDefault).toBe(true);
    expect(await prisma.desktopUpdatePolicy.count()).toBe(2);
  });

  it("keeps the fields that were not sent", async () => {
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.4.0", latestVersion: "0.5.0", message: "Hi" } });
    const res = await save({ platforms: ["linux"], fields: { latestVersion: "0.6.0" } });
    expect(res.body.data.policies[2]).toMatchObject({ minimumVersion: "0.4.0", latestVersion: "0.6.0", message: "Hi" });
  });

  it("records one audit entry per save with from and to for each platform", async () => {
    await save({ platforms: ["darwin", "win32"], fields: { minimumVersion: "0.3.0", latestVersion: "0.3.0" } });
    const entries = await prisma.adminAuditLog.findMany({ where: { actorId: adminId, action: "desktop-update-policy.changed" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorEmail: `desk-admin-${tag}@test.local`, targetType: "DesktopUpdatePolicy", targetId: "darwin,win32" });
    const metadata = entries[0].metadata as { changes: Record<string, { from: { minimumVersion: string; isDefault: boolean }; to: { minimumVersion: string } }> };
    expect(Object.keys(metadata.changes).sort()).toEqual(["darwin", "win32"]);
    expect(metadata.changes.darwin.from).toMatchObject({ minimumVersion: "0.0.0", isDefault: true });
    expect(metadata.changes.darwin.to.minimumVersion).toBe("0.3.0");
  });

  it("writes no audit entry and no row when validation fails", async () => {
    const res = await save({ platforms: ["linux"], fields: { minimumVersion: "nope" } });
    expect(res.status).toBe(400);
    expect(await prisma.desktopUpdatePolicy.count()).toBe(0);
    expect(await prisma.adminAuditLog.count({ where: { actorId: adminId } })).toBe(0);
  });

  it("rejects bad input with a message that names the field", async () => {
    const cases: Array<[unknown, string]> = [
      [{ platforms: [], fields: { message: "x" } }, "platforms"],
      [{ platforms: ["darwin", "darwin"], fields: { message: "x" } }, "platforms"],
      [{ platforms: ["freebsd"], fields: { message: "x" } }, "platform"],
      [{ platforms: ["darwin", "win32", "linux", "linux"], fields: { message: "x" } }, "platforms"],
      [{ fields: { message: "x" } }, "platforms"],
      [{ platforms: ["linux"], fields: {} }, "fields"],
      [{ platforms: ["linux"], fields: { foo: "bar" } }, "fields"],
      [{ platforms: ["linux"] }, "fields"],
      [{ platforms: ["linux"], fields: { minimumVersion: "1.2" } }, "minimumVersion"],
      [{ platforms: ["linux"], fields: { minimumVersion: "v1.2.3" } }, "minimumVersion"],
      [{ platforms: ["linux"], fields: { latestVersion: "abc" } }, "latestVersion"],
      [{ platforms: ["linux"], fields: { downloadUrl: "http://example.com/dl" } }, "downloadUrl"],
      [{ platforms: ["linux"], fields: { downloadUrl: "https://user:pass@example.com/dl" } }, "downloadUrl"],
      [{ platforms: ["linux"], fields: { downloadUrl: "not a url" } }, "downloadUrl"],
      [{ platforms: ["linux"], fields: { downloadUrl: `https://example.com/${"a".repeat(500)}` } }, "downloadUrl"],
      [{ platforms: ["linux"], fields: { message: "m".repeat(281) } }, "message"],
      [{ platforms: ["linux"], fields: { blockedVersions: ["0.1.0", "0.1.0"] } }, "blockedVersions"],
      [{ platforms: ["linux"], fields: { blockedVersions: ["bad"] } }, "blockedVersions"],
      [{ platforms: ["linux"], fields: { blockedVersions: Array.from({ length: 51 }, (_, i) => `0.0.${i + 1}`) } }, "blockedVersions"],
    ];
    for (const [body, field] of cases) {
      const res = await save(body);
      expect(res.status, JSON.stringify(body).slice(0, 120)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(res.body.message, JSON.stringify(body).slice(0, 120)).toContain(field);
    }
    expect(await prisma.desktopUpdatePolicy.count()).toBe(0);
  });

  it("accepts the limits: 280 character message, 50 blocked versions, build and prerelease versions", async () => {
    const res = await save({
      platforms: ["linux"],
      fields: {
        message: "m".repeat(280),
        blockedVersions: Array.from({ length: 50 }, (_, i) => `0.0.${i + 1}`),
        minimumVersion: "0.2.0-beta.1",
        latestVersion: "0.2.0+build5",
        downloadUrl: "https://example.com/download",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.policies[2].blockedVersions).toHaveLength(50);
  });

  it("rejects a latest version below the minimum, also against a saved or default value", async () => {
    const both = await save({ platforms: ["linux"], fields: { minimumVersion: "0.5.0", latestVersion: "0.4.0" } });
    expect(both.status).toBe(400);
    expect(both.body.message).toContain("latestVersion");
    expect(both.body.message).toContain("minimumVersion");

    env.DESKTOP_LATEST_VERSION = "0.1.0";
    const againstDefault = await save({ platforms: ["win32"], fields: { minimumVersion: "0.2.0" } });
    expect(againstDefault.status).toBe(400);

    await save({ platforms: ["darwin"], fields: { minimumVersion: "0.3.0", latestVersion: "0.9.0" } });
    const againstSaved = await save({ platforms: ["darwin"], fields: { latestVersion: "0.2.0" } });
    expect(againstSaved.status).toBe(400);
  });

  it("is all or nothing: one platform failing the rule saves none", async () => {
    await save({ platforms: ["darwin"], fields: { minimumVersion: "0.1.0", latestVersion: "0.1.0" } });
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.1.0", latestVersion: "5.0.0" } });
    // darwin latest is 0.1.0, so min 2.0.0 fails there even though linux (latest 5.0.0) would pass.
    const res = await save({ platforms: ["linux", "darwin"], fields: { minimumVersion: "2.0.0" } });
    expect(res.status).toBe(400);
    const list = await request(app).get(ENDPOINT).set(admin());
    expect(list.body.data.policies[2].minimumVersion).toBe("0.1.0");
  });
});

describe("platform enforcement", () => {
  it("forces darwin while linux is not forced", async () => {
    await save({ platforms: ["darwin"], fields: { minimumVersion: "0.5.0", latestVersion: "0.5.0", downloadUrl: "https://example.com/mac" } });
    const mac = await gate("0.4.0", "darwin");
    expect(mac.status).toBe(426);
    expect(mac.body).toEqual({
      success: false,
      code: "DESKTOP_UPDATE_REQUIRED",
      message: "This version of Edorax is out of date. Download the new version to continue.",
      data: { minimumVersion: "0.5.0", latestVersion: "0.5.0", downloadUrl: "https://example.com/mac", blockedVersions: [] },
    });
    expect((await gate("0.4.0", "linux")).status).toBe(401);
    expect((await gate("0.4.0", "win32")).status).toBe(401);
    expect((await gate("0.5.0", "darwin")).status).toBe(401);
    expect((await gate("0.5.1", "darwin")).status).toBe(401);
  });

  it("uses the saved message in the 426 answer", async () => {
    await save({ platforms: ["win32"], fields: { minimumVersion: "1.0.0", latestVersion: "1.0.0", message: "Security fix." } });
    const res = await gate("0.9.0", "win32");
    expect(res.status).toBe(426);
    expect(res.body.message).toBe("Security fix.");
  });

  it("refuses an exact blocked version only", async () => {
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.0.0", latestVersion: "0.2.0", blockedVersions: ["0.1.0"] } });
    const blocked = await gate("0.1.0", "linux");
    expect(blocked.status).toBe(426);
    expect(blocked.body.data.blockedVersions).toEqual(["0.1.0"]);
    expect((await gate("0.2.0", "linux")).status).toBe(401);
    expect((await gate("0.1.1", "linux")).status).toBe(401);
    expect((await gate("0.0.9", "linux")).status).toBe(401);
    // Compared as parsed semver: build metadata does not matter, a prerelease is a different version.
    expect((await gate("0.1.0+build5", "linux")).status).toBe(426);
    expect((await gate("0.1.0-beta.1", "linux")).status).toBe(401);
    // Other platforms are not affected.
    expect((await gate("0.1.0", "darwin")).status).toBe(401);
  });

  it("matches a blocked version written with build metadata", async () => {
    await save({ platforms: ["linux"], fields: { latestVersion: "0.2.0", blockedVersions: ["0.1.0+build5"] } });
    expect((await gate("0.1.0", "linux")).status).toBe(426);
    expect((await gate("0.1.0+other", "linux")).status).toBe(426);
  });

  it("applies the minimum rule and the blocked list together", async () => {
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.3.0", latestVersion: "0.5.0", blockedVersions: ["0.4.0"] } });
    expect((await gate("0.2.9", "linux")).status).toBe(426);
    expect((await gate("0.3.0", "linux")).status).toBe(401);
    expect((await gate("0.4.0", "linux")).status).toBe(426);
    expect((await gate("0.5.0", "linux")).status).toBe(401);
  });

  it("uses the default policy when the platform header is missing or unknown", async () => {
    await save({ platforms: ["darwin", "win32", "linux"], fields: { minimumVersion: "9.0.0", latestVersion: "9.0.0" } });
    env.DESKTOP_MIN_VERSION = "0.3.0";
    env.DESKTOP_LATEST_VERSION = "0.3.0";
    for (const platform of [undefined, "", "freebsd", "darwin2"]) {
      const old = await gate("0.2.0", platform);
      expect(old.status, String(platform)).toBe(426);
      expect(old.body.data).toMatchObject({ minimumVersion: "0.3.0", blockedVersions: [] });
      expect((await gate("0.3.0", platform)).status, String(platform)).toBe(401);
    }
  });

  it("still exempts the version route, /health, a missing header and an invalid header", async () => {
    await save({ platforms: ["linux"], fields: { minimumVersion: "9.0.0", latestVersion: "9.0.0", blockedVersions: ["0.0.1"] } });
    const version = await request(app).get("/api/v1/desktop/version?platform=linux").set(VERSION, "0.0.1").set(PLATFORM, "linux");
    expect(version.status).toBe(200);
    expect((await request(app).get("/health").set(VERSION, "0.0.1").set(PLATFORM, "linux")).status).toBe(200);
    expect((await request(app).get(probe).set(PLATFORM, "linux")).status).toBe(401);
    expect((await request(app).get(probe).set(VERSION, "abc").set(PLATFORM, "linux")).status).toBe(401);
  });

  it("takes effect at once on the saving instance (the cache is cleared on save)", async () => {
    expect((await gate("0.1.0", "linux")).status).toBe(401);
    // The policy is now cached. Saving must not leave the old answer in place.
    const saved = await save({ platforms: ["linux"], fields: { minimumVersion: "0.2.0", latestVersion: "0.2.0" } });
    expect(saved.status).toBe(200);
    expect((await gate("0.1.0", "linux")).status).toBe(426);
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.0.0" } });
    expect((await gate("0.1.0", "linux")).status).toBe(401);
  });

  it("reads a change made elsewhere after the 30 second cache time", async () => {
    expect((await gate("0.1.0", "linux")).status).toBe(401);
    await prisma.desktopUpdatePolicy.create({
      data: { platform: "LINUX", minimumVersion: "0.2.0", latestVersion: "0.2.0", downloadUrl: "https://example.com/dl", updatedById: adminId },
    });
    // Still cached.
    expect((await gate("0.1.0", "linux")).status).toBe(401);
    const real = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(real + 31_000);
    expect((await gate("0.1.0", "linux")).status).toBe(426);
  });
});

describe("database failure", () => {
  it("does not block requests and uses the default policy when nothing is cached", async () => {
    env.DESKTOP_MIN_VERSION = "0.3.0";
    env.DESKTOP_LATEST_VERSION = "0.3.0";
    vi.spyOn(prisma.desktopUpdatePolicy, "findMany").mockRejectedValue(new Error("database is down"));
    expect((await gate("0.3.0", "linux")).status).toBe(401);
    // The default policy still applies.
    expect((await gate("0.2.0", "linux")).status).toBe(426);
    const version = await request(app).get("/api/v1/desktop/version?platform=linux");
    expect(version.status).toBe(200);
    expect(version.body.data.minimumVersion).toBe("0.3.0");
  });

  it("keeps the last cached policy when a refresh fails", async () => {
    await save({ platforms: ["linux"], fields: { minimumVersion: "0.5.0", latestVersion: "0.5.0" } });
    expect((await gate("0.4.0", "linux")).status).toBe(426);
    vi.spyOn(prisma.desktopUpdatePolicy, "findMany").mockRejectedValue(new Error("database is down"));
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
    expect((await gate("0.4.0", "linux")).status).toBe(426);
    expect((await gate("0.5.0", "linux")).status).toBe(401);
  });
});

describe("GET /api/v1/desktop/version with a platform", () => {
  it("answers per platform, with blockedVersions, publicly and cached for a minute", async () => {
    await save({ platforms: ["win32"], fields: { minimumVersion: "1.0.0", latestVersion: "1.4.0", message: "Update.", blockedVersions: ["1.1.0"] } });
    const win = await request(app).get("/api/v1/desktop/version?platform=win32");
    expect(win.status).toBe(200);
    expect(win.body).toEqual({
      success: true,
      data: { minimumVersion: "1.0.0", latestVersion: "1.4.0", downloadUrl: DEFAULT_URL, message: "Update.", blockedVersions: ["1.1.0"] },
    });
    expect(win.headers["cache-control"]).toContain("max-age=60");
    const linux = await request(app).get("/api/v1/desktop/version?platform=linux");
    expect(linux.body.data).toEqual({ minimumVersion: "0.0.0", latestVersion: "0.0.0", downloadUrl: DEFAULT_URL, message: "", blockedVersions: [] });
  });

  it("returns the default policy for a missing or unknown platform", async () => {
    await save({ platforms: ["win32"], fields: { minimumVersion: "1.0.0", latestVersion: "1.0.0" } });
    for (const query of ["", "?platform=", "?platform=amiga", "?platform=win32&platform=linux"]) {
      const res = await request(app).get(`/api/v1/desktop/version${query}`);
      expect(res.status, query).toBe(200);
      expect(res.body.data.minimumVersion, query).toBe("0.0.0");
      expect(res.body.data.blockedVersions).toEqual([]);
    }
  });
});
