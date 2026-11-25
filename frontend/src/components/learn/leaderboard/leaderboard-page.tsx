"use client";

import { toast } from "@/components/ui/app-toast";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Trophy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { loadLeaderboardHub, setGamificationPreferences } from "@/server/actions/gamification";
import type { LeaderboardHubEntry, LeaderboardHubView } from "@/shared/api/gamification";
import { LeaderboardTabs, type HubSelection } from "./leaderboard-tabs";
import { LeaderboardLeagueCard } from "./leaderboard-league-card";
import { LeaderboardList } from "./leaderboard-list";
import { useLeaderboardConfetti } from "./use-leaderboard-confetti";
import { formatNumber, formatScore, resetLabel } from "./leaderboard-format";

type CourseOption = { courseId: string; title: string };

function boardContext(view: LeaderboardHubView, courseTitle: string | null): string {
  if (view.scope === "course") return courseTitle ?? "Course";
  switch (view.category) {
    case "weekly_xp":
      return "Global Weekly XP";
    case "all_time_xp":
      return "All-time XP";
    case "speed":
      return "Speed";
    case "streak":
      return "Streak";
  }
}

function BestScore({
  score,
  best,
  metricLabel,
  label,
}: {
  score: number;
  best: number;
  metricLabel: string;
  label: string;
}) {
  const beaten = score > best;
  const percent = Math.min(100, Math.round((score / best) * 100));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={cn("font-medium", beaten ? "text-primary" : "text-foreground")}>
          {beaten ? "New personal best!" : label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(score)} / {formatNumber(best)} {metricLabel === "XP" ? "XP" : metricLabel}
        </span>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.min(score, best)}
        aria-valuemin={0}
        aria-valuemax={best}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const MEDAL_TONES: Record<number, string> = {
  1: "bg-brand-yellow text-foreground",
  2: "bg-muted text-foreground",
  3: "bg-brand-yellow/40 text-foreground",
};

function LastWeekWinners({ winners, metricLabel }: { winners: LeaderboardHubEntry[]; metricLabel: string }) {
  return (
    <section aria-labelledby="last-week-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="last-week-heading" className="text-lg font-semibold tracking-[-0.02em]">
        Last week&apos;s winners
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Top three from the board that just closed.</p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {winners.map((winner) => (
          <li
            key={winner.rank}
            className={cn(
              "flex flex-col items-center rounded-xl border border-border px-3 py-5 text-center",
              winner.isYou ? "border-brand-yellow bg-brand-yellow/15" : "bg-muted/30"
            )}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full text-sm font-bold tabular-nums",
                MEDAL_TONES[winner.rank] ?? "bg-muted text-muted-foreground"
              )}
              aria-hidden
            >
              {winner.rank}
            </span>
            <span className={cn("mt-3 w-full truncate text-sm", winner.isYou ? "font-semibold" : "font-medium")}>
              <span className="sr-only">Place {winner.rank}: </span>
              {winner.isYou ? (winner.name ? `${winner.name} (You)` : "You") : winner.name}
            </span>
            <span className="mt-1 text-sm tabular-nums text-muted-foreground">
              {formatScore(winner.score, metricLabel)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LeaderboardPage({
  initial,
  initialSelection,
  courses,
  featuresEnabled,
}: {
  initial: LeaderboardHubView | null;
  initialSelection: HubSelection;
  courses: CourseOption[];
  featuresEnabled: boolean;
}) {
  const [selection, setSelection] = useState<HubSelection>(initialSelection);
  const [view, setView] = useState<LeaderboardHubView | null>(initial);
  const [pending, startTransition] = useTransition();
  const confettiRef = useLeaderboardConfetti(view);

  function run(work: () => Promise<LeaderboardHubView | null>) {
    startTransition(async () => {
      try {
        setView(await work());
      } catch {
        toast("Something went wrong. Please try again.", "error");
      }
    });
  }

  const select = (next: HubSelection) => {
    const withCourse =
      next.scope === "course" && !next.courseId ? { ...next, courseId: courses[0]?.courseId ?? null } : next;
    setSelection(withCourse);
    run(() => loadLeaderboardHub(withCourse));
  };

  const switchCourse = (next: string) => select({ ...selection, courseId: next });

  const join = () =>
    run(async () => {
      await setGamificationPreferences({ leaderboardOptIn: true });
      return loadLeaderboardHub(selection);
    });

  const leave = () =>
    run(async () => {
      await setGamificationPreferences({ leaderboardOptIn: false });
      return loadLeaderboardHub(selection);
    });

  if (!featuresEnabled) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <header className="border-b border-border pb-7">
          <p className="text-sm font-medium text-muted-foreground">Competition</p>
          <h1 className="mt-1 text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Leaderboard</h1>
        </header>
        <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">Leaderboards are off</h2>
          <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
            Game elements are hidden or unavailable on your account. You can turn them back on in profile settings.
          </p>
          <Link href="/settings/profile" className={cn(buttonVariants(), "mt-6")}>
            Open profile settings
          </Link>
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <header className="border-b border-border pb-7">
          <p className="text-sm font-medium text-muted-foreground">Competition</p>
          <h1 className="mt-1 text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Leaderboard</h1>
        </header>
        <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">Join a course first</h2>
          <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
            Boards are for learners. Enroll in a course, then come back to see how you compare.
          </p>
          <Link href="/catalog" className={cn(buttonVariants(), "mt-6")}>
            Browse courses
          </Link>
        </div>
      </div>
    );
  }

  const courseTitle =
    courses.find((course) => course.courseId === selection.courseId)?.title ??
    (view && view.status === "ready" ? view.courseTitle : null);

  const context = view && view.status === "ready" ? boardContext(view, courseTitle) : null;
  const bestLabel = selection.category === "streak" ? "Beat your longest streak" : "Beat your best week";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      {/* Consistent Header with Edorax standards */}
      <header className="border-b border-border pb-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Competition</p>
            <h1 className="mt-1 text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Leaderboard</h1>
            <p className="mt-2 max-w-xl text-base text-muted-foreground">
              Weekly leagues with promotion and demotion, plus all-time, speed and streak boards. Boards reset every Monday.
            </p>
          </div>
          <InfoTip label="About leaderboards" className="mt-1 shrink-0">
            <p>Four boards: weekly XP (your league, or one board per course), all-time XP, speed (chapters this week) and streak.</p>
            <p className="mt-2">Only learners who join appear, shown by first name and last initial. Weekly boards reset every Monday at 00:00 UTC.</p>
            <p className="mt-2">Leagues: each week the top 10% of your tier promote and the bottom 20% demote.</p>
          </InfoTip>
        </div>

        <div className="mt-6">
          <LeaderboardTabs selection={selection} pending={pending} onSelect={select} />
        </div>

        {selection.category === "weekly_xp" && selection.scope === "course" ? (
          courses.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={pending}
                aria-label={`Course: ${courseTitle ?? "Course"}`}
                className="mt-4 flex min-h-11 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate">{courseTitle}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-80 p-1.5">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Course</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selection.courseId ?? ""}
                    onValueChange={(next) => switchCourse(String(next))}
                  >
                    {courses.map((course) => (
                      <DropdownMenuRadioItem
                        key={course.courseId}
                        value={course.courseId}
                        className="min-h-11 py-2 pl-2 leading-5"
                      >
                        {course.title}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <p className="mt-4 text-sm font-medium text-foreground">{courseTitle}</p>
          )
        ) : null}
      </header>

      <div
        aria-busy={pending}
        className={cn(
          "mt-8 space-y-6 transition-opacity duration-150 motion-reduce:transition-none",
          pending && "opacity-60"
        )}
      >
        {!view ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl tracking-[-0.02em]">Board did not load</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">Something went wrong fetching this board.</p>
            <Button className="mt-6" onClick={() => run(() => loadLeaderboardHub(selection))} disabled={pending}>
              Try again
            </Button>
          </div>
        ) : view.status === "disabled" ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl tracking-[-0.02em]">No board here</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
              Try another category or course, or check back after you start learning.
            </p>
          </div>
        ) : view.status === "opt_in_required" ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center sm:px-10">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="size-7" aria-hidden />
            </span>
            <h2 className="mt-5 text-2xl tracking-[-0.02em]">Join the leaderboards</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
              See how your week compares with other learners. Only people who join can see the boards, and you can leave any time.
            </p>
            <Button className="mt-6" size="lg" onClick={join} disabled={pending}>
              Join leaderboards
            </Button>
          </div>
        ) : view.status === "unavailable" ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl tracking-[-0.02em]">Board unavailable</h2>
            <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
              {view.reason === "organization_disabled"
                ? "Your organization has turned leaderboards off for this course."
                : "Leaderboards are available while your enrollment is active."}
            </p>
          </div>
        ) : (
          <>
            {/* League Hero Card for Global Weekly XP, or Standard Standing Widget for other categories */}
            {view.league ? (
              <LeaderboardLeagueCard
                league={view.league}
                score={view.you.score}
                metricLabel={view.metricLabel}
                bestScore={view.you.bestScore}
                resetsAt={view.resetsAt}
              />
            ) : (
              <section aria-labelledby="your-standing-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
                  <p className="text-sm font-medium text-muted-foreground">Your place{context ? ` in ${context}` : ""}</p>
                  <h2 id="your-standing-heading" className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl">
                      #{view.you.rank}
                    </span>
                    <span className="text-base text-muted-foreground">of {formatNumber(view.groupSize)} learners</span>
                  </h2>
                </div>
                <div className="space-y-5 px-5 py-5 sm:px-6">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">{view.metricLabel === "XP" ? "XP" : view.metricLabel}</p>
                      <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-[-0.02em]">
                        {formatScore(view.you.score, view.metricLabel)}
                      </p>
                    </div>
                    {view.resetsAt ? (
                      <p className="text-sm tabular-nums text-muted-foreground" suppressHydrationWarning>
                        {resetLabel(view.resetsAt)}
                      </p>
                    ) : null}
                  </div>
                  {view.you.bestScore !== null && view.you.bestScore > 0 ? (
                    <BestScore
                      score={view.you.score}
                      best={view.you.bestScore}
                      metricLabel={view.metricLabel}
                      label={bestLabel}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Your first week on this board. Every chapter counts.</p>
                  )}
                </div>
              </section>
            )}

            {/* Standings List containing all entries (Podium + Neighborhood) */}
            <section ref={confettiRef}>
              <LeaderboardList entries={view.entries} metricLabel={view.metricLabel} league={view.league} />
            </section>

            {/* Previous Week's Winners */}
            {view.lastWeek ? <LastWeekWinners winners={view.lastWeek.winners} metricLabel={view.metricLabel} /> : null}

            {/* Leave leaderboards */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={leave}
                disabled={pending}
                className="rounded text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                Leave leaderboards
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
