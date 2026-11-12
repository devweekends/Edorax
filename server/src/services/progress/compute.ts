import type { Prisma } from "../../generated/prisma/index.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { readReleaseContent, variantForRelease } from "../courses/releases.js";
import { assertEnrollmentChapter } from "../courses/releases.js";
import {
  addedAfterCompletion,
  chapterProgressStatus,
  checkpointSatisfied,
  isCompletableBlock,
} from "./rules.js";
import { milestoneReflectionBlocked } from "./reflection.js";
import { notifyCourseCompleted } from "../notifications/events.js";
import { awardChapterCompletionXp, awardXp } from "../gamification/xp.js";
import { xpKeys } from "../../shared/gamification/xp.js";
import { gamificationFeatures } from "../gamification/flags.js";
import { COURSE_COMPLETED_CREDITS, creditKeys, earnCredits } from "../gamification/credits.js";
import { calculateQuizAssessment } from "./quiz-assessment.js";

// Recomputes denormalized rollups after a new Response is written — see
// docs/04-progress-and-gating.mdx and the append-only-Response invariant in
// docs/04-progress-and-gating.mdx: never mutate a Response to "fix"
// progress, always write a new attempt and recompute from scratch here, in
// the same transaction as the write.
//
// This is intentionally the *only* place that aggregates over Response rows —
// reports read ChapterProgress/Enrollment afterwards, never Response directly
// (docs/06-reports.mdx).
export async function recomputeChapterProgress(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  chapterId: string,
  options?: { preserveActivity?: boolean }
) {
  const blocks = await tx.block.findMany({
    where: { chapterId, archivedAt: null },
    select: { id: true, type: true, required: true, points: true, archivedAt: true, config: true, createdAt: true },
  });

  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: { userId: true, courseId: true },
  });

  const [existing, chapter] = await Promise.all([
    tx.chapterProgress.findUnique({
      where: { enrollmentId_chapterId: { enrollmentId, chapterId } },
      select: { status: true, startedAt: true, completedAt: true, learningLog: true },
    }),
    tx.chapter.findUnique({
      where: { id: chapterId },
      select: { isMilestone: true, source: true, compiled: true, readerMode: true, quizPassingScore: true },
    }),
  ]);

  let blocksCompleted = 0;
  let score = 0;
  let maxScore = 0;
  let blocksTotal = 0;

  const learnerUserId = enrollment.userId;
  const latestByBlock = new Map<string, Awaited<ReturnType<typeof tx.response.findFirst>>>();
  for (const block of blocks) {
    if (!isCompletableBlock(block)) continue;
    const latest = learnerUserId
      ? await tx.response.findFirst({
          where: { blockId: block.id, userId: learnerUserId },
          orderBy: { attempt: "desc" },
        })
      : null;
    latestByBlock.set(block.id, latest);
    const satisfied = checkpointSatisfied({
      type: block.type,
      config: block.config,
      status: latest?.status ?? null,
      isCorrect: latest?.isCorrect ?? null,
    });
    // A required block added after this learner finished the chapter does not
    // reopen it. Once they do it, it counts like any other block.
    if (!satisfied && addedAfterCompletion(block.createdAt, existing)) continue;
    blocksTotal += 1;
    if (!satisfied) continue;
    blocksCompleted += 1;
    if (latest?.score != null) score += latest.score;
    if (latest?.maxScore != null) maxScore += latest.maxScore;
  }

  if (chapter?.readerMode === "QUIZ") {
    const assessmentBlocks = blocks.filter(isCompletableBlock);
    const assessment = calculateQuizAssessment({
      blocks: assessmentBlocks,
      responses: assessmentBlocks.flatMap((block) => {
        const response = latestByBlock.get(block.id);
        return response ? [{ blockId: block.id, status: response.status, score: response.score, maxScore: response.maxScore }] : [];
      }),
      passingScore: chapter.quizPassingScore,
    });
    if (assessment) {
      score = assessment.score;
      maxScore = assessment.maxScore;
      const scoredIds = new Set(assessmentBlocks.filter((block) =>
        ["QUIZ", "PREDICT", "CODE"].includes(block.type) ||
        (block.type === "OPEN_QUESTION" && (block.config as { autoGrade?: unknown } | null)?.autoGrade === "llm")
      ).map((block) => block.id));
      const nonScoredCompleted = assessmentBlocks.filter((block) =>
        !scoredIds.has(block.id) && checkpointSatisfied({
          type: block.type,
          config: block.config,
          status: latestByBlock.get(block.id)?.status ?? null,
          isCorrect: latestByBlock.get(block.id)?.isCorrect ?? null,
        })
      ).length;
      blocksCompleted = nonScoredCompleted + (assessment.passed ? scoredIds.size : 0);
    }
  }

  const reflectionBlocked = Boolean(
    chapter?.isMilestone && milestoneReflectionBlocked(chapter.compiled || chapter.source, existing?.learningLog)
  );
  // Checkpoints make the chapter eligible for completion; only the learner's
  // explicit "Mark chapter complete" action finishes it. Preserve that action
  // across later response recomputations while all required work remains met.
  const markedComplete = existing?.status === "COMPLETED";
  const visited = Boolean(existing?.startedAt) || blocksCompleted > 0;
  const status = chapterProgressStatus({
    completableTotal: blocksTotal,
    completableCompleted: blocksCompleted,
    markedComplete,
    visited,
    reflectionBlocked,
  });

  const completedAt =
    status === "COMPLETED" ? (existing?.completedAt ?? new Date()) : null;

  await tx.chapterProgress.upsert({
    where: { enrollmentId_chapterId: { enrollmentId, chapterId } },
    create: {
      enrollmentId,
      chapterId,
      status,
      blocksCompleted,
      blocksTotal,
      score,
      maxScore,
      startedAt: new Date(),
      completedAt,
    },
    update: {
      status,
      blocksCompleted,
      blocksTotal,
      score,
      maxScore,
      completedAt,
    },
  });

  // XP on the transition to complete, in this transaction; its key makes a later recompute a no-op.
  if (status === "COMPLETED" && existing?.status !== "COMPLETED" && learnerUserId) {
    await awardChapterCompletionXp(tx, {
      userId: learnerUserId,
      enrollmentId,
      courseId: enrollment.courseId,
      chapterId,
      readerMode: chapter?.readerMode ?? null,
      completableBlocks: blocksTotal,
    });
  }

  await recomputeEnrollmentRollup(tx, enrollmentId, options);
}

/** Recompute every chapter for one enrollment (mentor repair / demo tooling). */
export async function repairEnrollmentProgress(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  courseId: string
) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { course: { select: { familySlug: true, variantFamily: true, activeReleaseId: true } } } });
  const releaseId = enrollment.releaseId ?? enrollment.course.activeReleaseId;
  const release = releaseId ? await tx.courseRelease.findUnique({ where: { id: releaseId } }) : null;
  const releaseIds = release ? (readReleaseContent(release.content).variants[variantForRelease(resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily), enrollment.variantSlug)]
    ?? readReleaseContent(release.content).variants.default)
    ?.flatMap(module => module.chapters.map(chapter => chapter.id)) ?? [] : null;
  const chapters = await tx.chapter.findMany({
    where: releaseIds ? { id: { in: releaseIds } } : { courseId, archivedAt: null },
    select: { id: true },
    orderBy: { order: "asc" },
  });
  for (const chapter of chapters) {
    await recomputeChapterProgress(tx, enrollmentId, chapter.id);
  }
}

export async function recomputeEnrollmentRollup(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  options?: { preserveActivity?: boolean }
) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { course: { select: { familySlug: true, variantFamily: true, activeReleaseId: true } } } });
  const releaseId = enrollment.releaseId ?? enrollment.course.activeReleaseId;
  const release = releaseId ? await tx.courseRelease.findUnique({ where: { id: releaseId } }) : null;
  const modules = release ? readReleaseContent(release.content).variants[variantForRelease(resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily), enrollment.variantSlug)]
    ?? readReleaseContent(release.content).variants.default ?? [] : null;
  const chapterIds = modules?.flatMap(module => module.chapters.map(chapter => chapter.id));
  const chapterProgress = await tx.chapterProgress.findMany({ where: { enrollmentId,
    ...(chapterIds ? { chapterId: { in: chapterIds } } : { chapter: { archivedAt: null } }) } });
  const chaptersCompleted = chapterProgress.filter((p) => p.status === "COMPLETED").length;
  const totalScore = chapterProgress.reduce((sum, p) => sum + p.score, 0);
  const maxScore = chapterProgress.reduce((sum, p) => sum + p.maxScore, 0);

  const totalChapters = chapterIds ? chapterIds.length : await tx.chapter.count({ where: { courseId: enrollment.courseId, archivedAt: null } });
  const allChaptersComplete = totalChapters > 0 && chaptersCompleted >= totalChapters;
  const roundedPercent = totalChapters > 0 ? Math.round((chaptersCompleted / totalChapters) * 100) : 0;
  const percentComplete = allChaptersComplete ? 100 : Math.min(99, roundedPercent);

  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: {
      chaptersCompleted,
      totalScore,
      maxScore,
      percentComplete,
      ...(options?.preserveActivity ? {} : { lastActiveAt: new Date(), startedAt: enrollment.startedAt ?? new Date() }),
      status: options?.preserveActivity && enrollment.status === "DROPPED" ? "DROPPED" : allChaptersComplete ? "COMPLETED" : "IN_PROGRESS",
      completedAt: allChaptersComplete ? (enrollment.completedAt ?? new Date()) : null,
    },
  });

  // Written in this transaction so it commits with the completion; once per enrollment (dedupe).
  if (percentComplete >= 100 && enrollment.status !== "COMPLETED") {
    await notifyCourseCompleted(tx, enrollmentId);
    if (enrollment.userId) {
      await awardXp(tx, {
        userId: enrollment.userId,
        enrollmentId,
        courseId: enrollment.courseId,
        source: "course_completed",
        sourceKey: xpKeys.course(enrollment.courseId),
      });
      if (gamificationFeatures().credits) {
        await earnCredits(tx, enrollment.userId, creditKeys.courseCompleted(enrollment.courseId), COURSE_COMPLETED_CREDITS);
      }
    }
  }
}

export async function ensureChapterStarted(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  chapterId: string
) {
  await lockEnrollmentVariant(tx, enrollmentId);
  await assertEnrollmentChapter(tx, enrollmentId, chapterId);
  const existing = await tx.chapterProgress.findUnique({
    where: { enrollmentId_chapterId: { enrollmentId, chapterId } },
    select: { status: true },
  });
  if (existing?.status === "COMPLETED") return;

  const blocks = await tx.block.findMany({
    where: { chapterId, archivedAt: null },
    select: { type: true, required: true, archivedAt: true },
  });
  const blocksTotal = blocks.filter((block) => isCompletableBlock(block)).length;

  await tx.chapterProgress.upsert({
    where: { enrollmentId_chapterId: { enrollmentId, chapterId } },
    create: {
      enrollmentId,
      chapterId,
      status: "IN_PROGRESS",
      blocksTotal,
      startedAt: new Date(),
    },
    update: {
      ...(existing?.status === "NOT_STARTED" || !existing
        ? { status: "IN_PROGRESS", startedAt: new Date() }
        : {}),
      blocksTotal,
    },
  });
}

/** A learner's first chapter activity fixes the variant used by their course. */
export async function lockEnrollmentVariant(tx: Prisma.TransactionClient, enrollmentId: string) {
  const owner = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, select: { courseId: true } });
  // Publishing switches the same Course row. This lock makes a first chapter start
  // happen entirely before or after that switch, so progress is pinned correctly.
  await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${owner.courseId} FOR SHARE`;
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: { variantLockedAt: true, releaseId: true, course: { select: { familySlug: true, variantFamily: true, activeReleaseId: true } } },
  });
  if (!enrollment.releaseId && enrollment.course.activeReleaseId) {
    await tx.enrollment.updateMany({ where: { id: enrollmentId, releaseId: null }, data: { releaseId: enrollment.course.activeReleaseId } });
  }
  const family = resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily);
  if (!family || enrollment.variantLockedAt) return;
  await tx.enrollment.updateMany({
    where: { id: enrollmentId, variantSlug: null, variantLockedAt: null },
    data: { variantSlug: family.defaultVariantSlug, variantChosenAt: new Date() },
  });
  await tx.enrollment.updateMany({
    where: { id: enrollmentId, variantLockedAt: null },
    data: { variantLockedAt: new Date() },
  });
}

/**
 * Maintains the denormalized per-block rollup in the same transaction as a new
 * Response write, so chapter reports can read BlockStats instead of
 * aggregating Response on the read path (docs/06-reports.mdx).
 */
export async function recordBlockStats(
  tx: Prisma.TransactionClient,
  response: { blockId: string; status: string; isCorrect: boolean | null }
) {
  const delta = {
    attempts: 1,
    correctCount: response.isCorrect === true ? 1 : 0,
    pendingReviews: response.status === "PENDING_REVIEW" ? 1 : 0,
  };
  await tx.blockStats.upsert({
    where: { blockId: response.blockId },
    create: {
      blockId: response.blockId,
      attempts: delta.attempts,
      correctCount: delta.correctCount,
      pendingReviews: delta.pendingReviews,
      lastSubmittedAt: new Date(),
    },
    update: {
      attempts: { increment: delta.attempts },
      correctCount: { increment: delta.correctCount },
      pendingReviews: { increment: delta.pendingReviews },
      lastSubmittedAt: new Date(),
    },
  });
}

/** Called when a PENDING_REVIEW response is reviewed (approved or sent back). */
export async function resolvePendingBlockReview(
  tx: Prisma.TransactionClient,
  blockId: string
) {
  await tx.blockStats.updateMany({
    where: { blockId, pendingReviews: { gt: 0 } },
    data: { pendingReviews: { decrement: 1 } },
  });
}

/**
 * Maintains Enrollment.pendingReviews (read by reports) — +1 when a submission
 * enters PENDING_REVIEW, -1 when a mentor resolves it. Clamped at zero so a
 * double-resolution can never push the rollup negative.
 */
export async function adjustEnrollmentPendingReviews(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  delta: 1 | -1
) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: { pendingReviews: true },
  });
  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: { pendingReviews: Math.max(0, enrollment.pendingReviews + delta) },
  });
}
