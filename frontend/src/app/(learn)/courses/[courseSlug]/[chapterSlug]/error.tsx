"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HandHelping, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

// Last line of defense for the "unknown component fails safely" acceptance
// criterion (docs/phases/m1-content-pipeline.mdx): publish-time validation
// should prevent unrenderable chapters, but if one slips through (e.g. it was
// imported before validation existed), the reader degrades instead of
// crashing the whole page.
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
  const [continueHref, setContinueHref] = useState<string | null>(null);

  useEffect(() => {
    if (!courseSlug) return;
    let cancelled = false;
    apiFetch<{ href: string | null }>(`/api/v1/courses/${encodeURIComponent(courseSlug)}/continue`)
      .then((body) => {
        if (!cancelled && body.href) setContinueHref(body.href);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  const askHelpHref = courseSlug
    ? `/my-questions?course=${encodeURIComponent(courseSlug)}&chapter=${encodeURIComponent(chapterSlug)}`
    : "/my-questions";

  const connectionFailed = /fetch failed|Cannot reach the API server|API_UNAVAILABLE/i.test(error.message);
  const schemaStale =
    /Unknown field `|PrismaClientValidationError|column .* does not exist/i.test(
      error.message ?? ""
    );

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-8">
      <div className="rounded-xl border border-brand-yellow bg-brand-yellow/15 p-6">
        <h1 className="text-lg font-semibold text-foreground">
          This chapter can&apos;t be displayed right now
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {connectionFailed ? (
            <>The server is temporarily unreachable. Please try again in a moment.</>
          ) : schemaStale ? (
            <>
              The app database schema is out of date with the code (common after pulling
              updates). An admin should run{" "}
              <code className="rounded bg-brand-yellow/15 px-1 py-0.5 text-xs">
                pnpm db:ready
              </code>{" "}
              and restart the dev server, then reload this page.
            </>
          ) : (
            <>
              The chapter could not load. The server may be temporarily unavailable,
              or there may be a problem with the lesson content.
              You can try again, skip to another unlocked lesson, or ask your mentor for help.
            </>
          )}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="gap-1.5 bg-brand-yellow text-white hover:bg-brand-yellow"
            onClick={() => reset()}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Try again
          </Button>
          {continueHref &&
          continueHref !== `/courses/${courseSlug}/${chapterSlug}` &&
          continueHref !== `/courses/${courseSlug}/${chapterSlug.replace(/--[a-z0-9]+$/i, "")}` ? (
            <Link
              href={continueHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              <SkipForward className="size-3.5" aria-hidden />
              Go to next unlocked lesson
            </Link>
          ) : courseSlug ? (
            <Link
              href={`/courses/${courseSlug}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              <SkipForward className="size-3.5" aria-hidden />
              Back to course overview
            </Link>
          ) : null}
          <Link
            href={askHelpHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand-yellow bg-card px-3 text-sm font-medium text-foreground hover:bg-brand-yellow/15"
          >
            <HandHelping className="size-3.5" aria-hidden />
            Ask mentor
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-foreground">ref: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
