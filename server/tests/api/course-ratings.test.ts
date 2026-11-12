import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { completeChapter, createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let chapterCSlug = "chapter-c";

beforeAll(async () => {
  fx = await createCourseFixture();
  const mod = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
  const chC = await prisma.chapter.create({
    data: {
      courseId: fx.course.id,
      moduleId: mod.id,
      slug: "chapter-c",
      title: "Chapter C",
      order: 3,
      source: "# C",
      publishedAt: new Date(),
    },
  });
  chapterCSlug = chC.slug;
});
afterAll(async () => {
  await prisma.courseRating.deleteMany({ where: { courseId: fx.course.id } });
  await fx.cleanup();
});

const learner = () => ({ Authorization: `Bearer ${fx.learnerToken}` });

describe("/api/v1/courses/:courseSlug/rating", () => {
  it("refuses ratings and does not prompt until the learner has finished more than half of the course", async () => {
    const firstChapter = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${fx.chapterA.slug}`)
      .set(learner());
    expect(firstChapter.status).toBe(200);
    expect(firstChapter.body.data.content.promptCourseRating).toBe(false);

    // 1 of 3 chapters complete (33% <= 50%): still under half, so do not prompt or accept a rating yet.
    await completeChapter(fx.enrollment.id, fx.chapterA.id);
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { chaptersCompleted: 1, percentComplete: 33, status: "IN_PROGRESS" },
    });

    const secondChapter = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${fx.chapterB.slug}`)
      .set(learner());
    expect(secondChapter.status).toBe(200);
    expect(secondChapter.body.data.content.promptCourseRating).toBe(false);

    const earlyRes = await request(app)
      .put(`/api/v1/courses/${fx.course.slug}/rating`)
      .set(learner())
      .send({ rating: 5, review: "Great start." });
    expect(earlyRes.status).toBe(403);
  });

  it("prompts on the next chapter once more than half of the course is finished and accepts ratings", async () => {
    // 2 of 3 chapters complete (67% > 50%): more than half of the course is finished.
    await completeChapter(fx.enrollment.id, fx.chapterB.id);
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { chaptersCompleted: 2, percentComplete: 67, status: "IN_PROGRESS" },
    });

    // Does not prompt on the completed chapter itself (when ending the chapter).
    const completedChapter = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${fx.chapterB.slug}`)
      .set(learner());
    expect(completedChapter.status).toBe(200);
    expect(completedChapter.body.data.content.promptCourseRating).toBe(false);

    // Prompts once the learner moves on to the next chapter.
    const nextChapter = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${chapterCSlug}`)
      .set(learner());
    expect(nextChapter.status).toBe(200);
    expect(nextChapter.body.data.content.promptCourseRating).toBe(true);

    const invalid = await request(app)
      .put(`/api/v1/courses/${fx.course.slug}/rating`)
      .set(learner())
      .send({ rating: 6 });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .put(`/api/v1/courses/${fx.course.slug}/rating`)
      .set(learner())
      .send({ rating: 5, review: "Clear, practical, and worth the time." });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ rating: 5, review: "Clear, practical, and worth the time." });

    // Once rated, the chapter reader no longer prompts.
    const nextAfterRating = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${chapterCSlug}`)
      .set(learner());
    expect(nextAfterRating.body.data.content.promptCourseRating).toBe(false);

    const mine = await request(app).get(`/api/v1/courses/${fx.course.slug}/rating`).set(learner());
    expect(mine.body.data.rating).toMatchObject({ rating: 5 });

    const catalog = await request(app).get(`/api/v1/catalog/${fx.course.slug}`);
    expect(catalog.body.data).toMatchObject({ ratingAverage: 5, ratingCount: 1 });

    const reviews = await request(app).get(`/api/v1/catalog/${fx.course.slug}/reviews`);
    expect(reviews.status).toBe(200);
    expect(reviews.body.data).toMatchObject({ count: 1, average: 5 });
    expect(reviews.body.data.items[0]).toMatchObject({ rating: 5, reviewer: "Test L." });

    // Editing must replace, not add a second rating.
    const updated = await request(app)
      .put(`/api/v1/courses/${fx.course.slug}/rating`)
      .set(learner())
      .send({ rating: 3, review: null });
    expect(updated.status).toBe(200);

    const after = await request(app).get(`/api/v1/courses/${fx.course.slug}/rating`).set(learner());
    expect(after.body.data.rating).toMatchObject({ rating: 3, review: null });

    const catalogAfter = await request(app).get(`/api/v1/catalog/${fx.course.slug}`);
    expect(catalogAfter.body.data).toMatchObject({ ratingAverage: 3, ratingCount: 1 });
  });

  it("remembers a dismissed prompt so neither the chapter pop-up nor overview card returns", async () => {
    await prisma.courseRating.deleteMany({ where: { courseId: fx.course.id, userId: fx.learner.id } });

    const beforeDismiss = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${chapterCSlug}`)
      .set(learner());
    expect(beforeDismiss.body.data.content.promptCourseRating).toBe(true);

    const res = await request(app)
      .post(`/api/v1/courses/${fx.course.slug}/rating/dismiss`)
      .set(learner());
    expect(res.status).toBe(200);

    const overview = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/overview`)
      .set(learner());
    expect(overview.body.data.ratingDismissed).toBe(true);

    const afterDismiss = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${chapterCSlug}`)
      .set(learner());
    expect(afterDismiss.body.data.content.promptCourseRating).toBe(false);
  });

  it("rejects an unverified learner", async () => {
    const res = await request(app)
      .put(`/api/v1/courses/${fx.course.slug}/rating`)
      .set({ Authorization: `Bearer ${fx.unverifiedToken}` })
      .send({ rating: 4 });
    expect(res.status).toBe(403);
  });
});
