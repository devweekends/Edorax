"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markChapterComplete } from "@/server/actions/progress";
import { acknowledgeStreakMilestone } from "@/server/actions/weekly-goal";
import type { StreakMilestone } from "@/shared/lib/streak";
import { cn } from "@/lib/utils";
import { fireMiniConfetti } from "@buildment/learning-ui/components/learn/mini-confetti";
import { ChapterCompleteCelebrationModal } from "@/components/learn/chapter-complete-celebration-modal";
import { scrollToNextCheckpoint } from "@buildment/learning-ui/components/learn/checkpoint-marker";
import { playFeedback } from "@/lib/sound-feedback";
import { toast } from "@/components/ui/app-toast";
import { useMascot } from "@/lib/engagement/use-mascot";

const MODAL_OPEN_DELAY_MS = 200;

export function ChapterCompletionStrip(props: {
  chapterId: string;
  nextLocked: boolean;
  chapterComplete: boolean;
  canMarkComplete: boolean;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  nextHref?: string;
  nextTitle?: string;
  reflectionPending?: boolean;
  courseCompleted: number;
  courseTotal: number;
  recap?: { checks: string; open: string; next: string };
  streakMilestone?: StreakMilestone | null;
}) {
  return <ChapterCompletionMoment key={props.chapterId} {...props} />;
}

type CelebrationPhase = "idle" | "burst" | "modal";

function ChapterCompletionMoment({
  chapterId,
  nextLocked,
  chapterComplete,
  canMarkComplete,
  checkpointsCompleted,
  checkpointsTotal,
  nextHref,
  nextTitle,
  reflectionPending = false,
  courseCompleted,
  courseTotal,
  recap,
  streakMilestone = null,
}: {
  chapterId: string;
  nextLocked: boolean;
  chapterComplete: boolean;
  canMarkComplete: boolean;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  nextHref?: string;
  nextTitle?: string;
  reflectionPending?: boolean;
  courseCompleted: number;
  courseTotal: number;
  recap?: { checks: string; open: string; next: string };
  streakMilestone?: StreakMilestone | null;
}) {
  const router = useRouter();
  const [completionSaved, setCompletionSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [celebrationPhase, setCelebrationPhase] = useState<CelebrationPhase>("idle");
  const [mounted, setMounted] = useState(false);
  const modalTimerRef = useRef<number | null>(null);
  const celebrationAnchorRef = useRef<HTMLDivElement>(null);
  const { track } = useMascot();

  useEffect(() => {
    const onReflectionComplete = () => {
      router.refresh();
    };
    window.addEventListener("buildment:reflection-complete", onReflectionComplete);
    return () => window.removeEventListener("buildment:reflection-complete", onReflectionComplete);
  }, [router]);

  // Until the client hydrates the button is inert server-rendered HTML; keep it disabled so an early
  // click can't silently do nothing (it becomes interactive as soon as hydration completes).
  useEffect(() => {
    setMounted(true);
  }, []);

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function beginCelebration() {
    if (celebrationPhase !== "idle") return;
    setCelebrationPhase("burst");
  }

  useEffect(() => {
    if (celebrationPhase !== "burst") return;

    const reduced = prefersReducedMotion();
    if (reduced) {
      playFeedback("completion");
      const timer = window.setTimeout(() => setCelebrationPhase("modal"), 0);
      if (streakMilestone) void acknowledgeStreakMilestone(streakMilestone);
      return () => window.clearTimeout(timer);
    }

    if (celebrationAnchorRef.current) {
      fireMiniConfetti(celebrationAnchorRef.current);
    }
    playFeedback("completion");
    if (streakMilestone) void acknowledgeStreakMilestone(streakMilestone);

    modalTimerRef.current = window.setTimeout(() => {
      setCelebrationPhase("modal");
    }, MODAL_OPEN_DELAY_MS);

    return () => {
      if (modalTimerRef.current != null) {
        window.clearTimeout(modalTimerRef.current);
        modalTimerRef.current = null;
      }
    };
  }, [celebrationPhase, streakMilestone]);

  function closeCelebration() {
    if (modalTimerRef.current != null) {
      window.clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }
    setCelebrationPhase("idle");
  }

  function onMark() {
    setError(null);
    startTransition(async () => {
      const result = await markChapterComplete({ chapterId });
      if (!result.ok) {
        setError(result.error);
        toast(result.error);
        return;
      }
      setCompletionSaved(true);
      beginCelebration();
      track({ type: "chapter_completed", chapterId });
      router.refresh();
    });
  }

  const isComplete = chapterComplete || completionSaved;
  const remaining = Math.max(0, checkpointsTotal - checkpointsCompleted);
  const hasCheckpoints = checkpointsTotal > 0;

  let statusLine: string;
  if (isComplete) {
    statusLine = "Chapter complete. Your progress is saved.";
  } else if (reflectionPending) {
    statusLine = nextLocked
      ? "Complete the checklist and learning log to save your reflection and open the next chapter."
      : "Complete the checklist and learning log when you are ready.";
  } else if (canMarkComplete) {
    if (!hasCheckpoints) {
      statusLine = "Mark this chapter complete when you have finished reading.";
    } else {
      statusLine = nextLocked
        ? "All checkpoints are done. Mark complete to unlock the next lesson."
        : "All checkpoints are done. Mark this chapter complete when you are ready.";
    }
  } else if (hasCheckpoints) {
    statusLine = `${checkpointsCompleted} of ${checkpointsTotal} checkpoints complete. Take the next one when you are ready.`;
  } else {
    statusLine = "Mark complete when you are ready to move on.";
  }

  return (
    <>
      <div
        ref={celebrationAnchorRef}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your progress
          </p>
          <p
            className={cn(
              "mt-1 text-sm leading-relaxed",
              isComplete ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {statusLine}
          </p>
          {hasCheckpoints && !isComplete ? (
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              {checkpointsCompleted}/{checkpointsTotal} checkpoints
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="shrink-0 sm:pl-4">
          {isComplete ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              Completed
            </span>
          ) : reflectionPending ? (
            <span className="inline-flex h-10 w-full min-w-44 items-center justify-center rounded-lg border border-border bg-muted px-4 text-sm font-medium text-muted-foreground sm:w-auto">
              Complete your reflection
            </span>
          ) : canMarkComplete ? (
            <Button
              type="button"
              size="sm"
              onClick={onMark}
              loading={pending}
              disabled={pending || !mounted}
              className="h-10 w-full min-w-44 rounded-lg px-5 text-sm font-medium sm:w-auto"
            >
              {pending ? "Saving…" : "Mark chapter complete"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={scrollToNextCheckpoint}
              className="h-10 w-full min-w-44 gap-2 rounded-lg px-5 text-sm font-medium sm:w-auto"
            >
              <ArrowUp className="size-4 shrink-0" aria-hidden />
              {remaining === 1
                ? "Go to the final checkpoint"
                : "Go to next checkpoint"}
            </Button>
          )}
        </div>
      </div>

      <ChapterCompleteCelebrationModal
        open={celebrationPhase === "modal"}
        onClose={closeCelebration}
        recap={recap}
        streakMilestone={streakMilestone}
        courseCompleted={courseCompleted + (!chapterComplete && completionSaved ? 1 : 0)}
        courseTotal={courseTotal}
        nextHref={nextLocked && !isComplete ? undefined : nextHref}
        nextTitle={nextTitle}
      />
    </>
  );
}
