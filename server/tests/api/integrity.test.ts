import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { runIntegrityRetention } from "../../src/services/jobs/integrity-retention.js";
import { INTEGRITY_LIMITS } from "../../src/shared/api/integrity.js";
import { completeChapter, createCourseFixture } from "../helpers/fixtures.js";

// Quiz integrity signals: learners append flags and opt-in camera stills to their
// own attempt; the course team reads them through signed, short-lived links.

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let mentorToken = "";
let otherToken = "";
let otherUserId = "";

beforeAll(async () => {
  fx = await createCourseFixture();
  mentorToken = (await createSession(fx.mentor.id)).sessionToken;
  const other = await prisma.user.create({
    data: { email: `other-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
  });
  otherUserId = other.id;
  otherToken = (await createSession(other.id)).sessionToken;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: otherUserId } });
  await prisma.user.delete({ where: { id: otherUserId } });
  await fx.cleanup();
});

const learner = () => ({ Authorization: `Bearer ${fx.learnerToken}` });
const mentor = () => ({ Authorization: `Bearer ${mentorToken}` });
const eventId = () => randomBytes(9).toString("base64url");
const jpeg = (size = 2048) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)]);

const openAttempt = () => request(app).post(`/api/v1/chapters/${fx.chapterB.id}/integrity`).set(learner());
const postEvents = (attemptId: string, events: unknown[], headers = learner()) =>
  request(app).post(`/api/v1/integrity/attempts/${attemptId}/events`).set(headers).send({ events });

describe("opening a proctored quiz attempt", () => {
  it("404s for a chapter that is not in quiz mode", async () => {
    const res = await request(app).post(`/api/v1/chapters/${fx.chapterA.id}/integrity`).set(learner());
    expect(res.status).toBe(404);
  });

  it("resumes the same attempt on reload and keeps the camera off by default", async () => {
    const first = await openAttempt();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ attempt: 1, flagCount: 0, camera: { enabled: false, status: "NOT_REQUESTED" } });
    const again = await openAttempt();
    expect(again.body.data.attemptId).toBe(first.body.data.attemptId);
  });

  it("starts a new attempt after the learner submits the quiz", async () => {
    await completeChapter(fx.enrollment.id, fx.chapterA.id);
    const before = (await openAttempt()).body.data.attemptId;
    await request(app)
      .post(`/api/v1/chapters/${fx.chapterB.id}/quiz/submit`)
      .set(learner())
      .send({ answers: fx.quizChapterBlocks.map((block) => ({ blockId: block.id, selected: ["b"] })) })
      .expect(200);
    const after = await openAttempt();
    expect(after.body.data.attempt).toBe(2);
    expect(after.body.data.attemptId).not.toBe(before);
  });
});

describe("recording events", () => {
  it("appends events once, even when a batch is retried", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const batch = [
      { id: eventId(), type: "TAB_HIDDEN", at: new Date().toISOString(), meta: { awayMs: 4200 } },
      { id: eventId(), type: "PASTE_BLOCKED", at: new Date().toISOString(), blockId: fx.quizChapterBlocks[0]!.id },
      { id: eventId(), type: "CAMERA_OFF", at: new Date().toISOString(), meta: { reason: "no-device" } },
    ];
    const first = await postEvents(attemptId, batch);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ accepted: 3, flagCount: 2 });

    const retry = await postEvents(attemptId, batch);
    expect(retry.body.data).toEqual({ accepted: 0, flagCount: 2 });
    expect(await prisma.integrityEvent.count({ where: { attemptId } })).toBe(3);
  });

  it("keeps one second-screen flag per attempt", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const screen = () => ({ id: eventId(), type: "SECOND_SCREEN", at: new Date().toISOString(), meta: { extended: true } });
    await postEvents(attemptId, [screen(), screen()]).expect(200);
    await postEvents(attemptId, [screen()]).expect(200);
    expect(await prisma.integrityEvent.count({ where: { attemptId, type: "SECOND_SCREEN" } })).toBe(1);
  });

  it("rejects event types outside the allow-list", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const res = await postEvents(attemptId, [{ id: eventId(), type: "KEYLOGGER", at: new Date().toISOString() }]);
    expect(res.status).toBe(400);
  });

  it("clamps impossible timestamps to the server clock", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const id = eventId();
    await postEvents(attemptId, [{ id, type: "WINDOW_BLUR", at: "2001-01-01T00:00:00.000Z" }]).expect(200);
    const row = await prisma.integrityEvent.findUniqueOrThrow({ where: { attemptId_clientId: { attemptId, clientId: id } } });
    expect(Date.now() - row.at.getTime()).toBeLessThan(60_000);
  });

  it("stores nothing past the per-attempt cap and counts what it dropped", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const attempt = await prisma.integrityAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    await prisma.integrityAttempt.update({ where: { id: attemptId }, data: { eventCount: INTEGRITY_LIMITS.eventsPerAttempt - 1 } });
    const res = await postEvents(attemptId, [
      { id: eventId(), type: "MOUSE_LEFT", at: new Date().toISOString() },
      { id: eventId(), type: "MOUSE_LEFT", at: new Date().toISOString() },
    ]);
    expect(res.body.data.accepted).toBe(1);
    const after = await prisma.integrityAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(after.droppedEvents).toBe(attempt.droppedEvents + 1);
    await prisma.integrityAttempt.update({ where: { id: attemptId }, data: { eventCount: attempt.eventCount + 1 } });
  });

  it("does not let another learner write to the attempt", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const res = await postEvents(attemptId, [{ id: eventId(), type: "TAB_HIDDEN", at: new Date().toISOString() }], {
      Authorization: `Bearer ${otherToken}`,
    });
    expect(res.status).toBe(404);
  });
});

describe("camera snapshots", () => {
  const upload = (attemptId: string, body: Buffer) =>
    request(app).post(`/api/v1/integrity/attempts/${attemptId}/snapshots`).set(learner()).set("Content-Type", "image/jpeg").send(body);

  it("refuses stills while the course has snapshots off", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const camera = await request(app).put(`/api/v1/integrity/attempts/${attemptId}/camera`).set(learner()).send({ status: "ON" });
    expect(camera.body.data.status).toBe("NOT_REQUESTED");
    expect((await upload(attemptId, jpeg())).status).toBe(403);
  });

  it("only the course team can turn snapshots on", async () => {
    const denied = await request(app).put(`/api/v1/teach/courses/${fx.course.id}/integrity`).set(learner()).send({ integritySnapshots: true });
    expect(denied.status).toBe(403);
    const res = await request(app).put(`/api/v1/teach/courses/${fx.course.id}/integrity`).set(mentor()).send({ integritySnapshots: true });
    expect(res.body.data).toEqual({
      integritySnapshots: true,
      integrityMode: "STANDARD",
    });
  });

  it("stores a small JPEG after consent and throttles the next one", async () => {
    const { attemptId, camera } = (await openAttempt()).body.data;
    expect(camera).toMatchObject({ enabled: true, width: 320, height: 240, retentionDays: 30 });
    expect((await upload(attemptId, jpeg())).status).toBe(403);
    await request(app).put(`/api/v1/integrity/attempts/${attemptId}/camera`).set(learner()).send({ status: "ON" }).expect(200);

    expect((await upload(attemptId, Buffer.from("not a jpeg at all"))).status).toBe(400);
    expect((await upload(attemptId, jpeg(INTEGRITY_LIMITS.snapshotMaxBytes + 10))).status).toBe(413);
    expect((await upload(attemptId, jpeg())).status).toBe(201);
    expect((await upload(attemptId, jpeg())).status).toBe(429);
  });

  it("never blocks a quiz submit when the camera is off: it is only a flag", async () => {
    const { attemptId } = (await openAttempt()).body.data;
    const camera = (status: string) =>
      request(app).put(`/api/v1/integrity/attempts/${attemptId}/camera`).set(learner()).send({ status }).expect(200);

    await camera("UNAVAILABLE");
    const submitted = await request(app)
      .post(`/api/v1/chapters/${fx.chapterB.id}/quiz/submit`)
      .set(learner())
      .send({ answers: fx.quizChapterBlocks.map((block) => ({ blockId: block.id, selected: ["a"] })) });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.score).toBe(2);

    await camera("ON");
  });
});

describe("attempt numbering", () => {
  it("does not start a new attempt when an open question in the chapter is answered", async () => {
    const before = (await openAttempt()).body.data;
    const openQuestion = await prisma.block.create({
      data: { id: `blk-oq-${fx.tag}`, chapterId: fx.chapterB.id, type: "OPEN_QUESTION", order: 9, config: { prompt: "Why?", minWords: 0 } },
    });
    await prisma.response.create({
      data: { blockId: openQuestion.id, userId: fx.learner.id, enrollmentId: fx.enrollment.id, attempt: 7, status: "PENDING_REVIEW", payload: { text: "Because." } },
    });
    try {
      const after = (await openAttempt()).body.data;
      expect(after.attemptId).toBe(before.attemptId);
    } finally {
      await prisma.block.delete({ where: { id: openQuestion.id } });
    }
  });
});

describe("mentor view", () => {
  it("lists attempts in the mentee evaluation and hides details from learners", async () => {
    const res = await request(app).get(`/api/v1/teach/courses/${fx.course.slug}/mentees/${fx.enrollment.id}`).set(mentor());
    expect(res.status).toBe(200);
    const latest = res.body.data.integrity.find((attempt: { attempt: number }) => attempt.attempt === 2);
    expect(latest).toMatchObject({ chapterId: fx.chapterB.id, attempt: 2, cameraStatus: "ON", snapshotCount: 1 });
    expect(latest.counts).toMatchObject({ TAB_HIDDEN: 1, PASTE_BLOCKED: 1, CAMERA_OFF: 1 });

    const asLearner = await request(app).get(`/api/v1/teach/integrity/attempts/${latest.id}`).set(learner());
    expect(asLearner.status).toBe(403);
  });

  it("refuses the attempt detail to a mentor of another course", async () => {
    const attempt = await prisma.integrityAttempt.findFirstOrThrow({ where: { enrollmentId: fx.enrollment.id } });
    const outsider = await prisma.user.create({
      data: { email: `outsider-${fx.tag}@test.local`, role: "MENTOR", emailVerified: new Date() },
    });
    try {
      const token = (await createSession(outsider.id)).sessionToken;
      const res = await request(app).get(`/api/v1/teach/integrity/attempts/${attempt.id}`).set({ Authorization: `Bearer ${token}` });
      expect(res.status).toBe(403);
    } finally {
      await prisma.session.deleteMany({ where: { userId: outsider.id } });
      await prisma.user.delete({ where: { id: outsider.id } });
    }
  });

  it("serves snapshots only through a valid signed link", async () => {
    const attempt = await prisma.integrityAttempt.findFirstOrThrow({ where: { enrollmentId: fx.enrollment.id, snapshotCount: 1 } });
    const res = await request(app).get(`/api/v1/teach/integrity/attempts/${attempt.id}`).set(mentor());
    expect(res.status).toBe(200);
    const url: string = res.body.data.snapshots[0].url;
    expect(url).toMatch(/^\/api\/v1\/media\/integrity\/\w+\.jpg\?exp=\d+&sig=/);

    const image = await request(app).get(url);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(image.headers["cache-control"]).toContain("private");

    expect((await request(app).get(url.replace(/sig=.*/, "sig=forged"))).status).toBe(404);
    expect((await request(app).get(url.replace(/exp=\d+/, "exp=1"))).status).toBe(404);
  });

  it("deletes stills after the retention window but keeps the flags", async () => {
    const snapshot = await prisma.integritySnapshot.findFirstOrThrow({ where: { attempt: { enrollmentId: fx.enrollment.id } } });
    await prisma.integritySnapshot.update({ where: { id: snapshot.id }, data: { takenAt: new Date(Date.now() - 31 * 86_400_000) } });
    const flagsBefore = await prisma.integrityEvent.count({ where: { attempt: { enrollmentId: fx.enrollment.id } } });

    // Storage refusing a key leaves the row for the next run instead of claiming it was deleted.
    const refusingStore = {
      put: async () => undefined,
      get: async () => Buffer.alloc(0),
      remove: async (keys: string[]) => keys,
      sweep: async () => 0,
    };
    const refused = await runIntegrityRetention(new Date(), refusingStore);
    expect(refused).toMatchObject({ deleted: 0 });
    expect(refused.failed).toBeGreaterThanOrEqual(1);
    expect((await prisma.integritySnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).deletedAt).toBeNull();

    const result = await runIntegrityRetention();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    expect((await runIntegrityRetention()).deleted).toBe(0);

    const detail = await request(app).get(`/api/v1/teach/integrity/attempts/${snapshot.attemptId}`).set(mentor());
    expect(detail.body.data.snapshots[0]).toMatchObject({ id: snapshot.id, url: null });
    expect(await prisma.integrityEvent.count({ where: { attempt: { enrollmentId: fx.enrollment.id } } })).toBe(flagsBefore);
  });
});
