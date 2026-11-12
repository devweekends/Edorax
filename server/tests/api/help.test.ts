import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let mentorToken = "";
let threadId = "";

beforeAll(async () => {
  fx = await createCourseFixture();
  mentorToken = (await createSession(fx.mentor.id)).sessionToken;
});
afterAll(async () => {
  await prisma.helpMessage.deleteMany({ where: { thread: { courseId: fx.course.id } } });
  await prisma.helpThread.deleteMany({ where: { courseId: fx.course.id } });
  await fx.cleanup();
});

const learner = () => ({ Authorization: `Bearer ${fx.learnerToken}` });
const mentor = () => ({ Authorization: `Bearer ${mentorToken}` });

describe("/api/v1/help", () => {
  it("starts empty and validates the question length", async () => {
    const list = await request(app).get("/api/v1/help/threads").set(learner());
    expect(list.body.data.threads).toEqual([]);

    const short = await request(app).post("/api/v1/help/threads").set(learner()).send({ courseId: fx.course.id, chapterId: fx.chapterA.id, body: "help" });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/at least 10 characters/);
  });

  it("refuses questions on locked chapters", async () => {
    const res = await request(app).post("/api/v1/help/threads").set(learner()).send({ courseId: fx.course.id, chapterId: fx.chapterB.id, body: "I am stuck on this quiz chapter." });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CHAPTER_LOCKED");
  });

  it("creates a thread, then appends to the open one for the same chapter", async () => {
    const first = await request(app).post("/api/v1/help/threads").set(learner()).send({ courseId: fx.course.id, chapterId: fx.chapterA.id, body: "What does the second option mean exactly?" });
    expect(first.status).toBe(201);
    threadId = first.body.data.threadId;

    const second = await request(app).post("/api/v1/help/threads").set(learner()).send({ courseId: fx.course.id, chapterId: fx.chapterA.id, body: "Also, is there a reading I should do first?" });
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual({ threadId, created: false });

    const list = await request(app).get("/api/v1/help/threads").set(learner());
    expect(list.body.data.threads).toHaveLength(1);
    expect(list.body.data.threads[0]).toMatchObject({ id: threadId, status: "OPEN", unread: false, chapter: { slug: "chapter-a" } });
  });

  it("lets the course mentor read and reply, and flags the reply unread for the learner", async () => {
    const stranger = await request(app).get(`/api/v1/help/threads/${threadId}`).set({ Authorization: `Bearer ${fx.unverifiedToken}` });
    expect(stranger.status).toBe(403);

    const initial = await request(app).get(`/api/v1/help/threads/${threadId}`).set(mentor());
    const targetMessageId = initial.body.data.messages[0].id;
    const reply = await request(app)
      .post(`/api/v1/help/threads/${threadId}/messages`)
      .set(mentor())
      .send({
        body: "It means the vendor pays the fee, not the buyer.",
        replyToId: targetMessageId,
      });
    expect(reply.status).toBe(201);
    expect(reply.body.data.message.replyTo).toMatchObject({
      id: targetMessageId,
      authorName: "Test Learner",
    });

    const list = await request(app).get("/api/v1/help/threads").set(learner());
    expect(list.body.data.threads[0].unread).toBe(true);

    const detail = await request(app).get(`/api/v1/help/threads/${threadId}`).set(learner());
    expect(detail.body.data.messages.map((m: { authorRole: string }) => m.authorRole)).toEqual(["MENTEE", "MENTEE", "MENTOR"]);
    expect(detail.body.data.course.slug).toBe(fx.course.slug);

    const seen = await request(app)
      .post(`/api/v1/help/threads/${threadId}/seen`)
      .set(learner());
    expect(seen.status).toBe(200);
    const updated = await request(app).get(`/api/v1/help/threads/${threadId}`).set(mentor());
    const mentorMessage = updated.body.data.messages.find(
      (message: { authorRole: string }) => message.authorRole === "MENTOR",
    );
    expect(mentorMessage.seenAt).toEqual(expect.any(String));

    const after = await request(app).get("/api/v1/help/threads").set(learner());
    expect(after.body.data.threads[0].unread).toBe(false);
  });

  it("creates a lesson report with a category and quote, and the mentor can filter it", async () => {
    const short = await request(app)
      .post("/api/v1/help/reports")
      .set(learner())
      .send({ courseId: fx.course.id, chapterId: fx.chapterA.id, category: "TYPO", body: "short" });
    expect(short.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/help/reports")
      .set(learner())
      .send({
        courseId: fx.course.id,
        chapterId: fx.chapterA.id,
        category: "TYPO",
        body: "The second paragraph has a missing word.",
        quote: "two copies of the truth",
      });
    expect(created.status).toBe(201);

    const list = await request(app).get("/api/v1/help/threads").set(learner());
    const report = list.body.data.threads.find(
      (thread: { id: string }) => thread.id === created.body.data.threadId,
    );
    expect(report).toMatchObject({
      kind: "LESSON_REPORT",
      category: "TYPO",
      quote: "two copies of the truth",
    });

    const reports = await request(app).get("/api/v1/teach/help/threads?kind=reports").set(mentor());
    expect(reports.status).toBe(200);
    expect(
      reports.body.data.threads.some(
        (thread: { id: string }) => thread.id === created.body.data.threadId,
      ),
    ).toBe(true);

    const questions = await request(app).get("/api/v1/teach/help/threads?kind=questions").set(mentor());
    expect(
      questions.body.data.threads.some(
        (thread: { id: string }) => thread.id === created.body.data.threadId,
      ),
    ).toBe(false);

    // Chapter reader Q&A keeps pointing at the mentor question thread, not the lesson report.
    const reader = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${fx.chapterA.slug}`)
      .set(learner());
    expect(reader.status).toBe(200);
    expect(reader.body.data.content.helpThread?.id).toBe(threadId);
  });

  it("only the mentor resolves, and a resolved thread rejects replies", async () => {
    const denied = await request(app).post(`/api/v1/help/threads/${threadId}/resolve`).set(learner());
    expect(denied.status).toBe(403);

    const resolved = await request(app).post(`/api/v1/help/threads/${threadId}/resolve`).set(mentor());
    expect(resolved.body.data).toEqual({ threadId, alreadyResolved: false });

    const closed = await request(app).post(`/api/v1/help/threads/${threadId}/messages`).set(learner()).send({ body: "One more thing I wanted to ask." });
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe("THREAD_CLOSED");

    // Asking a new mentor question after resolution starts a new QUESTION thread instead of hijacking an open LESSON_REPORT.
    const freshQuestion = await request(app)
      .post("/api/v1/help/threads")
      .set(learner())
      .send({ courseId: fx.course.id, chapterId: fx.chapterA.id, body: "Follow-up study question after resolving the first thread." });
    expect(freshQuestion.status).toBe(201);
    expect(freshQuestion.body.data.created).toBe(true);
    expect(freshQuestion.body.data.threadId).not.toBe(threadId);
  });
});
