"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress, ProgressLabel } from "@/components/ui/progress";

export function ChapterCompleteCelebrationModal({
  open,
  onClose,
  recap,
  streakMilestone,
  courseCompleted,
  courseTotal,
  nextHref,
  nextTitle,
}: {
  open: boolean;
  onClose: () => void;
  recap?: { checks: string; open: string; next: string };
  streakMilestone?: number | null;
  /** Confirmed total, including the chapter just completed. */
  courseCompleted: number;
  courseTotal: number;
  nextHref?: string;
  nextTitle?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const completed = Math.min(courseTotal, Math.max(0, courseCompleted));
  const percent = courseTotal > 0 ? Math.round((completed / courseTotal) * 100) : 0;
  const courseComplete = courseTotal > 0 && completed === courseTotal;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      aria-labelledby="chapter-complete-title"
      aria-describedby="chapter-complete-description"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground backdrop:bg-foreground/30 sm:p-6"
    >
      {open ? <>
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-primary motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200">
            <CheckCircle2 className="size-7" aria-hidden />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close celebration" className="size-11">
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <p className="mt-4 text-sm font-medium text-muted-foreground">Progress saved</p>
        <h2 id="chapter-complete-title" className="mt-1 text-2xl font-semibold tracking-tight">
          {courseComplete ? "You completed the course" : "You finished this chapter"}
        </h2>
        <p id="chapter-complete-description" className="mt-3 text-sm leading-6 text-muted-foreground">
          {courseComplete
            ? "Your time and effort brought you here. You can return to any chapter to review what you have learned."
            : "You made time to learn, and it adds up. Continue when you are ready, or take a break here."}
        </p>
        {recap ? (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
            <li>{recap.checks}</li>
            <li>{recap.open}</li>
            <li>{recap.next}</li>
          </ul>
        ) : null}
        {streakMilestone ? (
          <p className="mt-3 text-sm font-medium">{streakMilestone} days of learning. Each visit is part of your progress.</p>
        ) : null}
        {courseTotal > 0 ? (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <Progress value={percent} className="gap-3 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:duration-200 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none">
              <ProgressLabel className="text-sm">Course progress</ProgressLabel>
              <span className="ml-auto text-sm font-semibold tabular-nums">{completed} of {courseTotal}</span>
            </Progress>
            <p className="mt-2 text-xs text-muted-foreground">{percent}% complete</p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {courseComplete ? (
            <Link href="/my-courses" className={buttonVariants({ className: "min-h-11" })}>View my courses <ArrowRight aria-hidden /></Link>
          ) : nextHref ? (
            <Link href={nextHref} className={cn(buttonVariants(), "h-auto min-h-11 whitespace-normal py-3 text-center")}>
              {nextTitle ? `Continue to ${nextTitle}` : "Continue to the next chapter"}
              <ArrowRight className="shrink-0" aria-hidden />
            </Link>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11">
            {nextHref && !courseComplete ? "Pause here" : "Back to lesson"}
          </Button>
        </div>
      </> : null}
    </dialog>
  );
}
