import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { createCourseFixture } from "../helpers/fixtures.js";

// Review queue: an open-question answer travels from submission through the
// mentor's verdict, with the AI draft endpoint reporting its configuration state.

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let mentorToken = "";
let blockId = "";
let responseId = "";

beforeAll(async () => {
  fx = await createCourseFixture();
  mentorToken = (await createSession(fx.mentor.id)).sessionToken;
  blockId = `blk-oq-${fx.course.id}`;
  await prisma.block.create({
    data: {
      id: blockId,
      chapterId: fx.chapterA.id,
      type: "OPEN_QUESTION",
      order: 3,
      points: 5,
      config: { prompt: "Explain the trade-off you made.", minWords: 1, rubric: "Names a concrete trade-off.", sampleAnswer: "Compares two options." },
    },
  });
  const submitted = await request(app)
    .post(`/api/v1/blocks/${blockId}/respond`)
    .set("Authorization", `Bearer ${fx.learnerToken}`)
    .send({ text: "I chose Postgres because the data is relational and the team knows it." });
  expect(submitted.status).toBe(200);
  const response = await prisma.response.findFirstOrThrow({ where: { blockId, userId: fx.learner.id } });
  responseId = response.id;
});

afterAll(async () => {
  await prisma.review.deleteMany({ where: { response: { blockId } } });
  await fx.cleanup();
});

const mentor = () => ({ Authorization: `Bearer ${mentorToken}` });

describe("/api/v1/teach/review", () => {
  it("queues the pending answer for the course mentor", async () => {
    const res = await request(app).get("/api/v1/teach/review").set(mentor());
    expect(res.status).toBe(200);
    expect(res.body.data.courses.map((c: { id: string }) => c.id)).toContain(fx.course.id);
    const item = res.body.data.items.find((i: { id: string }) => i.id === responseId);
    expect(item).toMatchObject({ attempt: 1, learnerLabel: "Test Learner", courseTitle: fx.course.title, chapterTitle: "Chapter A" });

    const filtered = await request(app).get(`/api/v1/teach/review?courseId=${fx.course.id}`).set(mentor());
    expect(filtered.body.data.items.map((i: { id: string }) => i.id)).toContain(responseId);
  });

  it("shows the submission with the mentor-only question config", async () => {
    const res = await request(app).get(`/api/v1/teach/review/${responseId}`).set(mentor());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "PENDING_REVIEW",
      attempt: 1,
      learner: { id: fx.learner.id },
      course: { id: fx.course.id, slug: fx.course.slug },
      block: { id: blockId, type: "OPEN_QUESTION", points: 5 },
      question: { prompt: "Explain the trade-off you made.", rubric: "Names a concrete trade-off.", sampleAnswer: "Compares two options." },
      answerUrl: null,
      review: null,
      history: [],
    });
    expect(res.body.data.answerText).toMatch(/^I chose Postgres/);

    expect((await request(app).get(`/api/v1/teach/review/${responseId}`).set("Authorization", `Bearer ${fx.learnerToken}`)).status).toBe(403);
    expect((await request(app).get("/api/v1/teach/review/nope").set(mentor())).status).toBe(404);
  });

  it("reports that AI drafting is not configured", async () => {
    const res = await request(app).post(`/api/v1/teach/review/${responseId}/ai-draft`).set(mentor());
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("AI_DRAFT_UNAVAILABLE");
    expect(res.body.message).toMatch(/OpenRouter key in Settings/);
  });

  it("records the verdict, caps the score and clears the pending counters", async () => {
    const invalid = await request(app).post(`/api/v1/teach/review/${responseId}`).set(mentor()).send({ verdict: "APPROVED", feedback: "" });
    expect(invalid.status).toBe(400);

    const res = await request(app).post(`/api/v1/teach/review/${responseId}`).set(mentor()).send({ verdict: "APPROVED", feedback: "Clear reasoning.", score: 9 });
    expect(res.status).toBe(204);

    const response = await prisma.response.findUniqueOrThrow({ where: { id: responseId }, include: { review: true } });
    expect(response).toMatchObject({ status: "REVIEWED", score: 5, maxScore: 5 });
    expect(response.review).toMatchObject({ reviewerId: fx.mentor.id, verdict: "APPROVED", score: 5, feedback: "Clear reasoning." });
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } })).pendingReviews).toBe(0);

    const again = await request(app).post(`/api/v1/teach/review/${responseId}`).set(mentor()).send({ verdict: "APPROVED", feedback: "Again" });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_REVIEWED");

    const detail = await request(app).get(`/api/v1/teach/review/${responseId}`).set(mentor());
    expect(detail.body.data.review).toEqual({ score: 5, verdict: "APPROVED" });
    expect(detail.body.data.history).toEqual([{ id: responseId, attempt: 1, verdict: "APPROVED", feedback: "Clear reasoning.", reviewerName: "Test Mentor" }]);
    expect((await request(app).get("/api/v1/teach/review").set(mentor())).body.data.items.map((i: { id: string }) => i.id)).not.toContain(responseId);
  });
});
