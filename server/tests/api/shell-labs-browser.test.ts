import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";

const app = createApp();
const tag = randomUUID().slice(0, 8);
const browserSlug = `browser-lab-${tag}`;
const desktopSlug = `desktop-lab-${tag}`;
const retiredSlug = `retired-lab-${tag}`;
let userId = "";
let auth: Record<string, string> = {};

const lab = (slug: string, machine: Record<string, unknown>) => ({
  slug,
  topic: "linux",
  level: "beginner",
  title: "Browser test",
  summary: "x",
  minutes: 1,
  machine: { name: "box", image: "ubuntu:24.04", ...machine },
  steps: [{ id: "one", goal: "Do it", checks: [{ id: "c", label: "Done", run: "test -f /root/done", fail: "Not yet." }], solution: "touch /root/done" }],
});

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `browser-lab-${tag}@test.local`, name: "Browser Lab", role: "MENTEE", emailVerified: new Date() } });
  userId = user.id;
  auth = { Authorization: `Bearer ${(await createSession(user.id)).sessionToken}` };
  const row = { topic: "linux", level: "beginner", title: "Browser test", summary: "x", minutes: 1, position: 9999, contentHash: "x" };
  await prisma.shellLab.createMany({
    data: [
      { ...row, slug: browserSlug, active: true, data: lab(browserSlug, { packages: ["nano"] }) },
      { ...row, slug: desktopSlug, active: true, data: lab(desktopSlug, { vm: true }) },
      { ...row, slug: retiredSlug, active: false, data: lab(retiredSlug, {}) },
    ],
  });
});

afterAll(async () => {
  await prisma.shellLab.deleteMany({ where: { slug: { in: [browserSlug, desktopSlug, retiredSlug] } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("GET /api/v1/shell-labs/browser/:slug", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get(`/api/v1/shell-labs/browser/${browserSlug}`)).status).toBe(401);
  });

  it("sends the whole lab, checks included, when it runs in the browser", async () => {
    const response = await request(app).get(`/api/v1/shell-labs/browser/${browserSlug}`).set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.lab.slug).toBe(browserSlug);
    expect(response.body.data.lab.steps[0].checks[0].run).toBe("test -f /root/done");
  });

  it("answers 404 for a desktop-only lab, a retired lab and an unknown lab", async () => {
    for (const slug of [desktopSlug, retiredSlug, `missing-${tag}`]) {
      expect((await request(app).get(`/api/v1/shell-labs/browser/${slug}`).set(auth)).status).toBe(404);
    }
  });

  it("marks the lab in the public catalogue", async () => {
    const labs = (await request(app).get("/api/v1/shell-labs/public")).body.data.labs as { slug: string; browser: boolean }[];
    expect(labs.find((item) => item.slug === browserSlug)?.browser).toBe(true);
    expect(labs.find((item) => item.slug === desktopSlug)?.browser).toBe(false);
  });
});
