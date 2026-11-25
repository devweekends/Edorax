"use client";

import { toast } from "@/components/ui/app-toast";
import { useState, useTransition } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { loadLeaderboard, setGamificationPreferences } from "@/server/actions/gamification";
import type { LeaderboardEntry, LeaderboardView } from "@/shared/api/gamification";

// The weekly course leaderboard: opt-in, one board per course and organization, the learner's own
// rank with the people around them, and their best week so far, so someone far from the top still
// has a goal to beat. Last week's top three sit underneath once a week has finished.

type CourseOption = { courseId: string; title: string };
const numberFormat = new Intl.NumberFormat();

function resetLabel(resetsAt: string) {
  const ms = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Resets soon";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `Resets in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `Resets in ${hours} hour${hours === 1 ? "" : "s"}`;
}

function BestWeek({ xp, best }: { xp: number; best: number }) {
  if (best <= 0) {
    return <p className="text-xs text-muted-foreground">Your first week on this board. Every chapter counts.</p>;
  }
  const beaten = xp > best;
  const percent = Math.min(100, Math.round((xp / best) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn("font-medium", beaten ? "text-primary" : "text-foreground")}>
          {beaten ? "New personal best!" : "Beat your best week"}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {numberFormat.format(xp)} / {numberFormat.format(best)} XP
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="This week compared with your best week"
        aria-valuenow={Math.min(xp, best)}
        aria-valuemin={0}
        aria-valuemax={best}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const MEDAL_TONES: Record<number, string> = {
  1: "bg-brand-yellow/15 text-foreground ring-brand-yellow",
  2: "bg-muted-foreground text-muted-foreground ring-border dark:text-foreground",
  3: "bg-brand-yellow/15 text-foreground ring-brand-yellow",
};

function LastWeekWinners({ winners }: { winners: LeaderboardEntry[] }) {
  return (
    <div className="border-t pt-4">
      <h3 className="text-xs font-medium text-muted-foreground">Last week&apos;s winners</h3>
      <ol className="mt-2 grid grid-cols-3 gap-2">
        {winners.map((winner) => (
          <li
            key={winner.rank}
            className={cn(
              "flex min-w-0 flex-col items-center rounded-xl border px-1.5 py-2.5 text-center",
              winner.isYou ? "border-brand-yellow bg-brand-yellow/15" : "bg-muted/30"
            )}
          >
            <span
              className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold tabular-nums ring-1", MEDAL_TONES[winner.rank])}
              aria-hidden
            >
              {winner.rank}
            </span>
            <span className={cn("mt-1.5 w-full truncate text-xs", winner.isYou ? "font-semibold" : "font-medium")}>
              <span className="sr-only">Place {winner.rank}: </span>
              {winner.isYou ? (winner.name ? `${winner.name} (You)` : "You") : winner.name}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{numberFormat.format(winner.xp)} XP</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LeaderboardCard({
  initial,
  initialCourseId,
  courses,
}: {
  initial: LeaderboardView | null;
  initialCourseId: string;
  courses: CourseOption[];
}) {
  const [view, setView] = useState(initial);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [pending, startTransition] = useTransition();

  if (!view || view.status === "disabled") return null;

  function run(work: () => Promise<LeaderboardView | null>) {
    startTransition(async () => {
      try {
        setView(await work());
      } catch {
        toast("Something went wrong. Please try again.", "error");
      }
    });
  }

  const courseTitle = courses.find((course) => course.courseId === courseId)?.title ?? view.courseTitle;
  const switchCourse = (next: string) => {
    setCourseId(next);
    run(() => loadLeaderboard(next));
  };
  const join = () =>
    run(async () => {
      await setGamificationPreferences({ leaderboardOptIn: true });
      return loadLeaderboard(courseId);
    });
  const leave = () =>
    run(async () => {
      await setGamificationPreferences({ leaderboardOptIn: false });
      return loadLeaderboard(courseId);
    });

  return (
    <section aria-labelledby="leaderboard-heading" aria-busy={pending} className="self-start rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="leaderboard-heading" className="text-sm font-semibold">Weekly leaderboard</h2>
        <InfoTip label="About leaderboards" className="ml-auto">
          <p>A weekly board for each course, shared with classmates who learn it the same way you do, ranked by the XP you earn in that course this week.</p>
          <p className="mt-2">Only learners who join appear, shown by first name and last initial. Boards reset every Monday at 00:00 UTC.</p>
        </InfoTip>
      </div>

      {courses.length > 1 ? (
        // Our own menu instead of a native select: phones otherwise show a system sheet of
        // long titles with radio buttons, outside the Edorax look.
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            aria-label={`Course: ${courseTitle}`}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="min-w-0 flex-1 truncate">
              {courseTitle}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 p-1.5">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Course</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={courseId} onValueChange={(next) => switchCourse(String(next))}>
                {courses.map((course) => (
                  <DropdownMenuRadioItem key={course.courseId} value={course.courseId} className="min-h-11 py-2 pl-2 leading-5">
                    {course.title}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p className="mt-1 truncate text-xs text-muted-foreground">{view.courseTitle}</p>
      )}

      <div className={cn("mt-4 transition-opacity duration-150 motion-reduce:transition-none", pending && "opacity-60")}>
        {view.status === "opt_in_required" ? (
          <div>
            <p className="text-sm text-muted-foreground">
              See how your week compares with your classmates. Only people who join can see the board, and you can leave at any time.
            </p>
            <Button className="mt-4 w-full sm:w-auto" onClick={join} disabled={pending}>
              Join leaderboards
            </Button>
          </div>
        ) : view.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">
            {view.reason === "organization_disabled"
              ? "Your organization has turned leaderboards off for this course."
              : "Leaderboards are available while your enrollment is active."}
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              You are <span className="font-semibold tabular-nums">#{view.you.rank}</span>
              <span className="text-muted-foreground"> of {view.groupSize} this week</span>
            </p>
            <ol className="divide-y divide-border overflow-hidden rounded-xl border">
              {view.entries.map((entry) => (
                <li
                  key={`${entry.rank}-${entry.name}`}
                  aria-current={entry.isYou ? "true" : undefined}
                  className={cn("flex items-center gap-3 px-3 py-2 text-sm", entry.isYou && "bg-muted/60 font-medium")}
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">{entry.rank}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.isYou ? (entry.name ? `${entry.name} (You)` : "You") : entry.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{numberFormat.format(entry.xp)} XP</span>
                </li>
              ))}
            </ol>
            <BestWeek xp={view.you.xp} best={view.you.bestWeekXp} />
            {view.lastWeek ? <LastWeekWinners winners={view.lastWeek.winners} /> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span suppressHydrationWarning>{resetLabel(view.resetsAt)}</span>
              <button
                type="button"
                onClick={leave}
                disabled={pending}
                className="rounded font-medium underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                Leave leaderboards
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
