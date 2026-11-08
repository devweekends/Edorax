"use client";

import { useEffect } from "react";
import { Flame, Snowflake, Sparkles } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { showsGameElements } from "@/lib/gamification";
import { useBrowserStorage, useHydrated } from "@/lib/use-browser-storage";
import type { GamificationSummary } from "@/shared/api/gamification";
import type { DashboardCourse } from "@/shared/api/learner";

// XP, level, streak and freezes on the mentee dashboard. Everything here respects the server's
// feature flags (a switched-off part arrives as null) and "hide game elements" (nothing renders).

const LEVEL_SEEN_KEY = "buildment:gamification:level-seen";
const numberFormat = new Intl.NumberFormat();

function shortDay(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function FreezeSlots({ available, max }: { available: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: max }, (_, index) => (
        <Snowflake
          key={index}
          className={cn("size-3.5", index < available ? "text-primary" : "text-muted-foreground/40")}
          strokeWidth={index < available ? 2.25 : 1.75}
        />
      ))}
    </span>
  );
}

function StreakRow({ streak, freezes }: { streak: number; freezes: GamificationSummary["freezes"] }) {
  const lastCovered = freezes?.recentlyCoveredDays[0];
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          streak > 0 ? "bg-brand-yellow/15 text-foreground" : "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        <Flame className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold tabular-nums">
            {streak === 0 ? "No streak yet" : `${streak}-day streak`}
          </p>
          <InfoTip label="About streaks">
            <p>Your streak counts the days in a row you study, in your own timezone. Today stays open until midnight.</p>
            <p className="mt-2">One missed day is forgiven when you come back the next day.</p>
            {freezes ? (
              <p className="mt-2">
                Streak freezes cover further missed days on their own. Earn one each week you meet your weekly goal, and hold up to {freezes.max}.
              </p>
            ) : null}
          </InfoTip>
        </div>
        {freezes ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <FreezeSlots available={freezes.available} max={freezes.max} />
            <span>
              {freezes.available} of {freezes.max} streak freezes
            </span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">One step at a time.</p>
        )}
        {lastCovered ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            A streak freeze covered {shortDay(lastCovered)}, so your streak kept going.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LevelRow({ level, xp }: { level: NonNullable<GamificationSummary["level"]>; xp: NonNullable<GamificationSummary["xp"]> }) {
  const hydrated = useHydrated();
  const [seen, setSeen] = useBrowserStorage(LEVEL_SEEN_KEY, "0");
  const seenLevel = Number(seen) || 0;
  // A quiet highlight the first time this browser sees a new level; the mascot does the cheering.
  const levelledUp = hydrated && seenLevel > 0 && level.level > seenLevel;

  useEffect(() => {
    if (!hydrated || seenLevel === level.level) return;
    if (seenLevel === 0 || level.level < seenLevel) {
      setSeen(String(level.level));
      return;
    }
    const timer = window.setTimeout(() => setSeen(String(level.level)), 6_000);
    return () => window.clearTimeout(timer);
  }, [hydrated, seenLevel, level.level, setSeen]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold tabular-nums text-primary-foreground",
            levelledUp && "ring-4 ring-primary/20 motion-safe:animate-pulse"
          )}
        >
          {level.level}
        </span>
        <p className="text-sm font-semibold">Level {level.level}</p>
        {levelledUp ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary" role="status">
            <Sparkles className="size-3.5" aria-hidden /> Level up!
          </span>
        ) : null}
        <InfoTip label="About XP and levels" className="ml-auto">
          <p>XP rewards finished learning: 20 for a chapter, extra for passing a quiz (most on the first try), 15 for an answer your mentor approves, 100 for finishing a course and 25 for meeting your weekly goal.</p>
          <p className="mt-2">Each level needs a little more XP than the last. Logging in alone never earns XP.</p>
        </InfoTip>
      </div>
      <Progress
        value={level.percent}
        aria-label={`Progress to level ${level.level + 1}`}
        className="mt-3 gap-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:duration-500 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
      >
        <ProgressLabel className="text-xs font-normal text-muted-foreground">
          {numberFormat.format(level.toNext)} XP to level {level.level + 1}
        </ProgressLabel>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {numberFormat.format(level.intoLevel)} / {numberFormat.format(level.levelSpan)}
        </span>
      </Progress>
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">+{numberFormat.format(xp.thisWeek)} XP</span> this week ·{" "}
        <span className="tabular-nums">{numberFormat.format(xp.total)}</span> XP total
      </p>
    </div>
  );
}

/** Streak, freezes, level and XP: the top of the "This week" card. */
export function LearningMomentum({ summary, streak }: { summary: GamificationSummary; streak: number }) {
  if (!showsGameElements(summary)) return null;
  return (
    <div className="mt-4 space-y-4 rounded-xl border bg-muted/20 p-4">
      <StreakRow streak={streak} freezes={summary.freezes} />
      {summary.level && summary.xp ? (
        <div className="border-t border-border pt-4">
          <LevelRow level={summary.level} xp={summary.xp} />
        </div>
      ) : summary.xp ? (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">+{numberFormat.format(summary.xp.thisWeek)} XP</span> this week ·{" "}
          {numberFormat.format(summary.xp.total)} XP total
        </p>
      ) : null}
      {summary.career ? (
        <div className="border-t border-border pt-4">
          <CareerRow career={summary.career} />
        </div>
      ) : null}
    </div>
  );
}

/** The permanent career tier and progress toward the next one. */
function CareerRow({ career }: { career: NonNullable<GamificationSummary["career"]> }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
          {career.title}
        </span>
        <p className="text-sm font-semibold">
          {career.title} <span className="font-normal text-muted-foreground">· {career.tierIndex} of {career.totalTiers}</span>
        </p>
        {career.nextTitle ? (
          <span className="ml-auto text-xs text-muted-foreground">Next: {career.nextTitle}</span>
        ) : null}
        <InfoTip label="About the career path">
          <p>Your career tier is earned from completed courses and your average quiz score — and it is never lost.</p>
          <p className="mt-2">The career is your permanent level of mastery, separate from your weekly league tier.</p>
        </InfoTip>
      </div>
      {career.requiredForNext ? (
        <Progress
          value={career.percent}
          aria-label={`Progress to ${career.nextTitle}`}
          className="mt-3 gap-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:duration-500 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
        >
          <ProgressLabel className="text-xs font-normal text-muted-foreground">
            {career.completedCourses}/{career.requiredForNext.courses} courses · {career.avgScore}% avg · need {career.requiredForNext.minScore}%
          </ProgressLabel>
        </Progress>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">You&apos;ve reached the top of the career path.</p>
      )}
    </>
  );
}

/** "Stage 2 of 5 · Module" with an optional course-XP chip, for course cards and the hero. */
export function CourseStageLine({ course, className }: { course: DashboardCourse; className?: string }) {
  if (!course.stage && course.xp === null) {
    return course.currentModule ? <p className={cn("truncate text-xs text-muted-foreground", className)}>{course.currentModule}</p> : null;
  }
  return (
    <p className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      {course.stage ? (
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">
            Stage {course.stage.current} of {course.stage.total}
          </span>{" "}
          · {course.stage.title}
        </span>
      ) : course.currentModule ? (
        <span className="min-w-0 truncate">{course.currentModule}</span>
      ) : null}
      {course.xp !== null ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums text-foreground">
          {numberFormat.format(course.xp)} XP
        </span>
      ) : null}
    </p>
  );
}
