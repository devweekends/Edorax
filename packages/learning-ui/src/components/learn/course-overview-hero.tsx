import type { ReactNode } from "react";
import { CourseLink as Link } from "./course-navigation";
import { ArrowRight, BookOpen, Clock3, Layers3, MessageSquareText, Target } from "lucide-react";
import { buttonVariants } from "../ui/button";
import { Badge } from "../ui/badge";
import { CourseCover } from "./course-cover";
import { cn } from "../../lib/utils";

type CourseOverviewHeroProps = {
  difficulty: string | null;
  title: string;
  description: string | null;
  projectGoal: string | null;
  coverUrl?: string | null;
  instructorName?: string | null;
  percentComplete: number;
  chaptersCompleted?: number;
  chaptersTotal?: number;
  pendingReviews?: number;
  continueHref: string | null;
  continueLabel: string;
  moduleCount: number;
  chapterCount: number;
  estimatedHours: number | null;
  /** Host-provided content under the continue button, e.g. the on-demand rating link. */
  ratingLink?: ReactNode;
};

function splitTitle(title: string) {
  const parts = title.split(" — ");
  if (parts.length < 2) return { lead: null, rest: title };
  return { lead: parts[0], rest: parts.slice(1).join(" — ") };
}

export function CourseOverviewHero({
  difficulty,
  title,
  description,
  projectGoal,
  coverUrl,
  instructorName,
  percentComplete,
  chaptersCompleted,
  chaptersTotal,
  pendingReviews = 0,
  continueHref,
  continueLabel,
  moduleCount,
  chapterCount,
  estimatedHours,
  ratingLink,
}: CourseOverviewHeroProps) {
  const { lead, rest } = splitTitle(title);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      <CourseCover coverUrl={coverUrl} title={title} aspect="banner" className="rounded-none border-b border-border" />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            {difficulty ? (
              <span className="rounded-sm bg-secondary px-2.5 py-1 text-sm font-bold capitalize text-primary">
                {difficulty}
              </span>
            ) : null}
            {lead ? <span className="text-sm font-bold text-muted-foreground">{lead}</span> : null}
            {pendingReviews > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <MessageSquareText className="size-3" aria-hidden />
                {pendingReviews} awaiting review
              </Badge>
            ) : null}
          </div>

          <h1 className="mt-4 max-w-3xl text-[28px] leading-[1.15] tracking-[-0.035em] lg:text-[34px]">
            {rest}
          </h1>

          {instructorName ? (
            <p className="mt-2 text-base text-muted-foreground">With {instructorName}</p>
          ) : null}

          {description ? (
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              {description}
            </p>
          ) : null}

          <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-3 border-t border-border pt-5 text-[15px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4" />
              <dt className="sr-only">Modules</dt>
              <dd>{moduleCount} modules</dd>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="size-4" />
              <dt className="sr-only">Lessons</dt>
              <dd>{chapterCount} lessons</dd>
            </div>
            {estimatedHours ? (
              <div className="flex items-center gap-2">
                <Clock3 className="size-4" />
                <dt className="sr-only">Estimated duration</dt>
                <dd>~{estimatedHours} hours</dd>
              </div>
            ) : null}
            {chaptersTotal != null && chaptersTotal > 0 ? (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Chapters completed</dt>
                <dd>
                  {chaptersCompleted ?? 0}/{chaptersTotal} lessons complete
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <aside className="flex flex-col justify-between border-t border-border bg-secondary p-6 lg:border-l lg:border-t-0 lg:p-7">
          {projectGoal ? (
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <Target className="size-4" /> What you&apos;ll build
              </div>
              <p className="mt-3 text-base leading-6 text-foreground">{projectGoal}</p>
            </div>
          ) : (
            <p className="text-base leading-6 text-muted-foreground">
              Work through the lessons in order. Your place is saved.
            </p>
          )}

          <div className={cn(projectGoal ? "mt-7" : "mt-auto pt-6")}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-bold text-foreground">Your progress</span>
              <span className="font-mono tabular-nums text-muted-foreground">{percentComplete}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-sm bg-card">
              <div
                className="h-full rounded-sm bg-primary transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, percentComplete))}%` }}
              />
            </div>
            {continueHref ? (
              <Link
                href={continueHref}
                className={cn(buttonVariants(), "mt-5 w-full")}
              >
                {continueLabel}
                <ArrowRight aria-hidden />
              </Link>
            ) : null}
            {ratingLink}
          </div>
        </aside>
      </div>
    </section>
  );
}
