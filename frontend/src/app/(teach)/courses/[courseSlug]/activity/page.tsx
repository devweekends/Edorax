import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Clock3,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { CourseActivityView } from "@/shared/api/teach";
import { CourseInsightsTabs } from "@/components/teach/course-insights-tabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { formatStudyHours } from "@/lib/format-study-duration";

export default async function CourseActivityPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  await requireTeachSurface();
  const { course, days, rows, metrics, hasActivity } =
    await serverApiFetchOrNotFound<CourseActivityView>(
      `/api/v1/teach/courses/${encodeURIComponent(courseSlug)}/activity`,
    );

  return (
    <div className="space-y-7 pb-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {course.title} · Insights
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Daily activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          A 14-day estimate of learner study time. Treat it as an activity
          signal. Course progress is based on completed work.
        </p>
      </header>

      <CourseInsightsTabs courseSlug={course.slug} active="activity" />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-2xl border bg-background">
            <Activity className="size-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-base font-semibold">
            No learners to track yet
          </h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
            Activity appears after learners enroll and begin working through the
            course.
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
            <ActivityMetric
              icon={Users}
              label="Active learners"
              value={`${metrics.activeLearners}/${metrics.learnerCount}`}
              detail="Active in the last 7 days"
            />
            <ActivityMetric
              icon={Clock3}
              label="Estimated study time"
              value={formatStudyHours(metrics.totalSeconds)}
              detail="Across the last 14 days"
            />
            <ActivityMetric
              icon={Activity}
              label="Estimated average per learner"
              value={formatStudyHours(metrics.averageSeconds)}
              detail="Across this period"
            />
            <ActivityMetric
              icon={CalendarDays}
              label="Estimated today"
              value={formatStudyHours(metrics.todaySeconds)}
              detail="Recorded in UTC"
            />
          </div>

          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
              <div>
                <h2 className="text-base font-semibold">Learner activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each cell shows active study minutes for that UTC day.
                </p>
              </div>
              <ActivityLegend />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="sticky left-0 z-10 min-w-44 bg-muted/95 px-4 py-3 font-medium backdrop-blur sm:px-6">
                      Learner
                    </th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className="px-1.5 py-3 text-center font-normal"
                      >
                        <span className="block text-[10px] uppercase tracking-wide">
                          {new Date(`${day}T12:00:00Z`).toLocaleDateString(
                            undefined,
                            { weekday: "short" },
                          )}
                        </span>
                        <span className="mt-0.5 block font-medium text-foreground">
                          {new Date(`${day}T12:00:00Z`).toLocaleDateString(
                            undefined,
                            { month: "numeric", day: "numeric" },
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="sticky right-0 min-w-20 bg-muted/95 px-4 py-3 text-right font-medium backdrop-blur">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr
                      key={row.enrollmentId}
                      className="group transition-colors hover:bg-muted/30"
                    >
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 transition-colors group-hover:bg-muted/30 sm:px-6">
                        <Link
                          href={`/courses/${course.slug}/mentees/${row.enrollmentId}`}
                          className="block max-w-44 truncate font-medium underline-offset-2 hover:underline"
                        >
                          {row.label}
                        </Link>
                        {row.email && row.email !== row.label ? (
                          <span className="block max-w-44 truncate text-xs text-muted-foreground">
                            {row.email}
                          </span>
                        ) : null}
                      </td>
                      {days.map((day, index) => {
                        const seconds = row.seconds[index] ?? 0;
                        const minutes = Math.round(seconds / 60);
                        return (
                          <td key={day} className="px-1.5 py-3 text-center">
                            <span
                              className={cn(
                                "inline-grid size-9 place-items-center rounded-lg text-[11px] font-medium tabular-nums",
                                activityCellClass(seconds),
                              )}
                              title={`${day}: ${formatStudyHours(seconds)}`}
                              aria-label={`${day}, ${formatStudyHours(seconds)}`}
                            >
                              {seconds > 0 ? minutes : "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td className="sticky right-0 min-w-20 whitespace-nowrap bg-card px-4 py-3 text-right text-xs font-medium tabular-nums transition-colors group-hover:bg-muted/30">
                        {formatStudyHours(row.totalSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!hasActivity ? (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No study sessions were recorded in this 14-day window. The
              enrolled learners remain visible so you can follow up directly.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActivityLegend() {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
      aria-label="Activity intensity legend"
    >
      <span>Less</span>
      <span className="size-3 rounded-sm bg-muted" />
      <span className="size-3 rounded-sm bg-foreground/10" />
      <span className="size-3 rounded-sm bg-foreground/25" />
      <span className="size-3 rounded-sm bg-foreground/50" />
      <span className="size-3 rounded-sm bg-foreground" />
      <span>More</span>
    </div>
  );
}

function activityCellClass(seconds: number): string {
  if (seconds <= 0) return "bg-muted/60 text-muted-foreground/60";
  if (seconds < 15 * 60) return "bg-foreground/10 text-foreground";
  if (seconds < 30 * 60) return "bg-foreground/20 text-foreground";
  if (seconds < 60 * 60) return "bg-foreground/50 text-background";
  return "bg-foreground text-background";
}
