import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";
import { ensureBaselineRelease, upgradeEnrollmentToRelease, type ReleaseContent } from "../../src/services/courses/releases.js";
import { getCourseOverview } from "../../src/services/courses/overview.js";
import { loadChapterReader } from "../../src/services/chapters/reader.js";
import { publishDashboardNewChapterRelease } from "../../src/services/teach/publish-course-release.js";
import { recomputeEnrollmentRollup } from "../../src/services/progress/compute.js";

const app = createApp();

describe("course release auto-upgrade and alumni notification", () => {
  let fx: Awaited<ReturnType<typeof createCourseFixture>>;
  let baselineReleaseId: string;

  beforeAll(async () => {
    fx = await createCourseFixture();
    const baseline = await prisma.$transaction((tx) => ensureBaselineRelease(tx, fx.course.id));
    baselineReleaseId = baseline.id;
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it("automatically upgrades in-progress learners on overview open", async () => {
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // 2. Add and publish a new chapter to create release #2
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
    const newChapter = await prisma.chapter.create({
      data: {
        id: `ch-v2-${Date.now()}`,
        courseId: fx.course.id,
        moduleId: moduleRow.id,
        slug: `new-chapter-${Date.now()}`,
        title: "Brand New Chapter in V2",
        order: 99,
        publishedAt: new Date(),
        readerMode: "DEFAULT",
        source: "# Brand New Chapter",
      },
    });

    await prisma.$transaction((tx) =>
      publishDashboardNewChapterRelease(tx, fx.course.id, newChapter.id)
    );

    const updatedCourse = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    expect(updatedCourse.activeReleaseId).not.toBe(baselineReleaseId);

    // 3. Intentionally pin enrollment back to old baseline release to test lazy upgrade
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // 4. Fetch overview as the learner
    const overview = await getCourseOverview(fx.course.slug, fx.learner);

    // 5. Verify learner was automatically shifted to active release and sees all chapters
    expect(overview.curriculumUpgradeAvailable).toBe(false);
    expect(overview.syllabus?.chapterCount).toBeGreaterThanOrEqual(3);

    const refreshedEnrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { id: fx.enrollment.id },
    });
    expect(refreshedEnrollment.releaseId).toBe(updatedCourse.activeReleaseId);
  });

  it("upgrades in-progress learners when they open a chapter that is also in their old release", async () => {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    expect(course.activeReleaseId).not.toBe(baselineReleaseId);
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // chapterA exists in both releases, so only the release check can trigger the upgrade.
    await loadChapterReader(fx.course.slug, fx.chapterA.slug, fx.learner);

    const refreshed = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(refreshed.releaseId).toBe(course.activeReleaseId);
  });

  it("keeps completed learners on their release when they open a chapter", async () => {
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "COMPLETED", percentComplete: 100 },
    });

    await loadChapterReader(fx.course.slug, fx.chapterA.slug, fx.learner);

    const refreshed = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(refreshed.releaseId).toBe(baselineReleaseId);
  });

  it("protects completed learners from auto-downgrade and shows upgrade banner", async () => {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });

    // Completed learner is pinned to older baseline
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "COMPLETED", percentComplete: 100 },
    });

    // Ensure course activeReleaseId is newer
    expect(course.activeReleaseId).not.toBe(baselineReleaseId);

    // Fetch overview as completed learner
    const overview = await getCourseOverview(fx.course.slug, fx.learner);

    // Completed status is protected; curriculumUpgradeAvailable flag is true
    expect(overview.curriculumUpgradeAvailable).toBe(true);
    const enrollmentInDb = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(enrollmentInDb.releaseId).toBe(baselineReleaseId);
    expect(enrollmentInDb.status).toBe("COMPLETED");
  });

  it("allows completed learners to explicitly upgrade curriculum via API", async () => {
    const course = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });

    const res = await request(app)
      .post(`/api/v1/courses/${fx.course.slug}/upgrade-curriculum`)
      .set({ Authorization: `Bearer ${fx.learnerToken}` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.releaseId).toBe(course.activeReleaseId);

    const enrollmentInDb = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(enrollmentInDb.releaseId).toBe(course.activeReleaseId);

    // Overview should now show upgrade is no longer needed
    const overview = await getCourseOverview(fx.course.slug, fx.learner);
    expect(overview.curriculumUpgradeAvailable).toBe(false);
  });

  it("notifies completed learners when a new release is published", async () => {
    // 1. Mark learner as COMPLETED on current release
    const currentCourse = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: currentCourse.activeReleaseId, status: "COMPLETED", percentComplete: 100 },
    });

    // 2. Publish another chapter
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
    const alumniChapter = await prisma.chapter.create({
      data: {
        id: `ch-alumni-${Date.now()}`,
        courseId: fx.course.id,
        moduleId: moduleRow.id,
        slug: `alumni-chapter-${Date.now()}`,
        title: "Alumni Update Chapter",
        order: 101,
        publishedAt: new Date(),
        readerMode: "DEFAULT",
        source: "# Alumni Chapter",
      },
    });

    await prisma.$transaction((tx) =>
      publishDashboardNewChapterRelease(tx, fx.course.id, alumniChapter.id)
    );

    // 3. Verify notification was created for the completed learner
    const notification = await prisma.notification.findFirst({
      where: {
        userId: fx.learner.id,
        type: "course.curriculum_updated",
        courseId: fx.course.id,
      },
    });

    expect(notification).not.toBeNull();
    expect(notification?.title).toBe("New Chapters Available!");
  });

  it("preserves completed chapters and question responses when upgrading release", async () => {
    // 1. Mark chapterA as completed and submit a quiz response
    await prisma.chapterProgress.upsert({
      where: { enrollmentId_chapterId: { enrollmentId: fx.enrollment.id, chapterId: fx.chapterA.id } },
      create: {
        enrollmentId: fx.enrollment.id,
        chapterId: fx.chapterA.id,
        status: "COMPLETED",
        blocksCompleted: 2,
        blocksTotal: 2,
        score: 10,
        maxScore: 10,
      },
      update: {
        status: "COMPLETED",
        blocksCompleted: 2,
        blocksTotal: 2,
        score: 10,
        maxScore: 10,
      },
    });

    const response = await prisma.response.create({
      data: {
        blockId: fx.quizBlock.id,
        userId: fx.learner.id,
        enrollmentId: fx.enrollment.id,
        attempt: 1,
        status: "SUBMITTED",
        payload: { selected: "1" },
        isCorrect: true,
        score: 10,
        maxScore: 10,
      },
    });

    // Pin enrollment to baseline and compute rollup
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });
    await prisma.$transaction((tx) => recomputeEnrollmentRollup(tx, fx.enrollment.id, { preserveActivity: true }));

    const initialEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(initialEnrollment.chaptersCompleted).toBe(1);

    // 2. Publish an updated release with a new chapter
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: fx.course.id } });
    const extraChapter = await prisma.chapter.create({
      data: {
        id: `ch-extra-${Date.now()}`,
        courseId: fx.course.id,
        moduleId: moduleRow.id,
        slug: `extra-chapter-${Date.now()}`,
        title: "Extra Chapter",
        order: 102,
        publishedAt: new Date(),
        readerMode: "DEFAULT",
        source: "# Extra Chapter",
      },
    });

    await prisma.$transaction((tx) =>
      publishDashboardNewChapterRelease(tx, fx.course.id, extraChapter.id)
    );

    const updatedCourse = await prisma.course.findUniqueOrThrow({ where: { id: fx.course.id } });
    expect(updatedCourse.activeReleaseId).not.toBe(baselineReleaseId);

    // Ensure enrollment is still on older release prior to opening
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: baselineReleaseId, status: "IN_PROGRESS" },
    });

    // 3. Learner opens course overview -> triggers auto-upgrade
    const overview = await getCourseOverview(fx.course.slug, fx.learner);

    // 4. Verify completed chapters were NOT wiped out
    expect(overview.enrollment?.chaptersCompleted).toBe(1);
    expect(overview.enrollment?.percentComplete).toBeGreaterThan(0);

    const refreshedEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(refreshedEnrollment.releaseId).toBe(updatedCourse.activeReleaseId);
    expect(refreshedEnrollment.chaptersCompleted).toBe(1);
    expect(refreshedEnrollment.percentComplete).toBeGreaterThan(0);

    // 5. Verify response is still attached to enrollment
    const remappedResponse = await prisma.response.findUniqueOrThrow({ where: { id: response.id } });
    expect(remappedResponse.enrollmentId).toBe(fx.enrollment.id);
  });

  it("copies only equivalent answers into a replaced chapter and keeps the originals", async () => {
    const baseline = await prisma.courseRelease.findUniqueOrThrow({ where: { id: baselineReleaseId } });
    const content = structuredClone(baseline.content as unknown as ReleaseContent);
    const old = content.variants.default[0].chapters.find((chapter) => chapter.id === fx.chapterA.id)!;
    const replacement = await prisma.chapter.create({ data: {
      courseId: fx.course.id, moduleId: fx.chapterA.moduleId,
      slug: `${old.slug}--replacement-${Date.now()}`, title: old.title,
      order: 1000, source: "# Revised A", publishedAt: new Date(),
    } });
    const matchingBlock = await prisma.block.create({ data: {
      id: `blk-matching-${fx.tag}`, chapterId: replacement.id, type: "QUIZ", order: fx.quizBlock.order,
      config: fx.quizBlock.config as object,
    } });
    const changedBlock = await prisma.block.create({ data: {
      id: `blk-changed-${fx.tag}`, chapterId: replacement.id, type: "MUST_READ", order: fx.mustReadBlock.order,
      config: { title: "Different required reading", url: "https://example.com/new" },
    } });
    const quizAnswer = await prisma.response.create({ data: {
      blockId: fx.quizBlock.id, userId: fx.learner.id, enrollmentId: fx.enrollment.id,
      attempt: 3, status: "SUBMITTED", payload: { selected: "a" }, isCorrect: true,
    } });
    const readingAnswer = await prisma.response.create({ data: {
      blockId: fx.mustReadBlock.id, userId: fx.learner.id, enrollmentId: fx.enrollment.id,
      attempt: 3, status: "SUBMITTED", payload: { confirmed: true },
    } });
    await prisma.chapterProgress.upsert({
      where: { enrollmentId_chapterId: { enrollmentId: fx.enrollment.id, chapterId: fx.chapterA.id } },
      create: { enrollmentId: fx.enrollment.id, chapterId: fx.chapterA.id, status: "COMPLETED" },
      update: { status: "COMPLETED" },
    });
    content.variants.default[0].chapters = content.variants.default[0].chapters.map((chapter) =>
      chapter.id === old.id ? { ...chapter, id: replacement.id } : chapter
    );
    const latestNumber = await prisma.courseRelease.aggregate({ where: { courseId: fx.course.id }, _max: { number: true } });
    const release = await prisma.courseRelease.create({ data: {
      courseId: fx.course.id, number: (latestNumber._max.number ?? 0) + 1,
      content: content as unknown as object,
    } });
    await prisma.course.update({ where: { id: fx.course.id }, data: { activeReleaseId: release.id } });
    await prisma.enrollment.update({ where: { id: fx.enrollment.id }, data: {
      releaseId: baselineReleaseId, status: "IN_PROGRESS",
    } });

    await getCourseOverview(fx.course.slug, fx.learner);

    expect((await prisma.chapterProgress.findUnique({ where: { enrollmentId_chapterId: {
      enrollmentId: fx.enrollment.id, chapterId: replacement.id,
    } } }))?.status).toBe("COMPLETED");
    expect((await prisma.response.findUniqueOrThrow({ where: { id: quizAnswer.id } })).blockId).toBe(fx.quizBlock.id);
    expect((await prisma.response.findUniqueOrThrow({ where: { id: readingAnswer.id } })).blockId).toBe(fx.mustReadBlock.id);
    expect(await prisma.response.count({ where: { blockId: matchingBlock.id, attempt: 3 } })).toBe(1);
    expect(await prisma.response.count({ where: { blockId: changedBlock.id } })).toBe(0);

    // Repairing an already upgraded enrollment must not duplicate submissions.
    await prisma.$transaction((tx) => upgradeEnrollmentToRelease(tx, fx.enrollment.id, release.id, { repair: true }));
    expect(await prisma.response.count({ where: { blockId: matchingBlock.id, attempt: 3 } })).toBe(1);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } })).chaptersCompleted).toBeGreaterThan(0);
  });

  it("keeps the current release when a completed chapter is removed", async () => {
    const current = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: current.releaseId! } });
    const content = structuredClone(release.content as unknown as ReleaseContent);
    const completed = await prisma.chapterProgress.findMany({ where: {
      enrollmentId: fx.enrollment.id, status: "COMPLETED",
    } });
    const completedIds = new Set(completed.map((progress) => progress.chapterId));
    content.variants.default = content.variants.default.map((module) => ({
      ...module, chapters: module.chapters.filter((chapter) => !completedIds.has(chapter.id)),
    }));
    const number = await prisma.courseRelease.aggregate({ where: { courseId: fx.course.id }, _max: { number: true } });
    const target = await prisma.courseRelease.create({ data: {
      courseId: fx.course.id, number: (number._max.number ?? 0) + 1,
      content: content as unknown as object,
    } });
    const upgraded = await prisma.$transaction((tx) => upgradeEnrollmentToRelease(tx, fx.enrollment.id, target.id));
    expect(upgraded).toBe(false);
    const after = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    expect(after.releaseId).toBe(current.releaseId);
    expect(after.chaptersCompleted).toBe(current.chaptersCompleted);
  });
});
