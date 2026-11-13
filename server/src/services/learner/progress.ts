import type { LearnerProgressCourse, LearnerProgressView } from "../../shared/api/learner.js";
import { prisma } from "../../db/prisma.js";
import { closedWrongCheckpoints } from "../progress/attention.js";
import { loadEnrollmentSyllabus, resolveContinueChapterPath } from "../progress/enrollment-syllabus.js";

/** Completion, scored accuracy and study consistency per course for the "My progress" page. */
export async function loadLearnerProgress(input: { userId: string; bypassLocking: boolean; year?: number }): Promise<LearnerProgressView> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: input.userId, status: { not: "DROPPED" } },
    orderBy: [{ lastActiveAt: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      courseId: true,
      percentComplete: true,
      chaptersCompleted: true,
      totalScore: true,
      maxScore: true,
      pendingReviews: true,
      lastActiveAt: true,
      course: { select: { id: true, slug: true, title: true } },
      chapterProgress: {
        select: { chapterId: true, status: true, score: true, maxScore: true, timeSpentSeconds: true },
      },
    },
  });

  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 89);
  since.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(since);
  weekStart.setUTCDate(weekStart.getUTCDate() + 83);

  const currentYear = new Date().getUTCFullYear();
  const year = input.year ?? currentYear;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));

  const [missedResponses, dailyRows, yearRows] = await Promise.all([
    enrollmentIds.length === 0
      ? []
      : prisma.response.findMany({
          where: {
            userId: input.userId,
            enrollmentId: { in: enrollmentIds },
            isCorrect: false,
            status: { not: "DRAFT" },
            block: { archivedAt: null, type: { in: ["QUIZ", "PREDICT", "CODE"] } },
          },
          orderBy: { attempt: "desc" },
          select: {
            blockId: true,
            attempt: true,
            isCorrect: true,
            block: {
              select: {
                type: true,
                config: true,
                chapter: { select: { slug: true, title: true, course: { select: { slug: true, title: true } } } },
              },
            },
          },
        }),
    enrollmentIds.length === 0
      ? []
      : prisma.dailyActivity.findMany({
          where: { enrollmentId: { in: enrollmentIds }, date: { gte: since } },
          select: { enrollmentId: true, date: true, activeSeconds: true },
        }),
    enrollmentIds.length === 0
      ? []
      : prisma.dailyActivity.groupBy({
          by: ["date"],
          where: { enrollmentId: { in: enrollmentIds }, date: { gte: yearStart, lte: yearEnd } },
          _sum: { activeSeconds: true },
        }),
  ]);

  const earliest = enrollmentIds.length
    ? await prisma.dailyActivity.findFirst({
        where: { enrollmentId: { in: enrollmentIds } },
        orderBy: { date: "asc" },
        select: { date: true },
      })
    : null;
  const earliestYear = earliest ? earliest.date.getUTCFullYear() : currentYear;
  const activityYears = Array.from({ length: Math.max(1, currentYear - earliestYear + 1) }, (_, i) => earliestYear + i);

  const yearByDate = new Map(yearRows.map((row) => [row.date.toISOString().slice(0, 10), row._sum.activeSeconds ?? 0]));
  const daysInYear = Math.round((Date.UTC(year + 1, 0, 1) - yearStart.getTime()) / 86_400_000);
  const yearActivity = Array.from({ length: daysInYear }, (_, index) => {
    const date = new Date(yearStart);
    date.setUTCDate(yearStart.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    return { day, seconds: yearByDate.get(day) ?? 0 };
  });

  const closedWrong = closedWrongCheckpoints(missedResponses)
    .slice(0, 12)
    .map((row) => ({
      blockId: row.blockId,
      type: row.block.type,
      chapter: { slug: row.block.chapter.slug, title: row.block.chapter.title },
      course: row.block.chapter.course,
    }));

  const courses: LearnerProgressCourse[] = await Promise.all(
    enrollments.map(async (enrollment) => {
      const syllabus = await loadEnrollmentSyllabus({
        courseId: enrollment.courseId,
        enrollmentId: enrollment.id,
        bypassLocking: input.bypassLocking,
      });
      const progressByChapter = new Map(enrollment.chapterProgress.map((row) => [row.chapterId, row]));
      const modules = (syllabus?.modules ?? []).map((module) => {
        const rows = module.chapters.map((chapter) => progressByChapter.get(chapter.id));
        return {
          id: module.id,
          order: module.order,
          title: module.title,
          completed: rows.filter((row) => row?.status === "COMPLETED").length,
          total: module.chapters.length,
          score: rows.reduce((sum, row) => sum + (row?.score ?? 0), 0),
          maxScore: rows.reduce((sum, row) => sum + (row?.maxScore ?? 0), 0),
        };
      });
      const activity = dailyRows.filter((row) => row.enrollmentId === enrollment.id);
      const activityByDate = new Map(activity.map((row) => [row.date.toISOString().slice(0, 10), row.activeSeconds]));

      return {
        course: enrollment.course,
        percentComplete: enrollment.percentComplete,
        chaptersCompleted: enrollment.chaptersCompleted,
        totalChapters: modules.reduce((sum, module) => sum + module.total, 0),
        totalScore: enrollment.totalScore,
        maxScore: enrollment.maxScore,
        pendingReviews: enrollment.pendingReviews,
        lastActiveAt: enrollment.lastActiveAt?.toISOString() ?? null,
        activeDays: new Set(activity.filter((row) => row.activeSeconds > 0 && row.date >= weekStart).map((row) => row.date.toISOString().slice(0, 10))).size,
        weekSeconds: activity.filter((row) => row.date >= weekStart).reduce((sum, row) => sum + row.activeSeconds, 0),
        dailyActivity: Array.from({ length: 90 }, (_, index) => {
          const date = new Date(since);
          date.setUTCDate(since.getUTCDate() + index);
          const day = date.toISOString().slice(0, 10);
          return { day, seconds: activityByDate.get(day) ?? 0 };
        }),
        totalStudySeconds: enrollment.chapterProgress.reduce((sum, row) => sum + row.timeSpentSeconds, 0),
        continueHref: syllabus ? resolveContinueChapterPath(enrollment.course.slug, syllabus.flatChapters) : null,
        modules,
      };
    })
  );

  const overall = courses.reduce(
    (summary, course) => ({
      chaptersCompleted: summary.chaptersCompleted + course.chaptersCompleted,
      totalChapters: summary.totalChapters + course.totalChapters,
      score: summary.score + course.totalScore,
      maxScore: summary.maxScore + course.maxScore,
      weekSeconds: summary.weekSeconds + course.weekSeconds,
      pendingReviews: summary.pendingReviews + course.pendingReviews,
    }),
    { chaptersCompleted: 0, totalChapters: 0, score: 0, maxScore: 0, weekSeconds: 0, pendingReviews: 0 }
  );

  return { courses, closedWrong, overall: { ...overall, year, activityYears, yearActivity } };
}
