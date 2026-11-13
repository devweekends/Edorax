import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";

// Build Credits: a permanent, spendable currency earned from verified behaviour (course completion,
// weekly league promotion), held separately from lifetime XP. The `CreditEntry` ledger is the source
// of truth; `User.buildCredits` is a cache. Earns are keyed (`@@unique([userId, sourceKey])`) so a
// retry or a recompute never pays twice, exactly like the XP ledger.

export const COURSE_COMPLETED_CREDITS = 90;
export const LEAGUE_PROMOTION_CREDITS = 45;

export const creditKeys = {
  courseCompleted: (courseId: string) => `course:complete:${courseId}`,
  leaguePromotion: (weekStart: string) => `league:promotion:${weekStart}`,
} as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** Pay one idempotent credit award. Returns true if it was newly earned (false on a duplicate). */
export async function earnCredits(tx: Db, userId: string, sourceKey: string, amount: number): Promise<boolean> {
  const { count } = await tx.creditEntry.createMany({
    data: [{ userId, source: sourceKey.split(":")[0]!, sourceKey, amount }],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  await tx.user.update({ where: { id: userId }, data: { buildCredits: { increment: amount } } });
  return true;
}

/** The learner's current spendable balance (the cache; the ledger is authoritative). */
export async function creditBalance(userId: string, db: Db = prisma): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { buildCredits: true } });
  return Math.max(0, user?.buildCredits ?? 0);
}

/**
 * Spend credits idempotently: atomically checks and decrements the balance, and records a negative
 * ledger row (keyed so a retry never double-spends). Never lets the balance go negative. Returns
 * the resulting balance (unchanged if there weren't enough credits).
 */
export async function spendCredits(db: Db, userId: string, sourceKey: string, amount: number): Promise<number> {
  if (amount <= 0) return creditBalance(userId, db);
  const existing = await db.creditEntry.findUnique({ where: { userId_sourceKey: { userId, sourceKey } }, select: { id: true } });
  if (existing) return creditBalance(userId, db);
  const debited = await db.user.updateMany({
    where: { id: userId, buildCredits: { gte: amount } },
    data: { buildCredits: { decrement: amount } },
  });
  if (debited.count === 0) return creditBalance(userId, db);
  const { count } = await db.creditEntry.createMany({
    data: [{ userId, source: sourceKey.split(":")[0]!, sourceKey, amount: -amount }],
    skipDuplicates: true,
  });
  if (count === 0) {
    await db.user.update({ where: { id: userId }, data: { buildCredits: { increment: amount } } });
  }
  return creditBalance(userId, db);
}