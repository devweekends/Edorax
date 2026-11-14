import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";
import { saveChapterDraft, publishChapter } from "../../src/services/teach/chapters.js";
import { releaseForEnrollment } from "../../src/services/courses/releases.js";
import { loadChapterReader } from "../../src/services/chapters/reader.js";
import { loadCourseDraftPreview, restoreCourseToDraft, unpublishCourse } from "../../src/services/teach/courses.js";
import { ensureBaselineRelease } from "../../src/services/courses/releases.js";
import { ensureChapterStarted, lockEnrollmentVariant } from "../../src/services/progress/compute.js";

let fx: Awaited<ReturnType<typeof createCourseFixture>>;
beforeAll(async () => { fx = await createCourseFixture(); });
afterAll(async () => { await fx.cleanup(); });

describe("dashboard chapter publishing", () => {
  it("pins a first chapter start before a concurrent release switch", async () => {
    const concurrent = await createCourseFixture();
    let resume!: () => void;
    let signal!: () => void;
    const waiting = new Promise<void>(resolve => { resume = resolve; });
    const locked = new Promise<void>(resolve => { signal = resolve; });
    try {
      await prisma.enrollment.update({ where: { id: concurrent.enrollment.id }, data: { startedAt: null } });
      const firstStart = prisma.$transaction(async tx => {
        await lockEnrollmentVariant(tx, concurrent.enrollment.id);
        signal();
        await waiting;
        await ensureChapterStarted(tx, concurrent.enrollment.id, concurrent.chapterA.id);
      }, { timeout: 10000 });
      await locked;
      const published = prisma.$transaction(tx => ensureBaselineRelease(tx, concurrent.course.id), { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 100));
      resume();
      await Promise.all([firstStart, published]);
      const course = await prisma.course.findUniqueOrThrow({ where: { id: concurrent.course.id } });
      const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: concurrent.enrollment.id } });
      expect(enrollment.releaseId).toBe(course.activeReleaseId);
      expect(await prisma.chapterProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(1);
    } finally {
      resume();
      await concurrent.cleanup();
    }
  });

  it("keeps archived courses with learners on the immutable release path", async () => {
    const archived = await createCourseFixture();
    try {
      await unpublishCourse(archived.mentor, archived.course.id, { confirmedWithEnrollments: true });
      await expect(restoreCourseToDraft(archived.mentor, archived.course.id)).rejects.toThrow("has learners");
      await saveChapterDraft(archived.mentor, archived.chapterA.id, "## Archived update\n\nFor future learners.");
      expect((await prisma.chapter.findUniqueOrThrow({ where: { id: archived.chapterA.id } })).source).toBe("# A");
      await publishChapter(archived.mentor, archived.chapterA.id);
      const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: archived.enrollment.id } });
      const pinned = await releaseForEnrollment(archived.course.id, enrollment, null);
      const latest = await releaseForEnrollment(archived.course.id, { releaseId: null, variantSlug: null }, null);
      expect(pinned?.modules[0].chapters[0].id).toBe(archived.chapterA.id);
      expect(latest?.modules[0].chapters[0].id).not.toBe(archived.chapterA.id);
    } finally {
      await archived.cleanup();
    }
  });

  it("saves a private draft, then publishes a new release that an in-progress learner gets on the next open", async () => {
    await saveChapterDraft(fx.mentor, fx.chapterA.id, "## Revised chapter\n\nA new example for future learners.");
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: fx.chapterA.id } })).source).toBe("# A");
    expect(await prisma.courseChapterDraft.findUnique({ where: { chapterId: fx.chapterA.id } })).not.toBeNull();
    const draftPreview = await loadCourseDraftPreview(fx.mentor, fx.course.slug);
    expect(draftPreview.modules.flatMap(module => module.chapters).filter(chapter => chapter.id === fx.chapterA.id))
      .toEqual([expect.objectContaining({ hasDraft: true, source: "## Revised chapter\n\nA new example for future learners." })]);
    await publishChapter(fx.mentor, fx.chapterA.id);
    const oldEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: fx.enrollment.id } });
    const oldRelease = await releaseForEnrollment(fx.course.id, oldEnrollment, null);
    expect(oldRelease?.modules[0].chapters[0].id).toBe(fx.chapterA.id);
    const latest = await releaseForEnrollment(fx.course.id, { releaseId: null, variantSlug: null }, null);
    expect(latest?.modules[0].chapters[0].id).not.toBe(fx.chapterA.id);
    // The old chapter row is untouched; the learner moves to the new release when they open the chapter.
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: fx.chapterA.id } })).source).toBe("# A");
    expect((await loadChapterReader(fx.course.slug, "chapter-a", fx.learner)).content?.source).toContain("## Revised chapter");
    expect(await prisma.courseChapterDraft.findUnique({ where: { chapterId: fx.chapterA.id } })).toBeNull();
    const latestPreview = await loadCourseDraftPreview(fx.mentor, fx.course.slug);
    expect(latestPreview.modules.flatMap(module => module.chapters).filter(chapter => chapter.title === "Chapter A"))
      .toEqual([expect.objectContaining({ hasDraft: false, source: "## Revised chapter\n\nA new example for future learners." })]);
  });
});
