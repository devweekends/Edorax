import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";

// The default policy (DESKTOP_* environment variables): used when a request carries no platform, or an
// unknown one, so these tests need no database. `env` is read on every request, so the tests change
// its fields and put them back. Per-platform policies are in desktop-updates-admin.test.ts.
const app = createApp();
const HEADER = "X-Edorax-Desktop-Version";
const DEFAULT_URL = "https://github.com/devweekends/Edorax/releases/latest";
const DEFAULT_MESSAGE = "This version of Edorax is out of date. Download the new version to continue.";

const original = {
  min: env.DESKTOP_MIN_VERSION,
  latest: env.DESKTOP_LATEST_VERSION,
  url: env.DESKTOP_DOWNLOAD_URL,
  message: env.DESKTOP_UPDATE_MESSAGE,
};

function configure(values: { min?: string; latest?: string; url?: string; message?: string | undefined }) {
  env.DESKTOP_MIN_VERSION = values.min ?? "0.0.0";
  env.DESKTOP_LATEST_VERSION = values.latest ?? env.DESKTOP_MIN_VERSION;
  env.DESKTOP_DOWNLOAD_URL = values.url ?? DEFAULT_URL;
  env.DESKTOP_UPDATE_MESSAGE = values.message;
}

beforeEach(() => configure({}));
afterEach(() => {
  env.DESKTOP_MIN_VERSION = original.min;
  env.DESKTOP_LATEST_VERSION = original.latest;
  env.DESKTOP_DOWNLOAD_URL = original.url;
  env.DESKTOP_UPDATE_MESSAGE = original.message;
});

describe("GET /api/v1/desktop/version", () => {
  it("answers with defaults, without sign-in, and caches for a minute", async () => {
    const res = await request(app).get("/api/v1/desktop/version");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { minimumVersion: "0.0.0", latestVersion: "0.0.0", downloadUrl: DEFAULT_URL, message: "", blockedVersions: [] },
    });
    expect(res.headers["cache-control"]).toContain("max-age=60");
  });

  it("returns the configured values", async () => {
    configure({ min: "0.3.0", latest: "0.4.1", url: "https://example.com/dl", message: "Please update." });
    const res = await request(app).get("/api/v1/desktop/version");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      minimumVersion: "0.3.0",
      latestVersion: "0.4.1",
      downloadUrl: "https://example.com/dl",
      message: "Please update.",
      blockedVersions: [],
    });
  });

  it("returns the default policy for an unknown platform", async () => {
    configure({ min: "0.3.0" });
    const res = await request(app).get("/api/v1/desktop/version?platform=amiga");
    expect(res.status).toBe(200);
    expect(res.body.data.minimumVersion).toBe("0.3.0");
    expect(res.body.data.blockedVersions).toEqual([]);
  });

  it("latest defaults to the minimum", async () => {
    configure({ min: "0.3.0" });
    const res = await request(app).get("/api/v1/desktop/version");
    expect(res.body.data.latestVersion).toBe("0.3.0");
  });
});

describe("desktop minimum version gate on /api/v1", () => {
  // /api/v1/auth/me needs sign-in; 401 proves the request got past the gate.
  const probe = "/api/v1/auth/me";

  it("answers 426 with the contract body when the app is older", async () => {
    configure({ min: "0.3.0", url: "https://example.com/dl" });
    const res = await request(app).get(probe).set(HEADER, "0.2.9");
    expect(res.status).toBe(426);
    expect(res.body).toEqual({
      success: false,
      code: "DESKTOP_UPDATE_REQUIRED",
      message: DEFAULT_MESSAGE,
      data: { minimumVersion: "0.3.0", latestVersion: "0.3.0", downloadUrl: "https://example.com/dl", blockedVersions: [] },
    });
  });

  it("uses DESKTOP_UPDATE_MESSAGE when set", async () => {
    configure({ min: "0.3.0", message: "Security fix. Please update." });
    const res = await request(app).get(probe).set(HEADER, "0.1.0");
    expect(res.status).toBe(426);
    expect(res.body.message).toBe("Security fix. Please update.");
  });

  it("blocks every method and route under /api/v1", async () => {
    configure({ min: "0.3.0" });
    expect((await request(app).post("/api/v1/auth/login").set(HEADER, "0.1.0").send({})).status).toBe(426);
    expect((await request(app).get("/api/v1/shell-labs").set(HEADER, "0.1.0")).status).toBe(426);
    expect((await request(app).get("/api/v1/does-not-exist").set(HEADER, "0.1.0")).status).toBe(426);
  });

  it("lets an equal or newer app through", async () => {
    configure({ min: "0.3.0" });
    for (const version of ["0.3.0", "0.3.1", "0.4.0", "1.0.0", "0.3.0+build.7"]) {
      const res = await request(app).get(probe).set(HEADER, version);
      expect(res.status, version).toBe(401);
    }
  });

  it("lets requests without the header through (web app, old apps)", async () => {
    configure({ min: "9.0.0" });
    expect((await request(app).get(probe)).status).toBe(401);
  });

  it("ignores an invalid header value", async () => {
    configure({ min: "9.0.0" });
    for (const value of ["", "abc", "1", "1.2", "v0.1.0", "0.1.0, 0.1.0", "0.1.0 beta", "01.0.0"]) {
      const res = await request(app).get(probe).set(HEADER, value);
      expect(res.status, JSON.stringify(value)).toBe(401);
    }
  });

  it("never blocks the version route, even for an old app", async () => {
    configure({ min: "9.0.0" });
    const res = await request(app).get("/api/v1/desktop/version").set(HEADER, "0.0.1");
    expect(res.status).toBe(200);
    expect(res.body.data.minimumVersion).toBe("9.0.0");
  });

  it("never blocks /health", async () => {
    configure({ min: "9.0.0" });
    const res = await request(app).get("/health").set(HEADER, "0.0.1");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("blocks nothing with the default 0.0.0 minimum", async () => {
    for (const version of ["0.0.0", "0.0.0-dev", "0.0.1", "1.0.0"]) {
      const res = await request(app).get(probe).set(HEADER, version);
      expect(res.status, version).toBe(401);
    }
  });

  it("treats a prerelease as lower than its release", async () => {
    configure({ min: "0.2.0" });
    expect((await request(app).get(probe).set(HEADER, "0.2.0-beta.1")).status).toBe(426);
    expect((await request(app).get(probe).set(HEADER, "0.2.0")).status).toBe(401);
    configure({ min: "0.2.0-beta.2" });
    expect((await request(app).get(probe).set(HEADER, "0.2.0-beta.1")).status).toBe(426);
    expect((await request(app).get(probe).set(HEADER, "0.2.0-beta.2")).status).toBe(401);
    expect((await request(app).get(probe).set(HEADER, "0.2.0-beta.10")).status).toBe(401);
    expect((await request(app).get(probe).set(HEADER, "0.2.0-rc.1")).status).toBe(401);
  });

  it("compares numbers, not text: 0.10.0 is higher than 0.9.0", async () => {
    configure({ min: "0.9.0" });
    expect((await request(app).get(probe).set(HEADER, "0.10.0")).status).toBe(401);
    configure({ min: "0.10.0" });
    expect((await request(app).get(probe).set(HEADER, "0.9.0")).status).toBe(426);
    expect((await request(app).get(probe).set(HEADER, "0.9.99")).status).toBe(426);
  });
});
