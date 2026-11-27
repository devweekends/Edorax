"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { HandHelping, RotateCcw } from "lucide-react";
import { Dot } from "@/components/brand/dot";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Last line of defense for the "unknown component fails safely" acceptance
// criterion (docs/phases/m1-content-pipeline.mdx): publish-time validation
// should prevent unrenderable chapters, but if one slips through (e.g. it was
// imported before validation existed), the reader degrades instead of
// crashing the whole page.
//
// The page speaks to the learner: one calm sentence and three ways forward. Developer detail (the
// error message and its reference) shows only in development.
export default function ChapterReaderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ courseSlug: string; chapterSlug: string }>();
  const courseSlug = params.courseSlug ?? "";
  const chapterSlug = params.chapterSlug ?? "";

  const askHelpHref = courseSlug
    ? `/my-questions?course=${encodeURIComponent(courseSlug)}&chapter=${encodeURIComponent(chapterSlug)}`
    : "/my-questions";

  const connectionFailed = /fetch failed|Cannot reach the API server|API_UNAVAILABLE/i.test(error.message ?? "");
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <div className="mx-auto max-w-xl px-4 pb-12 pt-10 text-center">
      <div className="mx-auto w-fit">
        <Dot mood="oops" size={96} />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">This lesson did not load</h1>
      <p className="mx-auto mt-2 max-w-md text-base leading-7 text-muted-foreground" role="status">
        {connectionFailed
          ? "We could not reach the server. Check your connection and try again."
          : "It is not your fault. Try again, or go back to the course. If it keeps happening, ask your mentor."}
      </p>

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button type="button" size="lg" className="min-h-11 gap-2" onClick={() => reset()}>
          <RotateCcw className="size-4" aria-hidden />
          Try again
        </Button>
        <Link
          href={courseSlug ? `/courses/${courseSlug}` : "/my-courses"}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 justify-center")}
        >
          Go to the course
        </Link>
        <Link href={askHelpHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 justify-center gap-2")}>
          <HandHelping className="size-4" aria-hidden />
          Ask your mentor
        </Link>
      </div>

      {isDevelopment ? (
        <details className="mx-auto mt-8 max-w-xl rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Developer detail (development only)</summary>
          <p className="mt-2 break-words font-mono">{error.message}</p>
          {error.digest ? <p className="mt-1 font-mono">ref: {error.digest}</p> : null}
          {/Unknown field `|PrismaClientValidationError|column .* does not exist/i.test(error.message ?? "") ? (
            <p className="mt-2">
              The database schema looks out of date with the code. Run <code>pnpm db:ready</code>, restart the dev server and
              reload.
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
