"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { CourseRatingModal } from "@/components/learn/course-rating-modal";

/**
 * The on-demand path left after the learner dismisses the full prompt.
 * Clicking it opens the rating modal; it never expands on its own.
 */
export function CourseRatingLink({
  courseSlug,
  courseTitle,
}: {
  courseSlug: string;
  courseTitle?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Star className="size-4" aria-hidden /> Rate this course
      </button>

      <CourseRatingModal
        open={open}
        onClose={() => setOpen(false)}
        courseSlug={courseSlug}
        courseTitle={courseTitle}
        dismissLabel="Cancel"
        onSubmitted={() => router.refresh()}
      />
    </>
  );
}
