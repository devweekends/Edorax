// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import { shiftUtcDate, uncelebratedStreakMilestone, type StreakMilestone } from "./streak";

/** One day in the streak popup's trailing week row. */
export type StreakPopupDayStatus = "completed" | "missed" | "today" | "inactive";

export type StreakPopupDay = {
  /** ISO calendar day "YYYY-MM-DD". */
  day: string;
  /** Single-letter weekday initial (UTC weekday of the day key). */
  weekday: string;
  status: StreakPopupDayStatus;
  /** Study seconds that day, when known. */
  seconds: number;
};

export type StreakPopupShouldShowInput = {
  /** Local day key the learner last dismissed the popup on, or null. */
  seenOn: string | null;
  /** Learner's local today as "YYYY-MM-DD". */
  today: string;
  /**
   * Whether the learner has any recorded study activity yet.
   * Brand-new learners who have not started studying are not interrupted with a streak modal.
   */
  hasActivity?: boolean;
  /**
   * Local calendar day ("YYYY-MM-DD") the learner created their account.
   * On registration day, let the learner get into their first lesson without a streak popup.
   */
  joinedOn?: string | null;
};

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/**
 * Whether the daily streak popup should open for this local day. It opens once a day once the
 * learner has actually started studying (and never on their signup day), so new users are not
 * hit with a streak modal before taking their first lesson. Dismissing it hides it until the next
 * local day; it never changes the streak.
 */
export function shouldShowStreakPopup(input: StreakPopupShouldShowInput): boolean {
  if (input.seenOn === input.today) return false;
  if (input.hasActivity === false) return false;
  if (input.joinedOn && input.joinedOn === input.today) return false;
  return true;
}

/**
 * The streak milestone to celebrate on this open, or null. A milestone is celebrated the day AFTER the
 * streak reached it, when the learner comes back, so the count only includes days before today. Once the
 * learner has seen it the app records it, and it never shows again.
 */
export function streakMilestoneToCelebrate(input: {
  /** Current streak count, which includes today when today already has activity. */
  streakCount: number;
  todayActive: boolean;
  celebrated: number[];
}): StreakMilestone | null {
  const throughYesterday = input.todayActive ? Math.max(0, input.streakCount - 1) : input.streakCount;
  return uncelebratedStreakMilestone(throughYesterday, input.celebrated);
}

/** Weekday initial for an ISO day key (UTC calendar day). */
export function weekdayInitial(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "?";
  return WEEKDAY_INITIALS[date.getUTCDay()] ?? "?";
}

/**
 * Trailing 7 local days ending on `today`. Days before `joinedOn` are marked `inactive` instead of
 * `missed`; past days on or after `joinedOn` without activity are `missed`; active days are
 * `completed`; today always uses the `today` status.
 */
export function buildStreakWeek(input: {
  today: string;
  activeDays: Iterable<string>;
  secondsByDay?: ReadonlyMap<string, number> | Record<string, number>;
  /** Local calendar day ("YYYY-MM-DD") the learner signed up. Earlier days are marked inactive. */
  joinedOn?: string | null;
}): StreakPopupDay[] {
  const active = new Set(input.activeDays);
  const secondsOf = (day: string): number => {
    const source = input.secondsByDay;
    if (!source) return 0;
    if (source instanceof Map) return source.get(day) ?? 0;
    const record = source as Record<string, number>;
    return record[day] ?? 0;
  };

  const days: StreakPopupDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = shiftUtcDate(input.today, -offset);
    const seconds = secondsOf(day);
    const hasActivity = active.has(day) || seconds > 0;
    let status: StreakPopupDayStatus;
    if (day === input.today) status = "today";
    else if (hasActivity) status = "completed";
    else if (input.joinedOn && day < input.joinedOn) status = "inactive";
    else status = "missed";
    days.push({ day, weekday: weekdayInitial(day), status, seconds });
  }
  return days;
}

/** Short human summary for a tapped day. */
export function streakDaySummary(day: StreakPopupDay, today: string): string {
  if (day.day === today) {
    if (day.seconds > 0) return `Today · ${formatStudyMinutes(day.seconds)} so far`;
    return "Today is still open. Read a lesson or do an exercise and it counts on its own.";
  }
  if (day.status === "inactive") {
    return `${formatDayLabel(day.day)} · before you joined`;
  }
  if (day.status === "completed" || day.seconds > 0) {
    return `${formatDayLabel(day.day)} · ${formatStudyMinutes(day.seconds)}`;
  }
  return `${formatDayLabel(day.day)} · no study logged`;
}

function formatStudyMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes <= 0) return "under a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
