import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import type { MentorHelpInboxView } from "@/shared/api/teach";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { AutoSubmitSelect } from "@/components/teach/auto-submit-select";
import { helpUiCopy as copy } from "@/shared/lib/help-ui-copy";

const AGING_HOURS = 48;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default async function MentorHelpInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; status?: string; kind?: string }>;
}) {
  await requireTeachSurface();
  const { courseId: courseFilter, status: rawStatus, kind: rawKind } = await searchParams;
  const statusFilter =
    rawStatus === "resolved" || rawStatus === "all" ? rawStatus : undefined;
  const kindFilter =
    rawKind === "questions" || rawKind === "reports" ? rawKind : undefined;

  const query = new URLSearchParams();
  if (courseFilter) query.set("courseId", courseFilter);
  if (statusFilter) query.set("status", statusFilter);
  if (kindFilter) query.set("kind", kindFilter);
  const suffix = query.size ? `?${query}` : "";
  const {
    courses,
    openCount: openHelpCount,
    threads,
  } = await serverApiFetch<MentorHelpInboxView>(
    `/api/v1/teach/help/threads${suffix}`,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {copy.mentorTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.mentorSubtitle}
          </p>
          {openHelpCount > 0 && (statusFilter ?? "open") !== "resolved" && (
            <p className="mt-2 text-sm font-medium text-foreground">
              {copy.mentorOpenCount(openHelpCount)}
            </p>
          )}
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          action="/help"
          method="GET"
        >
          <AutoSubmitSelect
            name="status"
            defaultValue={statusFilter ?? "open"}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
          >
            <option value="open">Open ({openHelpCount})</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </AutoSubmitSelect>
          <AutoSubmitSelect
            name="kind"
            defaultValue={kindFilter ?? "all"}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
          >
            <option value="all">Everything</option>
            <option value="questions">Questions</option>
            <option value="reports">Lesson reports</option>
          </AutoSubmitSelect>
          {courses.length > 1 && (
            <AutoSubmitSelect
              name="courseId"
              defaultValue={courseFilter ?? ""}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </AutoSubmitSelect>
          )}
        </form>
      </div>

      {threads.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Inbox className="size-8" aria-hidden />
          </span>
          <p className="text-base font-semibold text-foreground">
            {statusFilter === "resolved"
              ? copy.mentorEmptyResolved
              : copy.mentorEmptyOpen}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {copy.mentorEmpty}
          </p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {threads.map((thread) => {
            const isAging =
              thread.status === "OPEN" && thread.ageHours >= AGING_HOURS;

            return (
              <li key={thread.id}>
                <Link
                  href={`/help/${thread.id}`}
                  className="group flex items-center gap-4 border-l-[3px] border-transparent px-4 py-4 outline-none transition-colors hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:bg-primary/5 sm:px-5"
                >
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                    aria-hidden
                  >
                    {initials(thread.menteeLabel)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-foreground">
                        {thread.menteeLabel}
                      </p>
                      {thread.kind === "LESSON_REPORT" && (
                        <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                          Report
                          {thread.category ? ` · ${thread.category.toLowerCase().replace("_", " ")}` : ""}
                        </span>
                      )}
                      {isAging && (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                          {Math.floor(thread.ageHours)}h waiting
                        </span>
                      )}
                      {thread.status === "RESOLVED" && (
                        <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                          Resolved
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {thread.chapterTitle ?? thread.courseTitle}
                    </p>
                    {thread.preview && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {thread.preview.body}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
