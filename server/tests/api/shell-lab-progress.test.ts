import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";

const app = createApp();
const tag = randomUUID().slice(0, 8);
const slug = `progress-test-${tag}`;
let userId = "";
let otherId = "";
let auth: Record<string, string> = {};
let otherAuth: Record<string, string> = {};

async function makeUser(name: string) {
  const user = await prisma.user.create({ data: { email: `${name}-${tag}@test.local`, name, role: "MENTEE", emailVerified: new Date() } });
  return { id: user.id, auth: { Authorization: `Bearer ${(await createSession(user.id)).sessionToken}` } };
}

beforeAll(async () => {
  ({ id: userId, auth } = await makeUser("progress-a"));
  ({ id: otherId, auth: otherAuth } = await makeUser("progress-b"));
  await prisma.shellLab.create({
    data: { slug, topic: "linux", level: "beginner", title: "Progress test", summary: "x", minutes: 1, position: 9999, active: false, contentHash: "x", data: {} },
  });
});

afterAll(async () => {
  await prisma.shellLab.delete({ where: { slug } });
  await prisma.session.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

describe("/api/v1/shell-labs/progress", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/shell-labs/progress")).status).toBe(401);
    expect((await request(app).put(`/api/v1/shell-labs/progress/${slug}`).send({ steps: ["a"] })).status).toBe(401);
  });

  it("starts empty, saves steps, and gives them back", async () => {
    const empty = await request(app).get("/api/v1/shell-labs/progress").set(auth);
    expect(empty.body).toEqual({ success: true, data: { progress: {} } });

    const saved = await request(app).put(`/api/v1/shell-labs/progress/${slug}`).set(auth).send({ steps: ["make-folder", "first-file", "make-folder"] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ slug, steps: ["make-folder", "first-file"] });

    const read = await request(app).get("/api/v1/shell-labs/progress").set(auth);
    expect(read.body.data.progress).toEqual({ [slug]: ["make-folder", "first-file"] });
  });

  it("keeps each learner's progress apart", async () => {
    const other = await request(app).get("/api/v1/shell-labs/progress").set(otherAuth);
    expect(other.body.data.progress).toEqual({});
  });

  it("an empty list clears the lab (a reset)", async () => {
    const cleared = await request(app).put(`/api/v1/shell-labs/progress/${slug}`).set(auth).send({ steps: [] });
    expect(cleared.status).toBe(200);
    const read = await request(app).get("/api/v1/shell-labs/progress").set(auth);
    expect(read.body.data.progress).toEqual({});
  });

  it("refuses an unknown lab and bad step lists", async () => {
    const put = (path: string, body: unknown) => request(app).put(`/api/v1/shell-labs/progress/${path}`).set(auth).send(body as object);
    expect((await put("no-such-lab", { steps: ["a"] })).status).toBe(400);
    expect((await put(slug, { steps: "a" })).status).toBe(400);
    expect((await put(slug, {})).status).toBe(400);
    expect((await put(slug, { steps: [1] })).status).toBe(400);
    expect((await put(slug, { steps: ["x".repeat(81)] })).status).toBe(400);
    expect((await put(slug, { steps: Array.from({ length: 101 }, (_, i) => `s${i}`) })).status).toBe(400);
  });
});
