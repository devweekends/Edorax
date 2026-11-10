import type { LearnerProgressCourse, LearnerProgressView } from '../../../server/src/shared/api/learner';

export type { LearnerProgressCourse as ProgressCourse, LearnerProgressModule as ProgressModule } from '../../../server/src/shared/api/learner';

export type ProgressData = LearnerProgressView & { streak: number; timezone: string };

export type Day = { day: string; seconds: number };

const DAY_MS = 86_400_000;

/** "0m", "45m", "2h", "1h 5m". */
export function formatStudy(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Study seconds per day across the given courses, summed. */
export function aggregateDays(courses: LearnerProgressCourse[]): Day[] {
  const byDay = new Map<string, number>();
  for (const course of courses) {
    for (const day of course.dailyActivity) {
      byDay.set(day.day, (byDay.get(day.day) ?? 0) + day.seconds);
    }
  }
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, seconds]) => ({ day, seconds }));
}

/** A continuous run of `count` days ending today (UTC), with zeros for days with no record. */
export function calendar(days: Day[], count: number, now = Date.now(), timeZone = 'UTC'): Day[] {
  const byDay = new Map<string, number>(days.map((item) => [item.day, item.seconds] as const));
  return Array.from({ length: count }, (_, index) => {
    const day = dayKey(now - (count - 1 - index) * DAY_MS, timeZone);
    return { day, seconds: byDay.get(day) ?? 0 };
  });
}

export function weeklyBuckets(days: Day[], timeZone = 'UTC'): { start: string; end: string; seconds: number }[] {
  const cal = calendar(days, 84, Date.now(), timeZone);
  return Array.from({ length: 12 }, (_, week) => {
    const slice = cal.slice(week * 7, week * 7 + 7);
    return {
      start: slice[0]!.day,
      end: slice[6]!.day,
      seconds: slice.reduce((sum, item) => sum + item.seconds, 0),
    };
  });
}

export function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dateLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Score as a whole percent, or null when nothing has been scored yet. */
export function scorePercent(score: number, maxScore: number): number | null {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : null;
}

/** The calendar day "YYYY-MM-DD" a timestamp falls on for the learner's timezone. Falls back to UTC. */
export function dayKey(ms: number, timeZone = 'UTC'): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
