import { prisma } from "../../db/prisma.js";
import { ACHIEVEMENTS, achievementProgress, rewardForTier } from "../../shared/gamification/achievements.js";
import { LEAGUE_TIER_ORDER } from "../../shared/gamification/leagues.js";
import { dateToDayKey, dayKeyToDate } from "../../shared/lib/local-date.js";
import type { AchievementView } from "../../shared/api/public-profile.js";
import { loadRecords } from "./records.js";
import { earnCredits } from "./credits.js";

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

/**
 * Grants credits for every reached achievement tier, once each, idempotently through the credit
 * ledger (`achievement:<id>:<tier>` source keys). Returns what was newly paid this call.
 */
export async function grantAchievementRewards(
  userId: string,
  achievements: AchievementView[]
): Promise<{ count: number; credits: number }> {
  const existing = new Set(
    (
      await prisma.creditEntry.findMany({
        where: { userId, sourceKey: { startsWith: "achievement:" } },
        select: { sourceKey: true },
      })
    ).map((row) => row.sourceKey)
  );

  const pending: Array<{ key: string; amount: number }> = [];
  for (const a of achievements) {
    for (let i = 0; i <= a.tier; i++) {
      const key = `achievement:${a.id}:${i}`;
      if (!existing.has(key)) pending.push({ key, amount: rewardForTier(i) });
    }
  }
  if (pending.length === 0) return { count: 0, credits: 0 };

  let count = 0;
  let credits = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of pending) {
      const paid = await earnCredits(tx, userId, p.key, p.amount);
      if (paid) {
        count += 1;
        credits += p.amount;
      }
    }
  });
  return { count, credits };
}
