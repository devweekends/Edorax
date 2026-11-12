"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { fireMiniConfetti } from "@buildment/learning-ui/components/learn/mini-confetti";
import { dismissCourseRatingAction, saveCourseRatingAction } from "@/server/actions/course-rating";
import { RatingHappyDot, StarRatingInput } from "@/components/learn/star-rating";
import { playRatingPromptSound, playRatingSubmitSound, useRatingSound } from "@/lib/rating-sound";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROMPT_OPEN_DELAY_MS = 320;

function promptStorageKey(courseSlug: string) {
  return `buildment:rating-prompt-handled:${courseSlug}`;
}

export function CourseRatingModal({
  open,
  onClose,
  courseSlug,
  courseTitle,
  badgeLabel = "Course review",
  dismissLabel = "Cancel",
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  courseSlug: string;
  courseTitle?: string;
  badgeLabel?: string;
  dismissLabel?: string;
  onSubmitted?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confettiAnchorRef = useRef<HTMLDivElement>(null);
  const [soundOn, setSoundOn] = useRatingSound();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function handleClose() {
    if (pending) return;
    setRating(0);
    setReview("");
    setSaved(false);
    setError(null);
    onClose();
  }

  async function submit() {
    if (rating < 1) {
      setError("Choose a star rating first.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await saveCourseRatingAction({ courseSlug, rating, review: review.trim() || null });
    setPending(false);
    if (res.ok) {
      playRatingSubmitSound();
      if (confettiAnchorRef.current) {
        fireMiniConfetti(confettiAnchorRef.current);
      }
      setSaved(true);
      onSubmitted?.();
    } else {
      setError(res.error);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), textarea:not(:disabled), a[href]",
        );
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
      aria-labelledby="course-rating-title"
      aria-describedby="course-rating-description"
      className="fixed inset-0 z-50 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[27rem] overflow-hidden rounded-[18px] border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
    >
      {open ? (
        <div ref={confettiAnchorRef} className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto">
          <div className="h-1.5 w-full shrink-0 bg-primary" aria-hidden />

          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold tracking-wide text-primary">
                <Sparkles className="size-3.5" aria-hidden />
                {badgeLabel}
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSoundOn(!soundOn)}
                  aria-label={soundOn ? "Mute rating sound effects" : "Enable rating sound effects"}
                  aria-pressed={soundOn}
                  title={soundOn ? "Sound effects on" : "Sound effects muted"}
                  className={cn(
                    "grid size-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-yellow",
                    soundOn && "text-primary",
                  )}
                >
                  {soundOn ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="grid size-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-yellow"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {saved ? (
              <div className="mt-4 text-center">
                <RatingHappyDot rating={rating || 5} size={84} />
                <h2
                  id="course-rating-title"
                  className="mt-4 font-heading text-xl font-bold tracking-tight text-foreground"
                >
                  Thanks for your review!
                </h2>
                <p id="course-rating-description" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Your rating helps future learners choose with confidence and helps us keep improving this course.
                </p>
                <Button type="button" onClick={handleClose} className="mt-5 min-h-11 w-full rounded-[10px] font-semibold">
                  Continue learning
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-3.5">
                  <h2
                    id="course-rating-title"
                    className="font-heading text-lg font-bold leading-snug tracking-tight text-foreground sm:text-[21px]"
                  >
                    {courseTitle ? `How is ${courseTitle} going?` : "Rate this course"}
                  </h2>
                  <p id="course-rating-description" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Your honest rating helps other learners decide and shapes future updates.
                  </p>
                </div>

                {rating > 0 ? (
                  <div className="mt-4">
                    <RatingHappyDot rating={rating} size={76} />
                  </div>
                ) : null}

                <div
                  className={cn(
                    "mt-4 flex flex-col items-center rounded-[14px] border border-border bg-muted/25 px-4 py-3.5",
                    rating > 0 && "mt-3",
                  )}
                >
                  <StarRatingInput value={rating} onChange={setRating} disabled={pending} size="lg" />
                  {rating === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">Tap a star to rate</p>
                  ) : null}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <label htmlFor="course-rating-review" className="font-medium text-foreground/80">
                      Written review <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    {review.length > 0 ? (
                      <span className="font-mono tabular-nums">{review.length}/1000</span>
                    ) : null}
                  </div>
                  <textarea
                    id="course-rating-review"
                    value={review}
                    onChange={(event) => setReview(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="What stood out, or what could be clearer?"
                    className="w-full resize-y rounded-[12px] border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>

                {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

                <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleClose}
                    disabled={pending}
                    className="rounded-[10px]"
                  >
                    {dismissLabel}
                  </Button>
                  <Button
                    type="button"
                    onClick={submit}
                    disabled={rating < 1 || pending}
                    className="min-w-36 rounded-[10px] font-semibold"
                  >
                    {pending ? "Saving…" : "Submit review"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * One-time pop-up shown once the learner has finished more than half of the
 * course and moves on to the next chapter. Dismissing or submitting remembers
 * the choice so it never interrupts subsequent lessons.
 */
export function CourseRatingPrompt({
  courseSlug,
  courseTitle,
  shouldPrompt,
}: {
  courseSlug: string;
  courseTitle: string;
  shouldPrompt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const handledRef = useRef(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!shouldPrompt || handledRef.current) return;
    try {
      if (window.sessionStorage.getItem(promptStorageKey(courseSlug)) === "1") {
        handledRef.current = true;
        return;
      }
    } catch {
      // sessionStorage unavailable
    }
    const timer = window.setTimeout(() => {
      playRatingPromptSound();
      setOpen(true);
    }, PROMPT_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [courseSlug, shouldPrompt]);

  function markHandled() {
    handledRef.current = true;
    try {
      window.sessionStorage.setItem(promptStorageKey(courseSlug), "1");
    } catch {
      // sessionStorage unavailable
    }
  }

  function handleClose() {
    setOpen(false);
    markHandled();
    if (!submittedRef.current) {
      void dismissCourseRatingAction({ courseSlug });
    }
  }

  return (
    <CourseRatingModal
      open={open}
      onClose={handleClose}
      courseSlug={courseSlug}
      courseTitle={courseTitle}
      badgeLabel="Halfway milestone"
      dismissLabel="Not now"
      onSubmitted={() => {
        submittedRef.current = true;
        markHandled();
      }}
    />
  );
}
