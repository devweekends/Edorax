import type { ChapterReportView, CourseActivityView, CourseReportView } from "../../shared/api/teach.js";
import { prisma } from "../../db/prisma.js";
import { readReleaseContent, variantForRelease } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { toCsv } from "../../utils/csv.js";
import type { SessionUser } from "../../types/auth.js";
import { requireCourseBySlug } from "./access.js";
import { loadCourseRatingReport } from "../courses/ratings.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";

// Course insights (docs/06-reports.mdx). Cohort numbers come from the
// denormalised Enrollment rollups; the chapter report reads BlockStats and
// ChapterProgress; activity reads the per-day DailyActivity rows.

const AT_RISK_DAYS = 7;
const ACTIVITY_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type LearnerRef = { user: { name: string | null; email: string | null } | null; learnerProfile: { email: string } | null };

const learnerLabel = (row: LearnerRef) => row.user?.name ?? row.user?.email ?? row.learnerProfile?.email ?? "Pending learner";
const learnerEmail = (row: LearnerRef) => row.user?.email ?? row.learnerProfile?.email ?? null;
const learnerInclude = { user: { select: { name: true, email: true } }, learnerProfile: { select: { email: true } } } as const;

export async function loadCourseReport(user: SessionUser, courseSlug: string, chapterId?: string): Promise<CourseReportView> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const now = Date.now();

  const [course, enrollments, chapterProgress, ratings] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id: owned.id },
      select: {
        activeReleaseId: true, familySlug: true, variantFamily: true,
        modules: {
          where: { archivedAt: null },
          orderBy: { order: "asc" },
          select: { id: true, title: true, chapters: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: { id: true, title: true } } },
        },
      },
    }),
    prisma.enrollment.findMany({
      where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE },
      orderBy: { createdAt: "asc" },
      include: learnerInclude,
    }),
    prisma.chapterProgress.findMany({
      where: { enrollment: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE } },
      select: { enrollmentId: true, timeSpentSeconds: true },
    }),
    loadCourseRatingReport(owned.id),
  ]);

  const studySeconds = new Map<string, number>();
  for (const row of chapterProgress) {
    studySeconds.set(row.enrollmentId, (studySeconds.get(row.enrollmentId) ?? 0) + row.timeSpentSeconds);
  }

  // At risk (v1): in progress but silent for 7+ days, or more than 3 chapters behind the cohort median.
  const sortedCompleted = enrollments.filter((e) => e.status !== "DROPPED").map((e) => e.chaptersCompleted).sort((a, b) => a - b);
  const medianCompleted = sortedCompleted.length > 0 ? (sortedCompleted[Math.floor(sortedCompleted.length / 2)] ?? 0) : 0;
  const isAtRisk = (e: (typeof enrollments)[number]) => {
    if (e.status !== "IN_PROGRESS") return false;
    const silent = e.lastActiveAt !== null && now - e.lastActiveAt.getTime() > AT_RISK_DAYS * DAY_MS;
    return silent || e.chaptersCompleted < medianCompleted - 3;
  };

  const enrolled = enrollments.length;
  const release = course.activeReleaseId ? await prisma.courseRelease.findUnique({ where: { id: course.activeReleaseId } }) : null;
  const releaseModules = release ? readReleaseContent(release.content).variants[
    variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), null)] : null;
  const modules = releaseModules?.map(module => ({ id: module.id, title: module.title,
    chapters: module.chapters.map(chapter => ({ id: chapter.id, title: chapter.title })) })) ?? course.modules;
  const chapterIds = new Set(modules.flatMap((module) => module.chapters.map((chapter) => chapter.id)));

  return {
    course: { id: owned.id, slug: owned.slug, title: owned.title },
    modules,
    summary: {
      enrolled,
      started: enrollments.filter((e) => e.startedAt !== null).length,
      completed: enrollments.filter((e) => e.status === "COMPLETED").length,
      averageCompletion: enrolled === 0 ? 0 : Math.round(enrollments.reduce((sum, e) => sum + e.percentComplete, 0) / enrolled),
    },
    atRiskDays: AT_RISK_DAYS,
    enrollments: enrollments.map((e) => ({
      id: e.id,
      name: e.user?.name ?? e.learnerProfile?.email ?? "Unnamed",
      email: learnerEmail(e),
      status: e.status,
      percentComplete: e.percentComplete,
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      pendingReviews: e.pendingReviews,
      lastActiveAt: e.lastActiveAt?.toISOString() ?? null,
      studySeconds: studySeconds.get(e.id) ?? 0,
      atRisk: isAtRisk(e),
    })),
    chapterReport: chapterId && chapterIds.has(chapterId) ? await loadChapterReport(owned.id, chapterId) : null,
    ratings,
  };
}

/** Per-block attempts and correct rates plus each learner's standing in one chapter. */
async function loadChapterReport(courseId: string, chapterId: string): Promise<ChapterReportView> {
  const [blocks, progressRows] = await Promise.all([
    prisma.block.findMany({
      where: { chapterId, archivedAt: null },
      orderBy: { order: "asc" },
      select: { id: true, type: true, stats: { select: { attempts: true, correctCount: true, pendingReviews: true } } },
    }),
    prisma.chapterProgress.findMany({
      where: { chapterId, enrollment: { courseId, ...CONFIRMED_ENROLLMENT_WHERE } },
      include: { enrollment: { select: learnerInclude } },
    }),
  ]);

  return {
    chapterId,
    blocks: blocks.map((block) => {
      const attempts = block.stats?.attempts ?? 0;
      const graded = block.type === "QUIZ" || block.type === "PREDICT" || block.type === "CODE";
      const correctRate = graded && attempts > 0 ? (block.stats?.correctCount ?? 0) / attempts : null;
      return {
        id: block.id,
        type: block.type,
        attempts,
        correctRate,
        pendingReviews: block.stats?.pendingReviews ?? 0,
        // Two or more attempts with under half correct marks a block worth rewriting.
        confusionFlag: correctRate !== null && attempts >= 2 && correctRate < 0.5,
      };
    }),
    progress: progressRows.map((row) => ({
      id: row.id,
      learnerLabel: learnerLabel(row.enrollment),
      blocksCompleted: row.blocksCompleted,
      blocksTotal: row.blocksTotal,
      score: row.score,
      maxScore: row.maxScore,
      status: row.status,
    })),
  };
}

/** The mentee table as CSV — Enrollment rollups only (docs/06-reports.mdx "Export"). */
export async function exportCourseReportCsv(user: SessionUser, courseSlug: string): Promise<{ filename: string; csv: string }> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE },
    orderBy: { createdAt: "asc" },
    include: learnerInclude,
  });

  const header = ["name", "email", "status", "percent_complete", "chapters_completed", "score", "max_score", "pending_reviews", "last_active_at", "started_at", "completed_at"];
  const rows = enrollments.map((e) => [
    e.user?.name ?? e.learnerProfile?.email ?? "",
    learnerEmail(e) ?? "",
    e.status,
    String(e.percentComplete),
    String(e.chaptersCompleted),
    String(e.totalScore),
    String(e.maxScore),
    String(e.pendingReviews),
    e.lastActiveAt?.toISOString() ?? "",
    e.startedAt?.toISOString() ?? "",
    e.completedAt?.toISOString() ?? "",
  ]);

  return { filename: `${owned.slug}-report.csv`, csv: toCsv([header, ...rows]) };
}

/** A 14-day grid of active study seconds per learner, in UTC days. */
export async function loadCourseActivity(user: SessionUser, courseSlug: string): Promise<CourseActivityView> {
  const owned = await requireCourseBySlug(user, courseSlug);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (ACTIVITY_WINDOW_DAYS - 1));
  since.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: ACTIVITY_WINDOW_DAYS }, (_, i) => new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10));
  const dayIndex = new Map(days.map((day, index) => [day, index]));

  const [enrollments, activityRows] = await Promise.all([
    prisma.enrollment.findMany({
      where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE },
      include: learnerInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.dailyActivity.findMany({
      where: { enrollment: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE }, date: { gte: since } },
      select: { enrollmentId: true, date: true, activeSeconds: true },
    }),
  ]);

  const grid = new Map(enrollments.map((e) => [e.id, new Array<number>(days.length).fill(0)]));
  for (const row of activityRows) {
    const index = dayIndex.get(row.date.toISOString().slice(0, 10));
    const cells = grid.get(row.enrollmentId);
    if (index === undefined || !cells) continue;
    cells[index] = (cells[index] ?? 0) + row.activeSeconds;
  }

  const rows = enrollments.map((e) => {
    const seconds = grid.get(e.id) ?? [];
    return { enrollmentId: e.id, label: learnerLabel(e), email: learnerEmail(e), seconds, totalSeconds: seconds.reduce((sum, n) => sum + n, 0) };
  });
  const totalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  const lastSeven = days.length - 7;

  return {
    course: { id: owned.id, slug: owned.slug, title: owned.title },
    days,
    rows,
    metrics: {
      learnerCount: enrollments.length,
      activeLearners: rows.filter((row) => row.seconds.slice(lastSeven).some((n) => n > 0)).length,
      totalSeconds,
      averageSeconds: enrollments.length > 0 ? Math.round(totalSeconds / enrollments.length) : 0,
      todaySeconds: rows.reduce((sum, row) => sum + (row.seconds[days.length - 1] ?? 0), 0),
    },
    hasActivity: activityRows.length > 0,
  };
}
