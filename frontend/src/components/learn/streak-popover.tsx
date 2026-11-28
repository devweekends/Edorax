"use client";

import { useState } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { Check, Snowflake, X } from "lucide-react";
import { StreakFlame } from "@/components/learn/streak-flame";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { GamificationSummary } from "@/shared/api/gamification";
import type { StreakPopupDayView, StreakPopupView } from "@/shared/api/learner";
import { STREAK_MILESTONES } from "@/shared/lib/streak";
import { streakDaySummary } from "@/shared/lib/streak-popup";

/** The next milestone above the current streak, or null once the learner is past the last one. */
function nextMilestone(count: number) {
  return STREAK_MILESTONES.find((milestone) => milestone > count) ?? null;
}

function WeekDay({
  day,
  today,
  todayActive,
  frozen,
}: {
  day: StreakPopupDayView;
  today: string;
  todayActive: boolean;
  /** A streak freeze covered this day, so the run kept going. */
  frozen: boolean;
}) {
  const isToday = day.day === today;
  const done = isToday ? todayActive : day.status === "completed";
  const inactive = !done && !isToday && day.status === "inactive";
  const covered = !done && !isToday && !inactive && frozen;
  return (
    <li
      className="flex flex-col items-center gap-1"
      title={covered ? "Missed, but a streak freeze covered it" : streakDaySummary(day, today)}
    >
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full",
          done && "bg-orange-500 text-white",
          !done && isToday && "border-2 border-orange-500 text-orange-500",
          covered && "bg-sky-500/15 text-sky-500",
          inactive && "border border-dashed border-border bg-muted/30 text-muted-foreground/50",
          !done && !isToday && !covered && !inactive && "bg-muted text-muted-foreground"
        )}
      >
        {done ? (
          <Check className="size-4" strokeWidth={3} aria-hidden />
        ) : isToday ? (
          <span className="size-1.5 rounded-full bg-orange-500" aria-hidden />
        ) : covered ? (
          <Snowflake className="size-4" aria-hidden />
        ) : inactive ? (
          <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden />
        ) : (
          <X className="size-3.5" aria-hidden />
        )}
        <span className="sr-only">
          {done
            ? "Done"
            : isToday
              ? "Not yet"
              : covered
                ? "Missed, covered by a streak freeze"
                : inactive
                  ? "Before you joined"
                  : "Missed"}
        </span>
      </span>
      <span className={cn("text-xs", isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>{day.weekday}</span>
    </li>
  );
}

/**
 * The "day streak" badge in the top bar. Clicking it opens a small card with the current streak, the next
 * milestone and the last seven days. The full year grid stays on the Progress page.
 */
export function StreakPopover({ streak }: { streak: number }) {
  const [week, setWeek] = useState<StreakPopupView | null>(null);
  const [freezes, setFreezes] = useState<GamificationSummary["freezes"]>(null);
  const [failed, setFailed] = useState(false);

  // Loaded each time the card opens, so it never shows a stale week. The last result stays on screen meanwhile.
  async function load() {
    const [popup, gamification] = await Promise.allSettled([
      apiFetch<StreakPopupView>("/api/v1/learner/streak-popup"),
      apiFetch<GamificationSummary>("/api/v1/learner/gamification"),
    ]);
    if (popup.status === "fulfilled") {
      setWeek(popup.value);
      setFailed(false);
    } else {
      setFailed(true);
    }
    if (gamification.status === "fulfilled") setFreezes(gamification.value.freezes);
  }

  const count = week?.streakCount ?? streak;
  const next = nextMilestone(count);
  const toGo = next ? next - count : 0;

  return (
    <Popover.Root onOpenChange={(open) => { if (open) void load(); }}>
      <Popover.Trigger
        aria-label={`Day streak: ${streak} ${streak === 1 ? "day" : "days"}. Show streak details.`}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StreakFlame days={streak} />
        <span className="font-semibold tabular-nums">{streak}</span>
        <span className="text-muted-foreground">day streak</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="isolate z-50 outline-none">
          <Popover.Popup className="w-72 origin-(--transform-origin) rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center gap-3">
              <StreakFlame days={count} className="size-11" />
              <div className="min-w-0">
                <Popover.Title className="text-base font-semibold tabular-nums">
                  {count} day streak
                </Popover.Title>
                <Popover.Description className="text-xs leading-5 text-muted-foreground">
                  {count === 0
                    ? "Read a lesson or do an exercise today to start one."
                    : next
                      ? `${toGo} ${toGo === 1 ? "day" : "days"} to a ${next} day streak.`
                      : "You are past a full year. Keep it going."}
                </Popover.Description>
              </div>
            </div>

            {week ? (
              <ul className="mt-4 grid grid-cols-7 gap-1" aria-label="Last 7 days">
                {week.week.map((day) => (
                  <WeekDay
                    key={day.day}
                    day={day}
                    today={week.today}
                    todayActive={week.todayActive}
                    frozen={freezes?.recentlyCoveredDays.includes(day.day) ?? false}
                  />
                ))}
              </ul>
            ) : failed ? (
              <p className="mt-4 text-xs text-muted-foreground">The last 7 days could not load. Open Progress to see them.</p>
            ) : (
              <div className="mt-4 h-[3.25rem] animate-pulse rounded-lg bg-muted" aria-hidden />
            )}

            {freezes && freezes.max > 0 ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Snowflake className="size-3.5 text-primary" aria-hidden />
                {freezes.available} of {freezes.max} streak freezes
              </p>
            ) : null}

            <Link
              href="/progress"
              className="mt-4 block rounded-lg border border-border px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-muted"
            >
              See full progress
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
