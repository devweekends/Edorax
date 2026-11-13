import { prisma } from "../../db/prisma.js";
import { QUEST_BY_ID, questsForWeek } from "../../shared/gamification/quests.js";
import type { WeeklyQuestsView } from "../../shared/api/quests.js";
import { dateToDayKey, dayKeyToDate, weekStartKey } from "../../shared/lib/local-date.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { earnCredits } from "./credits.js";
import { gamificationFeatures } from "./flags.js";

// Weekly quests: effort-based objectives that reset every Monday (UTC). Progress is derived from the
// learner's existing activity; the reward is Build Credits paid once per quest per week through the
// idempotent credit ledger (no separate claim table needed).

function currentWeekStart(now: Date): Date {
  return dayKeyToDate(weekStartKey(dateToDayKey(now)));
}

export async function loadWeeklyQuests(userId: string, now: Date = new Date()): Promise<WeeklyQuestsView | null> {
  if (!gamificationFeatures().credits) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gamificationHidden: true } });
  if (user?.gamificationHidden) return null;

  const weekStart = currentWeekStart(now);
  const weekKey = dateToDayKey(weekStart);

  const [chapters, assessments, days, xpSum, claimed] = await Promise.all([
    prisma.chapterProgress.count({ where: { enrollment: { userId }, completedAt: { gte: weekStart } } }),
    prisma.response.count({
      where: { userId, isCorrect: true, submittedAt: { gte: weekStart }, block: { type: { in: ["QUIZ", "PREDICT", "CODE"] } } },
    }),
    prisma.dailyActivity.findMany({
      where: { enrollment: { userId }, date: { gte: weekStart }, activeSeconds: { gt: 0 } },
      select: { date: true },
    }),
    prisma.xpEntry.aggregate({ where: { userId, weekKey: weekStart }, _sum: { amount: true } }),
    prisma.creditEntry.findMany({
      where: { userId, sourceKey: { startsWith: `quest:${weekKey}:` } },
      select: { sourceKey: true },
    }),
  ]);

  const studyDays = new Set(days.map((d) => dateToDayKey(d.date))).size;
  const xp = xpSum._sum.amount ?? 0;
  const claimedSet = new Set(claimed.map((c) => c.sourceKey));

  const quests = questsForWeek(weekKey).map((quest) => {
    const progress =
      quest.metric === "chapters" ? chapters : quest.metric === "assessments" ? assessments : quest.metric === "studyDays" ? studyDays : xp;
    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      metric: quest.metric,
      target: quest.target,
      rewardCredits: quest.rewardCredits,
      progress: Math.min(progress, quest.target),
      completed: progress >= quest.target,
      claimed: claimedSet.has(`quest:${weekKey}:${quest.id}`),
    };
  });

  return { weekKey, quests, completed: quests.filter((q) => q.completed).length, total: quests.length };
}

export async function claimQuest(userId: string, questId: string, now: Date = new Date()): Promise<WeeklyQuestsView> {
  const quest = QUEST_BY_ID.get(questId as never);
  if (!quest) throw new NotFoundError("Unknown quest");

  const view = await loadWeeklyQuests(userId, now);
  if (!view) throw new BadRequestError("Quests are not available.");
  const target = view.quests.find((q) => q.id === questId);
  if (!target) throw new NotFoundError("Unknown quest");
  if (!target.completed) throw new BadRequestError("Finish this quest first.");
  if (target.claimed) return view;

  await prisma.$transaction(async (tx) => {
    await earnCredits(tx, userId, `quest:${view.weekKey}:${questId}`, quest.rewardCredits);
  });

  const refreshed = await loadWeeklyQuests(userId, now);
  return refreshed ?? view;
}
