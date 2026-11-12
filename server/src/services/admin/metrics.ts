import type { AdminMetricsView, AdminMetricTotals } from "../../shared/api/admin.js";
import { prisma } from "../../db/prisma.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";

// Platform trends for the admin overview: new accounts, new enrollments, and
// distinct active learners per UTC day, plus range totals. Buckets are computed
// in JS from a range-bounded read (the codebase does not use raw SQL); if the
// tables grow, the next step is a daily rollup table rather than scanning rows.

export const METRICS_RANGES = { "7": 7, "30": 30, "90": 90 } as const;
export type MetricsRange = keyof typeof METRICS_RANGES;

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export async function loadMetrics(range: MetricsRange = "30"): Promise<AdminMetricsView> {
  const rangeDays = METRICS_RANGES[range];
  const today = new Date();
  const since = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  since.setUTCDate(since.getUTCDate() - (rangeDays - 1));

  const days = Array.from({ length: rangeDays }, (_, offset) => {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + offset);
    return dayKey(day);
  });

  const [users, enrollments, activity] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.enrollment.findMany({
      where: { createdAt: { gte: since }, ...CONFIRMED_ENROLLMENT_WHERE },
      select: { createdAt: true },
    }),
    prisma.dailyActivity.findMany({
      where: { date: { gte: since } },
      select: { date: true, activeSeconds: true, enrollment: { select: { userId: true, learnerProfileId: true } } },
    }),
  ]);

  const signupsByDay = new Map<string, number>();
  for (const user of users) {
    const key = dayKey(user.createdAt);
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  const enrollmentsByDay = new Map<string, number>();
  for (const enrollment of enrollments) {
    const key = dayKey(enrollment.createdAt);
    enrollmentsByDay.set(key, (enrollmentsByDay.get(key) ?? 0) + 1);
  }

  // A learner is identified by the account when there is one, else the learner profile.
  const learnersByDay = new Map<string, Set<string>>();
  const allLearners = new Set<string>();
  let studySeconds = 0;
  for (const row of activity) {
    const key = dayKey(row.date);
    const learner = row.enrollment.userId ?? row.enrollment.learnerProfileId ?? "unknown";
    const set = learnersByDay.get(key) ?? new Set<string>();
    set.add(learner);
    learnersByDay.set(key, set);
    allLearners.add(learner);
    studySeconds += row.activeSeconds;
  }

  const totals: AdminMetricTotals = {
    newUsers: users.length,
    newEnrollments: enrollments.length,
    activeLearners: allLearners.size,
    studySeconds,
  };

  return {
    rangeDays,
    totals,
    series: days.map((date) => ({
      date,
      signups: signupsByDay.get(date) ?? 0,
      enrollments: enrollmentsByDay.get(date) ?? 0,
      activeLearners: learnersByDay.get(date)?.size ?? 0,
    })),
  };
}
