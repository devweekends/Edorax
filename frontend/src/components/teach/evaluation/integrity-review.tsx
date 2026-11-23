"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  INTEGRITY_EVENT_LABELS,
  INTEGRITY_REVIEW_DECISIONS,
  INTEGRITY_REVIEW_LABELS,
  type IntegrityAttemptSummary,
  type IntegrityReviewDecision,
  type IntegrityReviewRecord,
} from "@/shared/api/integrity";

// The mentor's side of a flagged attempt: the risk hint, what drove it, and the one place a
// decision is recorded. The score only helps order the list. It is not evidence, and only a
// person ever picks a decision.

export function IntegrityReview({
  attempt,
}: {
  attempt: IntegrityAttemptSummary;
}) {
  const [review, setReview] = useState<IntegrityReviewRecord | null>(
    attempt.review,
  );
  const [note, setNote] = useState(attempt.review?.note ?? "");
  const [pending, setPending] = useState<IntegrityReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: IntegrityReviewDecision) => {
    setPending(decision);
    setError(null);
    try {
      setReview(
        await apiFetch<IntegrityReviewRecord>(
          `/api/v1/teach/integrity/attempts/${encodeURIComponent(attempt.id)}/review`,
          { method: "PUT", json: { decision, note: note.trim() || null } },
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your decision.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={attempt.risk.level === "LOW" ? "outline" : "secondary"}>
          Review priority: {attempt.risk.level.toLowerCase()} (
          {attempt.risk.score})
        </Badge>
        <span className="text-xs text-muted-foreground">
          {attempt.risk.reasons.length
            ? `Mostly: ${attempt.risk.reasons
                .slice(0, 3)
                .map(
                  (reason) =>
                    `${INTEGRITY_EVENT_LABELS[reason.type].toLowerCase()} ×${reason.count}`,
                )
                .join(", ")}`
            : "Nothing raised the priority."}{" "}
          A hint for ordering the list, not proof.
        </span>
      </div>
      <label className="block text-xs font-medium">
        Your note (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          rows={2}
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm font-normal"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {INTEGRITY_REVIEW_DECISIONS.map((decision) => (
          <Button
            key={decision}
            type="button"
            size="sm"
            variant={review?.decision === decision ? "default" : "outline"}
            disabled={pending !== null}
            onClick={() => void decide(decision)}
          >
            {pending === decision
              ? "Saving…"
              : INTEGRITY_REVIEW_LABELS[decision]}
          </Button>
        ))}
      </div>
      {review ? (
        <p className="text-xs text-muted-foreground">
          {INTEGRITY_REVIEW_LABELS[review.decision]} by {review.reviewerName} on{" "}
          {new Date(review.reviewedAt).toLocaleDateString()}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
