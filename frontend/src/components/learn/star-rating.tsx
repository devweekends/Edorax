"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Dot } from "@/components/brand/dot";
import { playRatingStarSound } from "@/lib/rating-sound";
import { cn } from "@/lib/utils";

export const RATING_LABELS: Record<number, string> = {
  1: "Needs work",
  2: "Fair",
  3: "Good",
  4: "Really good",
  5: "Loved it!",
};

/** Read-only 1–5 stars with fractional fill for averages like 4.7. */
export function StarRating({
  value,
  size = 16,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  const stars = Array.from({ length: 5 }, (_, index) => (
    <Star key={index} style={{ width: size, height: size }} aria-hidden />
  ));
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      <span className="flex text-muted-foreground/30">{stars}</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${percent}%` }}>
        <span className="flex text-amber-500 [&>svg]:fill-current">{stars}</span>
      </span>
    </span>
  );
}

/** Interactive 1–5 stars for the rating form with hover preview and tactile sound effects. */
export function StarRatingInput({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const [hovered, setHovered] = useState(0);
  const activeCount = hovered > 0 ? hovered : value;

  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="radiogroup"
      aria-label="Course rating"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= activeCount;
        const selected = star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"} — ${RATING_LABELS[star]}`}
            disabled={disabled}
            onMouseEnter={() => {
              if (!disabled) setHovered(star);
            }}
            onClick={() => {
              const next = value === star ? 0 : star;
              playRatingStarSound(next);
              onChange(next);
            }}
            className={cn(
              "group relative grid place-items-center rounded-[10px] transition-all duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
              size === "lg" ? "size-11" : "size-10",
              !disabled && "hover:scale-110 active:scale-95",
              selected
                ? "text-amber-500 [&>svg]:fill-[#FFC933] [&>svg]:stroke-amber-500"
                : filled
                  ? "text-amber-400/85 [&>svg]:fill-[#FFC933]/65 [&>svg]:stroke-amber-500/80"
                  : "text-muted-foreground/35 hover:text-amber-500/70",
            )}
          >
            <Star className={cn(size === "lg" ? "size-8" : "size-7", "transition-transform")} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** For 1–5 stars, show Happy Dot yipping; for 0 stars, keep it simple. */
export function RatingHappyDot({
  rating,
  size = 76,
  compact = false,
}: {
  rating: number;
  size?: number;
  compact?: boolean;
}) {
  if (rating < 1) return null;
  const label = RATING_LABELS[rating] ?? "Great";
  return (
    <div
      key={rating}
      data-testid="rating-happy-dot"
      className={cn(
        "flex items-center justify-center gap-3 rounded-[14px] border border-primary/15 bg-secondary/60",
        compact ? "px-3.5 py-2.5" : "flex-col px-4 py-3.5 text-center",
      )}
    >
      <div className="dot-yip shrink-0">
        <Dot mood="cheer" size={size} />
      </div>
      <div className={cn(compact ? "text-left" : "flex flex-col items-center")}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-0.5 text-xs font-bold text-primary shadow-2xs">
          <span>{rating}★</span>
          <span aria-hidden>·</span>
          <span>{label}</span>
        </span>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Yippee! Thanks for sharing how the course feels.
        </p>
      </div>
    </div>
  );
}
