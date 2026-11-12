import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CircleCheckBig,
  Download,
  Star,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { StarRating } from "@/components/learn/star-rating";
import type { ChapterReportView, CourseReportView } from "@/shared/api/teach";
import { nowMs } from "@/server/time";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { formatStudyHours } from "@/lib/format-study-duration";
import { AutoSubmitSelect } from "@/components/teach/auto-submit-select";
import { CourseInsightsTabs } from "@/components/teach/course-insights-tabs";
import { buttonVariants } from "@/components/ui/button";

export default async function CourseReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ chapterId?: string }>;
}) {
  const { courseSlug } = await params;
  const { chapterId } = await searchParams;
  await requireTeachSurface();

  const query = chapterId ? `?chapterId=${encodeURIComponent(chapterId)}` : "";
  const report = await serverApiFetchOrNotFound<CourseReportView>(
    `/api/v1/teach/courses/${encodeURIComponent(courseSlug)}/reports${query}`
  );
  const { course, summary, enrollments, chapterReport, ratings } = report;
  const atRisk = enrollments.filter((e) => e.atRisk);
  const now = nowMs();

  return (
    <div className="space-y-7 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {course.title} · Insights
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            See cohort progress, identify where learners stall, and decide what needs attention.
          </p>
        </div>
        {summary.enrolled > 0 ? (
          // Served by the API through the /api/v1 proxy; the session cookie travels with it.
          <a
            href={`/api/v1/teach/courses/${encodeURIComponent(course.slug)}/reports/export`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
          >
            <Download className="size-4" /> Export CSV
          </a>
        ) : null}
      </header>

      <CourseInsightsTabs courseSlug={course.slug} active="reports" />

      {summary.enrolled === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border bg-background">
            <BarChart3 className="size-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-base font-semibold">No learner data yet</h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            Invite learners to this course. Their progress and chapter signals will appear here.
          </p>
          <Link
            href={`/courses/${course.slug}/mentees`}
            className={cn(buttonVariants({ size: "lg" }), "mt-5")}
          >
            Invite learners
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Users} label="Learners" value={summary.enrolled} sub="Enrolled in this course" />
            <SummaryCard icon={TrendingUp} label="Started" value={`${pct(summary.started, summary.enrolled)}%`} sub={`${summary.started} of ${summary.enrolled} learners`} />
            <SummaryCard icon={BarChart3} label="Average progress" value={`${summary.averageCompletion}%`} sub="Across the cohort" />
            <SummaryCard icon={CircleCheckBig} label="Completed" value={summary.completed} sub={`${pct(summary.completed, summary.enrolled)}% completion rate`} />
          </div>

          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Course rating</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">What learners said</h2>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1.5 text-2xl font-semibold tabular-nums">
                  <Star className="size-4 fill-current text-amber-500" aria-hidden />
                  {ratings.average != null ? ratings.average.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ratings.count} rating{ratings.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {ratings.count === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No ratings yet. Learners can rate the course after completing it.
              </p>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="space-y-1">
                  {ratings.distribution.map((row) => {
                    const percent = ratings.count > 0 ? Math.round((row.count / ratings.count) * 100) : 0;
                    return (
                      <div key={row.stars} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-8 tabular-nums">{row.stars}★</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="w-10 text-right tabular-nums">{percent}%</span>
                      </div>
                    );
                  })}
                </div>
                <ul className="space-y-2">
                  {ratings.recent.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <StarRating value={row.rating} size={12} />
                        <span className="font-medium text-foreground">{row.reviewer}</span>
                      </div>
                      {row.review ? (
                        <p className="mt-1 text-sm text-muted-foreground">{row.review}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {atRisk.length > 0 && (
            <section className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-200">
                <AlertTriangle className="size-4" />
                {atRisk.length} learner{atRisk.length === 1 ? "" : "s"} need attention
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Inactive for {report.atRiskDays}+ days or more than 3 chapters behind the cohort median.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {atRisk.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-amber-200 bg-background px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:text-amber-200"
                  >
                    <Link href={`/courses/${course.slug}/mentees/${e.id}`} className="hover:underline">
                      {e.name}
                      {e.lastActiveAt ? ` · ${relativeLastActive(now - Date.parse(e.lastActiveAt))}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold">Learner progress</h2>
              <p className="mt-1 text-sm text-muted-foreground">A cohort-level view without ranking learners against one another.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                    <th className="w-[24%] px-3 py-3">Learner</th>
                    <th className="w-[17%] px-3 py-3">Progress</th>
                    <th className="w-[9%] px-3 py-3">Score</th>
                    <th className="w-[13%] px-3 py-3">Est. study time</th>
                    <th className="w-[10%] px-3 py-3">Reviews</th>
                    <th className="w-[13%] px-3 py-3">Last active</th>
                    <th className="w-[14%] px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enrollments.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-3 py-3">
                        <p className="font-medium text-foreground">
                          <Link href={`/courses/${course.slug}/mentees/${e.id}`} className="hover:underline">
                            {e.name}
                          </Link>
                          {e.atRisk && (
                            <span className="ml-2 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                              at risk
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{e.email ?? "—"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-foreground" style={{ width: `${e.percentComplete}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{e.percentComplete}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                        {e.maxScore > 0 ? `${e.totalScore}/${e.maxScore}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                        {formatStudyHours(e.studySeconds)}
                      </td>
                      <td className="px-3 py-3">
                        {e.pendingReviews > 0 ? (
                          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                            {e.pendingReviews}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {e.lastActiveAt ? relativeLastActive(now - Date.parse(e.lastActiveAt)) : "Never"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Chapter report</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current shared chapters only. Older and variant-only work remains in each learner’s evaluation.
                </p>
              </div>
              <form action={`/courses/${course.slug}/reports`} method="GET">
                <AutoSubmitSelect
                  name="chapterId"
                  defaultValue={chapterId ?? ""}
                  className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    Choose a chapter…
                  </option>
                  {report.modules.map((module) => (
                    <optgroup key={module.id} label={module.title}>
                      {module.chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </AutoSubmitSelect>
              </form>
            </div>

            {chapterReport ? (
              <ChapterReport report={chapterReport} />
            ) : (
              <p className="mt-5 rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                Choose a chapter to inspect its blocks, attempts, and learner outcomes.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ChapterReport({ report }: { report: ChapterReportView }) {
  return (
    <div className="mt-4 space-y-5">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5">Block</th>
              <th className="px-4 py-2.5">Attempts</th>
              <th className="px-4 py-2.5">Correct rate</th>
              <th className="px-4 py-2.5">Pending reviews</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.blocks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  This chapter has no interactive blocks.
                </td>
              </tr>
            )}
            {report.blocks.map((block) => (
              <tr key={block.id}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground">{block.id}</span>
                  <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {block.type.replaceAll("_", " ").toLowerCase()}
                  </span>
                  {block.confusionFlag && (
                    <span className="ml-2 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      confusion flag
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{block.attempts || "—"}</td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                  {block.correctRate !== null ? `${Math.round(block.correctRate * 100)}%` : "n/a"}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{block.pendingReviews || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.progress.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5">Mentee</th>
                <th className="px-4 py-2.5">Blocks</th>
                <th className="px-4 py-2.5">Score</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.progress.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.learnerLabel}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {row.blocksCompleted}/{row.blocksTotal}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {row.maxScore > 0 ? `${row.score}/${row.maxScore}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        status === "COMPLETED"
          ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : status === "IN_PROGRESS"
            ? "bg-foreground/10 text-foreground"
            : "bg-muted text-muted-foreground"
      )}
    >
      {status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function relativeLastActive(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
