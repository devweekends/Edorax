import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  CircleAlert,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { LearnerProgressModule, LearnerProgressView, MenteeDashboardViewModel } from "@/shared/api/learner";
import { Dot } from "@/components/brand/dot";
import { requireLearnSurface } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { formatStudyAmount } from "@/lib/format-study-duration";
import { cn } from "@/lib/utils";
import { ActivityInsights } from "@/components/learn/progress/activity-insights";
import { ActivityGrid } from "@/components/learn/progress/activity-grid";
import { ProgressCourseSelector } from "@/components/learn/progress/course-selector";

export const metadata: Metadata = { title: "Progress" };

function percentage(score: number, maxScore: number) {
  return maxScore > 0 ? Math.round((score / maxScore) * 100) : null;
}

function accuracyState(value: number | null) {
  if (value === null) return { label: "Not scored yet", detail: "Complete a scored quiz, prediction, test, or code check to establish accuracy.", className: "text-muted-foreground", icon: Target };
  if (value >= 80) return { label: "Strong understanding", detail: "Your scored checkpoints show reliable understanding.", className: "text-ok", icon: CheckCircle2 };
  if (value >= 60) return { label: "Developing understanding", detail: "Review missed checkpoints before moving too far ahead.", className: "text-foreground", icon: CircleAlert };
  return { label: "Look at these again", detail: "Revisit the scored chapters below and try the checks again.", className: "text-destructive", icon: CircleAlert };
}

export default async function MenteeProgressPage({ searchParams }: { searchParams: Promise<{ course?: string; year?: string }> }) {
  await requireLearnSurface();
  const { course: requestedCourse, year: requestedYearParam } = await searchParams;
  const requestedYear = requestedYearParam && /^\d{4}$/.test(requestedYearParam) ? Number(requestedYearParam) : undefined;
  const [{ courses: courseProgress, closedWrong, overall }, dashboard] = await Promise.all([
    serverApiFetch<LearnerProgressView>(`/api/v1/learner/progress${requestedYear ? `?year=${requestedYear}` : ""}`),
    serverApiFetch<MenteeDashboardViewModel>("/api/v1/learner/dashboard").catch(() => null),
  ]);
  const weeklyGoal = dashboard?.habit.weeklyGoal ?? null;
  const nextUp = courseProgress.find((item) => item.continueHref) ?? null;
  const selectedCourse = courseProgress.find((item) => item.course.slug === requestedCourse) ?? null;
  const visibleCourses = selectedCourse ? [selectedCourse] : courseProgress;
  const selectedSummary = selectedCourse
    ? {
        chaptersCompleted: selectedCourse.chaptersCompleted,
        totalChapters: selectedCourse.totalChapters,
        score: selectedCourse.totalScore,
        maxScore: selectedCourse.maxScore,
        weekSeconds: selectedCourse.weekSeconds,
        pendingReviews: selectedCourse.pendingReviews,
      }
    : overall;
  const visibleWrong = selectedCourse ? closedWrong.filter((row) => row.course.slug === selectedCourse.course.slug) : closedWrong;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-col gap-6 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Progress</h1>
          <p className="mt-2 max-w-xl text-lg text-muted-foreground">Where you are, and what to do next.</p>
        </div>
        {courseProgress.length > 0 ? <ProgressCourseSelector courses={courseProgress} selectedSlug={selectedCourse?.course.slug ?? null} /> : null}
      </header>

      {courseProgress.length === 0 ? (
        <div className="mt-8 flex flex-col items-center border border-border bg-card px-6 py-14 text-center">
          <Dot mood="sleep" size={112} />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">Nothing to show yet</h2>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">Start a chapter and your progress shows up here.</p>
          <Link href="/catalog" className={cn(buttonVariants(), "mt-6")}>Browse courses</Link>
        </div>
      ) : (
        <>
          <section aria-label="Your week" className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="border border-border bg-card p-6">
              <p className="text-sm font-bold text-muted-foreground">This week</p>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-[40px] font-bold leading-none tracking-[-0.035em]">
                {formatStudyAmount(selectedSummary.weekSeconds)}
              </p>
              {weeklyGoal ? (
                <>
                  <div className="mt-4 h-2 overflow-hidden rounded-sm bg-secondary">
                    <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.min(100, Math.round((weeklyGoal.progress / Math.max(1, weeklyGoal.target)) * 100))}%` }} />
                  </div>
                  <p className="mt-2 text-base text-muted-foreground">
                    {weeklyGoal.progress} of {weeklyGoal.target}{" "}
                    {weeklyGoal.kind === "MINUTES"
                      ? "minutes"
                      : weeklyGoal.kind === "SESSIONS"
                        ? "study sessions"
                        : "chapters"}{" "}
                    {weeklyGoal.period === "DAILY" ? "today" : "this week"}.
                  </p>
                </>
              ) : (
                <p className="mt-4 text-base text-muted-foreground">
                  {selectedSummary.chaptersCompleted} of {selectedSummary.totalChapters} chapters done
                  {selectedSummary.pendingReviews > 0 ? `. ${selectedSummary.pendingReviews} waiting for review.` : "."}
                </p>
              )}
            </div>
            <div className="border border-border bg-card p-6">
              <p className="text-sm font-bold text-primary">Next up</p>
              {nextUp ? (
                <>
                  <p className="mt-2 text-lg font-bold leading-snug tracking-[-0.02em]">{nextUp.course.title}</p>
                  <p className="mt-1 text-base text-muted-foreground">
                    {nextUp.chaptersCompleted} of {nextUp.totalChapters} chapters done
                  </p>
                  <Link href={nextUp.continueHref!} className={cn(buttonVariants(), "mt-5")}>
                    Continue <ArrowRight data-icon="inline-end" />
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-base text-muted-foreground">You have finished what is open. Pick another course.</p>
              )}
            </div>
          </section>

          <ActivityInsights courses={visibleCourses} />
          <div className="mt-4">
            {overall.activityYears.length > 1 ? (
              <div className="mb-3 flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs font-medium text-muted-foreground">Year</span>
                {overall.activityYears.map((y) => {
                  const params = new URLSearchParams();
                  if (selectedCourse) params.set("course", selectedCourse.course.slug);
                  params.set("year", String(y));
                  return (
                    <Link
                      key={y}
                      href={`/progress?${params.toString()}`}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs tabular-nums",
                        y === overall.year ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      {y}
                    </Link>
                  );
                })}
              </div>
            ) : null}
            <ActivityGrid days={overall.yearActivity} />
          </div>

          {visibleWrong.length > 0 ? (
            <section aria-labelledby="closed-wrong-heading" className="mt-8">
              <h2 id="closed-wrong-heading" className="text-2xl tracking-[-0.02em]">Questions to look at again</h2>
              <p className="mt-1 text-base text-muted-foreground">These counted with a wrong answer. Open one to go back over it.</p>
              <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border bg-card">
                {visibleWrong.map((row) => (
                  <li key={row.blockId}>
                    <Link href={`/courses/${row.course.slug}/${row.chapter.slug}`} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.chapter.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.course.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.type === "PREDICT" ? "Prediction" : row.type === "CODE" ? "Code" : "Quiz"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-10 space-y-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{selectedCourse ? "Course details" : "Your courses"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Chapter completion and scored checkpoints for {selectedCourse ? "this course" : "each course"}.</p>
            </div>
            {visibleCourses.map((enrollment) => {
              const { modules, activeDays, totalStudySeconds, totalChapters, continueHref } = enrollment;
              const accuracy = percentage(enrollment.totalScore, enrollment.maxScore);
              const understanding = accuracyState(accuracy);
              const UnderstandingIcon = understanding.icon;
              const modulesWithEvidence = modules.filter(
                (module) => module.completed > 0 || module.maxScore > 0
              );
              const visibleModules = modulesWithEvidence.slice(0, 4);
              const moreActiveModules = modulesWithEvidence.slice(4);
              const upcomingModules = modules.filter((module) => module.completed === 0 && module.maxScore === 0);
              return (
                <section key={enrollment.course.id} className="overflow-hidden rounded-2xl border bg-card">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold tracking-tight sm:text-xl">{enrollment.course.title}</h3>
                          {enrollment.pendingReviews > 0 ? <Badge variant="secondary">{enrollment.pendingReviews} awaiting review</Badge> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{enrollment.chaptersCompleted} of {totalChapters} chapters</span>
                          <span aria-hidden>·</span>
                          <span>{formatStudyAmount(totalStudySeconds)} studied</span>
                          <span aria-hidden>·</span>
                          <span>{activeDays} of 7 active days</span>
                        </div>
                        <div className={cn("mt-2 flex items-center gap-1.5 text-xs", understanding.className)}>
                          <UnderstandingIcon className="size-3.5 shrink-0" aria-hidden />
                          <span>{understanding.label}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-3">
                        {continueHref ? (
                          <Link href={continueHref} className={buttonVariants()}>
                            Continue <ArrowRight data-icon="inline-end" />
                          </Link>
                        ) : null}
                        <Link href={`/courses/${enrollment.course.slug}`} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                          Course overview
                        </Link>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-4">
                      <div role="progressbar" aria-label={`${enrollment.course.title} completion`} aria-valuenow={enrollment.percentComplete} aria-valuemin={0} aria-valuemax={100} className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${enrollment.percentComplete}%` }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{enrollment.percentComplete}%</span>
                    </div>
                  </div>

                  <div className="border-t bg-muted/10 px-5 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold">Modules in progress</h4>
                      <span className="text-xs text-muted-foreground">{modulesWithEvidence.length} of {modules.length} started</span>
                    </div>
                    {visibleModules.length > 0 ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {visibleModules.map((module) => <ModuleProgressCard key={module.id} module={module} />)}
                      </div>
                    ) : <p className="mt-3 text-sm text-muted-foreground">Start a chapter to see module progress here.</p>}
                  </div>
                  {moreActiveModules.length > 0 ? (
                    <details className="group border-t">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-medium hover:bg-muted/30 sm:px-6 [&::-webkit-details-marker]:hidden">
                        <span>Show {moreActiveModules.length} more started module{moreActiveModules.length === 1 ? "" : "s"}</span>
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="grid gap-3 border-t bg-muted/10 p-5 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">{moreActiveModules.map((module) => <ModuleProgressCard key={module.id} module={module} />)}</div>
                    </details>
                  ) : null}
                  {upcomingModules.length > 0 ? (
                    <details className="group border-t">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-xs font-medium hover:bg-muted/30 sm:px-6 [&::-webkit-details-marker]:hidden">
                        <span>View {upcomingModules.length} upcoming module{upcomingModules.length === 1 ? "" : "s"}</span>
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <ol className="grid gap-x-6 gap-y-2 border-t bg-muted/10 px-5 py-4 text-xs text-muted-foreground sm:grid-cols-2 sm:px-6">
                        {upcomingModules.map((module) => <li key={module.id}><span className="mr-2 tabular-nums">{String(module.order).padStart(2, "0")}</span>{module.title}</li>)}
                      </ol>
                    </details>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ModuleProgressCard({ module }: { module: LearnerProgressModule }) {
  const completion = percentage(module.completed, module.total) ?? 0;
  const accuracy = percentage(module.score, module.maxScore);
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{String(module.order).padStart(2, "0")}</span>
        <p className="min-w-0 text-sm font-medium leading-5">{module.title}</p>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${module.title} completion`} aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${completion}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-2 text-xs tabular-nums">
        <span className="text-muted-foreground">{module.completed}/{module.total} chapters</span>
        <span className={accuracyState(accuracy).className}>{accuracy === null ? "Not scored" : `${accuracy}% correct`}</span>
      </div>
    </div>
  );
}
