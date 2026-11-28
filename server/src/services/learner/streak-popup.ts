import { prisma } from "../../db/prisma.js";
import { dateToDayKey, dayKeyToDate, localDayKey, shiftDayKey } from "../../shared/lib/local-date.js";
import { computeStreak } from "../../shared/lib/streak.js";
import { buildStreakWeek, shouldShowStreakPopup, streakMilestoneToCelebrate, type StreakPopupDay } from "../../shared/lib/streak-popup.js";
import type { StreakPopupView } from "../../shared/api/learner.js";
import { learnerTimeZone } from "./time-zone.js";

async function loadActiveDaysAndSeconds(userId: string, todayKey: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { not: "DROPPED" } },
    select: { id: true },
  });
  const enrollmentIds = enrollments.map((row) => row.id);
  if (enrollmentIds.length === 0) {
    return { activeDays: [] as string[], secondsByDay: new Map<string, number>(), streakCount: 0 };
  }

  const since = dayKeyToDate(shiftDayKey(todayKey, -120));
  const rows = await prisma.dailyActivity.findMany({
    where: {
      enrollmentId: { in: enrollmentIds },
      activeSeconds: { gt: 0 },
      date: { gte: since },
    },
    select: { date: true, activeSeconds: true },
  });

  const secondsByDay = new Map<string, number>();
  for (const row of rows) {
    const key = dateToDayKey(row.date);
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + row.activeSeconds);
  }
  const activeDays = [...secondsByDay.keys()];
  // Read-only: never spend freezes from the popup fetch.
  const frozen = await prisma.streakFreezeDay.findMany({
    where: { userId },
    select: { date: true },
  });
  const streak = computeStreak(activeDays, todayKey, {
    frozenDays: frozen.map((row) => dateToDayKey(row.date)),
    freezesAvailable: 0,
  });

  return { activeDays, secondsByDay, streakCount: streak.count };
}

/** Payload for the daily streak popup: whether to show it, and the week row. */
export async function loadStreakPopup(userId: string, options: { now?: Date } = {}): Promise<StreakPopupView> {
  const now = options.now ?? new Date();
  const timeZone = await learnerTimeZone(userId);
  const today = localDayKey(now, timeZone);

  const [user, activity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, streakPopupSeenOn: true, gamificationHidden: true, celebratedStreakMilestones: true },
    }),
    loadActiveDaysAndSeconds(userId, today),
  ]);

  const seenOn = user?.streakPopupSeenOn ? dateToDayKey(user.streakPopupSeenOn) : null;
  const joinedOn = user?.createdAt ? localDayKey(user.createdAt, timeZone) : null;
  const todayActive = (activity.secondsByDay.get(today) ?? 0) > 0;
  const hasActivity = activity.activeDays.length > 0;
  const week: StreakPopupDay[] = buildStreakWeek({
    today,
    activeDays: activity.activeDays,
    secondsByDay: activity.secondsByDay,
    joinedOn,
  });
  const show =
    !(user?.gamificationHidden ?? false) &&
    shouldShowStreakPopup({ seenOn, today, hasActivity, joinedOn });

  const milestone = (user?.gamificationHidden ?? false)
    ? null
    : streakMilestoneToCelebrate({
        streakCount: activity.streakCount,
        todayActive,
        celebrated: user?.celebratedStreakMilestones ?? [],
      });

  return {
    show,
    milestone,
    streakCount: activity.streakCount,
    todayActive,
    today,
    week,
    seenOn,
  };
}

/** Mark the streak popup dismissed for the learner's local today. */
export async function dismissStreakPopup(userId: string, options: { now?: Date } = {}): Promise<{ seenOn: string }> {
  const now = options.now ?? new Date();
  const timeZone = await learnerTimeZone(userId);
  const today = localDayKey(now, timeZone);
  await prisma.user.update({
    where: { id: userId },
    data: { streakPopupSeenOn: dayKeyToDate(today) },
  });
  return { seenOn: today };
}
