import { prisma } from "../../db/prisma.js";
import { ACHIEVEMENTS, achievementProgress, rewardForTier } from "../../shared/gamification/achievements.js";
import { LEAGUE_TIER_ORDER } from "../../shared/gamification/leagues.js";
import { dateToDayKey, dayKeyToDate } from "../../shared/lib/local-date.js";
import type { AchievementClaim, AchievementClaimResult, AchievementView } from "../../shared/api/public-profile.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { loadRecords } from "./records.js";
import { creditBalance, earnCredits } from "./credits.js";
import { gamificationFeatures } from "./flags.js";

// Computes achievement-card progress from existing data. Pure reads; reuses the records service for
// streak/perfect/league so there is one source of truth for those bests.

const DAY_MS = 86_400_000;

export async function loadAchievements(userId: string): Promise<AchievementView[]> {
  const [records, user, coursesCompleted, chaptersCompleted, activity, sessions] = await Promise.all([
    loadRecords(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { xpTotal: true } }),
    prisma.enrollment.count({ where: { userId, status: "COMPLETED" } }),
    prisma.chapterProgress.count({ where: { enrollment: { userId }, completedAt: { not: null } } }),
    prisma.dailyActivity.findMany({ where: { enrollment: { userId } }, select: { date: true, activeSeconds: true } }),
    prisma.studySession.findMany({ where: { enrollment: { userId } }, select: { startedAt: true } }),
  ]);

  const totalSeconds = activity.reduce((sum, row) => sum + Math.max(0, row.activeSeconds), 0);
  const studyHours = Math.floor(totalSeconds / 3600);

  let nightOwl = 0;
  let earlyBird = 0;
  for (const session of sessions) {
    const hour = new Date(session.startedAt).getUTCHours();
    if (hour >= 22) nightOwl += 1;
    else if (hour >= 5 && hour < 9) earlyBird += 1;
  }

  const daySet = new Set(activity.map((row) => dateToDayKey(row.date)));
  let weekends = 0;
  for (const key of daySet) {
    const date = dayKeyToDate(key);
    if (date.getUTCDay() === 0) {
      const saturday = dateToDayKey(new Date(date.getTime() - DAY_MS));
      if (daySet.has(saturday)) weekends += 1;
    }
  }

  const leagueIndex = records.highestLeagueTier ? LEAGUE_TIER_ORDER.indexOf(records.highestLeagueTier) : 0;
  const values = {
    xp: Math.max(0, user?.xpTotal ?? 0),
    streak: records.longestStreakDays,
    courses: coursesCompleted,
    chapters: chaptersCompleted,
    perfect: records.perfectQuizzes,
    league: leagueIndex,
    studyHours,
    nightOwl,
    earlyBird,
    weekends,
  };

  return ACHIEVEMENTS.map((def) => {
    const value = values[def.metric];
    const { tier, nextTarget, progress } = achievementProgress(value, def.tiers);
    const earnedCredits = Array.from({ length: tier + 1 }, (_, i) => rewardForTier(i)).reduce((sum, n) => sum + n, 0);
    const nextReward = nextTarget !== null ? rewardForTier(tier + 1) : null;
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      category: def.category,
      icon: def.icon,
      value,
      tier,
      nextTarget,
      progress,
      tiers: def.tiers,
      earnedCredits,
      nextReward,
    };
  });
}

/** Reached tiers whose credits are still waiting to be claimed, per achievement. */
export async function pendingAchievementClaims(userId: string, achievements: AchievementView[]): Promise<AchievementClaim[]> {
  const paid = new Set(
    (
      await prisma.creditEntry.findMany({
        where: { userId, sourceKey: { startsWith: "achievement:" } },
        select: { sourceKey: true },
      })
    ).map((row) => row.sourceKey)
  );
  const claims: AchievementClaim[] = [];
  for (const a of achievements) {
    const tiers: number[] = [];
    for (let i = 0; i <= a.tier; i++) if (!paid.has(achievementCreditKey(a.id, i))) tiers.push(i);
    if (tiers.length > 0) claims.push({ id: a.id, tiers, credits: tiers.reduce((sum, i) => sum + rewardForTier(i), 0) });
  }
  return claims;
}

/**
 * Pays every reached, unpaid tier of one achievement. Idempotent through the credit ledger
 * (`achievement:<id>:<tier>` source keys), so a double click pays once.
 */
export async function claimAchievement(userId: string, achievementId: string): Promise<AchievementClaimResult> {
  if (!ACHIEVEMENTS.some((def) => def.id === achievementId)) throw new NotFoundError("Achievement not found");
  if (!gamificationFeatures().credits) throw new BadRequestError("Build Credits are turned off.");
  const achievement = (await loadAchievements(userId)).find((a) => a.id === achievementId)!;
  const [pending] = await pendingAchievementClaims(userId, [achievement]);
  if (!pending) throw new BadRequestError("Nothing to claim for this achievement yet.");

  let credits = 0;
  const tiers: number[] = [];
  await prisma.$transaction(async (tx) => {
    for (const tier of pending.tiers) {
      const amount = rewardForTier(tier);
      if (await earnCredits(tx, userId, achievementCreditKey(achievementId, tier), amount)) {
        credits += amount;
        tiers.push(tier);
      }
    }
  });
  const label = achievement.tiers[Math.max(...pending.tiers)]?.label ?? null;
  return { id: achievementId, title: achievement.title, tierLabel: label, tiers, credits, balance: await creditBalance(userId) };
}

function achievementCreditKey(id: string, tier: number): string {
  return `achievement:${id}:${tier}`;
}
