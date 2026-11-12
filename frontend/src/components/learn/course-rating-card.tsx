"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Pencil, Star } from "lucide-react";
import { fireMiniConfetti } from "@buildment/learning-ui/components/learn/mini-confetti";
import {
  saveCourseRatingAction,
  dismissCourseRatingAction,
  type CourseRatingView,
} from "@/server/actions/course-rating";
import { RatingHappyDot, StarRating, StarRatingInput } from "@/components/learn/star-rating";
import { playRatingSubmitSound } from "@/lib/rating-sound";
import { Button } from "@/components/ui/button";

/**
 * Course overview rating bar, unlocked once the learner finishes more than half
 * of the course. Skippable, editable, and kept simple at 0 stars with Happy Dot
 * yipping once any star (1–5) is chosen.
 */
export function CourseRatingCard({
  courseSlug,
  courseTitle,
  initialRating,
  initialDismissed = false,
}: {
  courseSlug: string;
  courseTitle: string;
  initialRating: CourseRatingView | null;
  initialDismissed?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(initialRating?.rating ?? 0);
  const [review, setReview] = useState(initialRating?.review ?? "");
  const [saved, setSaved] = useState<CourseRatingView | null>(initialRating);
  const [editing, setEditing] = useState(!initialRating);
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function notNow() {
    setPending(true);
    await dismissCourseRatingAction({ courseSlug });
    setPending(false);
    setDismissed(true);
    setEditing(false);
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
      if (cardRef.current) {
        fireMiniConfetti(cardRef.current);
      }
      setSaved(res.data);
      setEditing(false);
    } else {
      setError(res.error);
    }
  }

  if (dismissed && !saved && !editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">Ready to share how this course is going?</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <Star className="size-4" aria-hidden /> Rate this course
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Course rating">
      <div
        ref={cardRef}
        className="overflow-hidden rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-2xs sm:p-6"
      >
        {saved && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-bold text-foreground">Your rating</span>
                <StarRating value={saved.rating} size={18} />
                <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                  {saved.rating}.0 / 5
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" aria-hidden /> Saved
                </span>
              </div>
              {saved.review ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{saved.review}&rdquo;
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="gap-1.5 rounded-[10px]"
            >
              <Pencil className="size-3.5" aria-hidden /> Edit review
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold tracking-tight text-foreground sm:text-lg">
                  How is {courseTitle} going?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;re past the halfway mark — your rating helps other learners decide and helps us improve.
                </p>
              </div>
              <div className="shrink-0">
                <StarRatingInput value={rating} onChange={setRating} disabled={pending} />
              </div>
            </div>

            {rating > 0 ? (
              <div className="mt-4">
                <RatingHappyDot rating={rating} size={64} compact />
              </div>
            ) : null}

            <label className="mt-4 block text-sm">
              <span className="sr-only">Review (optional)</span>
              <textarea
                value={review}
                onChange={(event) => setReview(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Anything you want to add? (optional)"
                className="w-full resize-y rounded-[12px] border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>

            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {!saved ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={notNow}
                  disabled={pending}
                  className="rounded-[10px]"
                >
                  Not now
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRating(saved.rating);
                    setReview(saved.review ?? "");
                    setEditing(false);
                  }}
                  disabled={pending}
                  className="rounded-[10px]"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={submit}
                disabled={pending || rating < 1}
                className="rounded-[10px] font-semibold"
              >
                {pending ? "Saving…" : saved ? "Update review" : "Submit review"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
