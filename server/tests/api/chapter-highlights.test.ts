import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let otherUserId: string;
let otherToken: string;

beforeAll(async () => {
  fx = await createCourseFixture();
  const other = await prisma.user.create({
    data: { email: `highlight-other-${fx.tag}@test.local`, name: "Other Learner", role: "MENTEE", emailVerified: new Date() },
  });
  otherUserId = other.id;
  await prisma.enrollment.create({
    data: { courseId: fx.course.id, userId: other.id, lifecycle: "ACTIVE", status: "IN_PROGRESS", source: "DIRECT", startedAt: new Date() },
  });
  otherToken = (await createSession(other.id, randomBytes(32).toString("hex"))).sessionToken;
});

afterAll(async () => {
  await prisma.chapterHighlight.deleteMany({ where: { chapterId: fx.chapterA.id } });
  await prisma.session.deleteMany({ where: { userId: otherUserId } });
  await prisma.enrollment.deleteMany({ where: { userId: otherUserId } });
  await prisma.user.deleteMany({ where: { id: otherUserId } });
  await fx.cleanup();
});

const learner = (token = fx.learnerToken) => ({ Authorization: `Bearer ${token}` });
const highlightsPath = () => `/api/v1/chapters/${fx.chapterA.id}/highlights`;

describe("/api/v1/chapters/:chapterId/highlights", () => {
  it("creates a highlight with the default color and lists it back", async () => {
    const created = await request(app)
      .post(highlightsPath())
      .set(learner())
      .send({ quote: "Plan the sprint", prefix: "First, ", suffix: " before coding.", occurrence: 0, note: "  Key idea  " });

    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      color: "YELLOW",
      quote: "Plan the sprint",
      prefix: "First,",
      suffix: "before coding.",
      occurrence: 0,
      note: "Key idea",
    });

    const listed = await request(app).get(highlightsPath()).set(learner());
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({ id: created.body.data.id, quote: "Plan the sprint" });
  });

  it("rejects empty quotes, quotes over 500 characters, and unknown colors", async () => {
    const empty = await request(app).post(highlightsPath()).set(learner()).send({ quote: "" });
    expect(empty.status).toBe(400);

    const tooLong = await request(app).post(highlightsPath()).set(learner()).send({ quote: "x".repeat(501) });
    expect(tooLong.status).toBe(400);

    const badColor = await request(app).post(highlightsPath()).set(learner()).send({ quote: "Valid text", color: "ORANGE" });
    expect(badColor.status).toBe(400);
  });

  it("accepts a quote of exactly 500 characters", async () => {
    const res = await request(app).post(highlightsPath()).set(learner()).send({ quote: "y".repeat(500), occurrence: 1 });
    expect(res.status).toBe(200);
  });

  it("returns 409 for the same quote and occurrence, but allows another occurrence", async () => {
    const dup = await request(app).post(highlightsPath()).set(learner()).send({ quote: "Plan the sprint", occurrence: 0 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("HIGHLIGHT_EXISTS");

    const otherOccurrence = await request(app).post(highlightsPath()).set(learner()).send({ quote: "Plan the sprint", occurrence: 1 });
    expect(otherOccurrence.status).toBe(200);
  });

  it("lets only the owner update or delete a highlight", async () => {
    const created = await request(app).post(highlightsPath()).set(learner()).send({ quote: "Owned text" });
    const id = created.body.data.id as string;

    const foreignPatch = await request(app)
      .patch(`/api/v1/learner/highlights/${id}`)
      .set(learner(otherToken))
      .send({ color: "GREEN" });
    expect(foreignPatch.status).toBe(403);

    const foreignDelete = await request(app).delete(`/api/v1/learner/highlights/${id}`).set(learner(otherToken));
    expect(foreignDelete.status).toBe(403);

    const ownPatch = await request(app)
      .patch(`/api/v1/learner/highlights/${id}`)
      .set(learner())
      .send({ color: "GREEN", note: "Revisit" });
    expect(ownPatch.status).toBe(200);
    expect(ownPatch.body.data).toMatchObject({ color: "GREEN", note: "Revisit" });

    const ownDelete = await request(app).delete(`/api/v1/learner/highlights/${id}`).set(learner());
    expect(ownDelete.status).toBe(204);

    const gone = await request(app).delete(`/api/v1/learner/highlights/${id}`).set(learner());
    expect(gone.status).toBe(404);
  });

  it("keeps highlights private to the learner who created them", async () => {
    const listed = await request(app).get(highlightsPath()).set(learner(otherToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([]);
  });

  it("shows the learner's highlights in the library with chapter context", async () => {
    const library = await request(app).get("/api/v1/learner/highlights").set(learner());
    expect(library.status).toBe(200);
    expect(library.body.data.length).toBeGreaterThan(0);
    expect(library.body.data[0]).toMatchObject({
      chapterId: fx.chapterA.id,
      chapterTitle: fx.chapterA.title,
      courseTitle: fx.course.title,
    });
  });
});
