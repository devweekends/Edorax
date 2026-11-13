import { prisma } from "../../db/prisma.js";
import type { LeagueTier } from "../../shared/api/gamification.js";
import type { ProfileRecords } from "../../shared/api/public-profile.js";
import { LEAGUE_TIER_ORDER } from "../../shared/gamification/leagues.js";
import { dateToDayKey, shiftDayKey, weekStartKey } from "../../shared/lib/local-date.js";

// My Records: the learner's durable personal bests, read-only. These survive a reset (a lost streak
// does not wipe "longest streak"), mirroring Duolingo's "personal records". Pure reads.

export type Records = ProfileRecords;

async function enrollmentIds(userId: string): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId, status: { not: "DROPPED" }, lifecycle: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });
  return rows.map((e) => e.id);
}

function bestBy<T>(rows: T[], value: (row: T) => number): T | null {
  return rows.reduce<T | null>((acc, row) => (!acc || value(row) > value(acc) ? row : acc), null);
}

export async function loadRecords(userId: string): Promise<Records> {
  const ids = await enrollmentIds(userId);
  const inEnrollments = { enrollmentId: { in: ids } };

  const [days, xpWeek, xpDay, finish, tiers, current, chapters, study, sessions, responses] = await Promise.all([
    ids.length
      ? prisma.dailyActivity.findMany({ where: { ...inEnrollments, activeSeconds: { gt: 0 } }, select: { date: true } })
      : Promise.resolve([]),
    prisma.xpEntry.groupBy({ by: ["weekKey"], where: { userId }, _sum: { amount: true } }),
    prisma.xpEntry.groupBy({ by: ["dayKey"], where: { userId }, _sum: { amount: true } }),
    prisma.leaguePlacement.findFirst({ where: { userId }, orderBy: [{ rank: "asc" }, { weekKey: "desc" }] }),
    prisma.leaguePlacement.findMany({ where: { userId }, select: { tier: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { leagueTier: true } }),
    ids.length
      ? prisma.chapterProgress.findMany({ where: { ...inEnrollments, completedAt: { not: null } }, select: { completedAt: true } })
      : Promise.resolve([]),
    ids.length
      ? prisma.dailyActivity.groupBy({ by: ["date"], where: inEnrollments, _sum: { activeSeconds: true } })
      : Promise.resolve([]),
    ids.length
      ? prisma.studySession.aggregate({ where: inEnrollments, _max: { activeSeconds: true } })
      : Promise.resolve({ _max: { activeSeconds: 0 } }),
    prisma.response.findMany({ where: { userId, score: { not: null }, maxScore: { not: null } }, select: { score: true, maxScore: true } }),
  ]);

  // Longest run of active days + total active days.
  const keys = [...new Set(days.map((d) => dateToDayKey(d.date)))].sort();
  let longestStreakDays = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of keys) {
    run = previous !== null && shiftDayKey(previous, 1) === key ? run + 1 : 1;
    if (run > longestStreakDays) longestStreakDays = run;
    previous = key;
  }

  const bestXpWeek = bestBy(xpWeek, (r) => r._sum.amount ?? 0);
  const bestXpDay = bestBy(xpDay, (r) => r._sum.amount ?? 0);

  const chapterWeeks = new Map<string, number>();
  for (const row of chapters) {
    if (!row.completedAt) continue;
    const wk = weekStartKey(dateToDayKey(row.completedAt));
    chapterWeeks.set(wk, (chapterWeeks.get(wk) ?? 0) + 1);
  }
  const bestChapterWeek = [...chapterWeeks.entries()].reduce<{ value: number; weekKey: string } | null>(
    (acc, [weekKey, value]) => (!acc || value > acc.value ? { value, weekKey } : acc),
    null
  );

  const bestStudyDay = study.reduce<{ value: number; dayKey: string } | null>((acc, row) => {
    const value = row._sum.activeSeconds ?? 0;
    if (value <= 0) return acc;
    return !acc || value > acc.value ? { value, dayKey: dateToDayKey(row.date) } : acc;
  }, null);

  const tierRank = (t: LeagueTier) => LEAGUE_TIER_ORDER.indexOf(t);
  const allTiers = [...tiers.map((r) => r.tier), ...(current ? [current.leagueTier] : [])];
  const highestLeagueTier = allTiers.sort((a, b) => tierRank(b) - tierRank(a))[0] ?? null;

  const perfectQuizzes = responses.filter((r) => (r.maxScore ?? 0) > 0 && (r.score ?? 0) >= (r.maxScore ?? 1)).length;

  return {
    longestStreakDays,
    bestWeeklyXp:
      bestXpWeek && (bestXpWeek._sum.amount ?? 0) > 0
        ? { value: bestXpWeek._sum.amount ?? 0, weekKey: dateToDayKey(bestXpWeek.weekKey) }
        : null,
    mostXpInADay:
      bestXpDay && (bestXpDay._sum.amount ?? 0) > 0
        ? { value: bestXpDay._sum.amount ?? 0, dayKey: dateToDayKey(bestXpDay.dayKey) }
        : null,
    bestLeagueFinish: finish ? { rank: finish.rank, tier: finish.tier, weekKey: dateToDayKey(finish.weekKey) } : null,
    highestLeagueTier,
    bestWeekChapters: bestChapterWeek,
    mostStudyMinutesInADay: bestStudyDay ? { value: Math.floor(bestStudyDay.value / 60), dayKey: bestStudyDay.dayKey } : null,
    longestSessionMinutes: Math.floor((sessions._max.activeSeconds ?? 0) / 60),
    perfectQuizzes,
    activeDays: keys.length,
  };
}
