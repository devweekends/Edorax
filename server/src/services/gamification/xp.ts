import type { ChapterReaderMode, Prisma } from "../../generated/prisma/index.js";
import { XP_AMOUNTS, XP_DAILY_CAPS, quizPassedXp, xpKeys, type XpSource } from "../../shared/gamification/xp.js";
import { dateToDayKey, dayKeyToDate, localDayKey, safeTimeZone, weekStartKey } from "../../shared/lib/local-date.js";
import { latestQuizAttempt } from "../engagement/quiz-facts.js";
import { gamificationFeatures } from "./flags.js";
import { joinLeaderboardForAward } from "./leaderboard.js";

// The XP ledger. Every award is one XpEntry row written inside the transaction that changed the
// learner's progress, so a failed change writes no XP. The (userId, sourceKey) unique index makes
// each moment award once: a retry, a second tab or a progress recompute inserts nothing and the
// cached totals on User and Enrollment do not move.
//
// Only learners earn XP: the MENTEE role, through an ACTIVE or COMPLETED enrollment that was not
// dropped. Mentors, admins and previews never reach the ledger.

type Tx = Prisma.TransactionClient;

export type XpAward = {
  userId: string;
  enrollmentId: string | null;
  courseId: string | null;
  source: XpSource;
  sourceKey: string;
  /** Defaults to XP_AMOUNTS[source]. */
  amount?: number;
  at?: Date;
};

/** Writes one award. Returns the XP added: 0 when switched off, ineligible, capped or already awarded. */
export async function awardXp(tx: Tx, award: XpAward): Promise<number> {
  if (!gamificationFeatures().xp) return 0;
  const amount = award.amount ?? XP_AMOUNTS[award.source];
  if (!Number.isInteger(amount) || amount <= 0) return 0;

  const user = await tx.user.findUnique({
    where: { id: award.userId },
    select: { role: true, xpBoostUntil: true, profile: { select: { timezone: true } } },
  });
  if (!user || user.role !== "MENTEE") return 0;

  const at = award.at ?? new Date();

  // A purchased "×2 XP boost (session)" doubles XP while its window is unexpired. It is temporary,
  // so it never raises lifetime XP or the career ladder permanently — only this award's amount.
  const boosting = user.xpBoostUntil !== null && user.xpBoostUntil.getTime() > at.getTime();
  const awardedAmount = boosting ? amount * 2 : amount;

  let organizationId: string | null = null;
  if (award.enrollmentId) {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: award.enrollmentId },
      select: { userId: true, lifecycle: true, status: true, organizationId: true },
    });
    if (!enrollment || enrollment.userId !== award.userId) return 0;
    if (enrollment.status === "DROPPED" || (enrollment.lifecycle !== "ACTIVE" && enrollment.lifecycle !== "COMPLETED")) return 0;
    organizationId = enrollment.organizationId;
  }

  const dayKey = dayKeyToDate(localDayKey(at, safeTimeZone(user.profile?.timezone)));
  const weekKey = dayKeyToDate(weekStartKey(dateToDayKey(at)));

  const cap = XP_DAILY_CAPS[award.source];
  if (cap !== undefined) {
    const today = await tx.xpEntry.count({ where: { userId: award.userId, source: award.source, dayKey } });
    if (today >= cap) return 0;
  }

  const { count } = await tx.xpEntry.createMany({
    data: [
      {
        userId: award.userId,
        enrollmentId: award.enrollmentId,
        courseId: award.courseId,
        source: award.source,
        sourceKey: award.sourceKey,
        amount: awardedAmount,
        dayKey,
        weekKey,
        createdAt: at,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return 0;

  await tx.user.update({ where: { id: award.userId }, data: { xpTotal: { increment: awardedAmount } } });
  if (award.enrollmentId) {
    await tx.enrollment.update({ where: { id: award.enrollmentId }, data: { xpTotal: { increment: awardedAmount } } });
  }
  if (award.courseId) {
    await joinLeaderboardForAward(tx, { userId: award.userId, courseId: award.courseId, organizationId, weekKey });
  }
  return awardedAmount;
}

/**
 * XP for a chapter that just became complete: the chapter itself, and for a quiz chapter the pass
 * (less on later tries) and a perfect score. Called from recomputeChapterProgress on the transition.
 */
export async function awardChapterCompletionXp(
  tx: Tx,
  input: {
    userId: string;
    enrollmentId: string;
    courseId: string;
    chapterId: string;
    readerMode: ChapterReaderMode | null;
    completableBlocks: number;
  }
): Promise<number> {
  const base = { userId: input.userId, enrollmentId: input.enrollmentId, courseId: input.courseId };
  let total = await awardXp(tx, {
    ...base,
    source: input.completableBlocks === 0 ? "light_chapter_completed" : "chapter_completed",
    sourceKey: xpKeys.chapter(input.chapterId),
  });

  if (input.readerMode === "QUIZ") {
    const facts = await latestQuizAttempt(tx, input.userId, input.chapterId);
    if (facts?.passed) {
      total += await awardXp(tx, {
        ...base,
        source: "quiz_passed",
        sourceKey: xpKeys.quizPassed(input.chapterId),
        amount: quizPassedXp(facts.attempt),
      });
      if (facts.score === 100) {
        total += await awardXp(tx, { ...base, source: "quiz_perfect", sourceKey: xpKeys.quizPerfect(input.chapterId) });
      }
    }
  }
  return total;
}
