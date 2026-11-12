import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Clock3,
  MessageSquareText,
  RotateCcw,
  Target,
  Mail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { helpUiCopy } from "@/shared/lib/help-ui-copy";
import { formatStudyAmount } from "@/lib/format-study-duration";
import { WeeklyGoalEditor } from "@/components/learn/dashboard/weekly-goal-editor";
import { WeeklyQuests } from "@/components/learn/dashboard/weekly-quests";
import { CourseStageLine, LearningMomentum } from "@/components/learn/dashboard/gamification";
import { showsGameElements } from "@/lib/gamification";
import { MascotStill } from "@/components/mascot/mascot-tip";
import type {
  DashboardAction,
  DashboardCourse,
  DashboardDay,
  DashboardEvent,
  MenteeDashboardViewModel,
} from "@/shared/api/learner";

function relativeTime(value: string | null) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusDetails(state: DashboardCourse["state"]) {
  switch (state) {
    case "PAYMENT_REQUIRED": return { label: "Payment due", variant: "destructive" as const };
    case "NEEDS_REVISION": return { label: "Revision requested", variant: "secondary" as const };
    case "AWAITING_REVIEW": return { label: "Awaiting review", variant: "secondary" as const };
    case "IN_PROGRESS": return { label: "In progress", variant: "secondary" as const };
    case "NOT_STARTED": return { label: "Ready to begin", variant: "outline" as const };
    case "COMPLETED": return { label: "Completed", variant: "outline" as const };
    case "DROPPED": return { label: "Dropped", variant: "outline" as const };
  }
}

function DashboardHeader({ model }: { model: MenteeDashboardViewModel }) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">My learning</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          {model.courses.length === 0 ? "Welcome" : "Welcome back"}, {model.learner.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Take one step at a time. You can pick up from here when you are ready.
        </p>
      </div>
      <WeeklyGoalEditor goal={model.habit.weeklyGoal} />
    </header>
  );
}

function ContinueLearning({ course }: { course: DashboardCourse }) {
  const status = statusDetails(course.state);
  return (
    <section aria-labelledby="continue-heading" className="overflow-hidden rounded-2xl border bg-card ">
      <div className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="size-5 text-primary" aria-hidden />
        <p id="continue-heading" className="text-sm font-semibold">{course.state === "IN_PROGRESS" ? "Continue where you left off" : course.state === "COMPLETED" ? "Look how far you have come" : "Your next step"}</p>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
        {course.title}
      </h2>
      {course.stage || course.xp !== null ? (
        <>
          <CourseStageLine course={course} className="mt-2 text-sm" />
          {course.targetChapter ? <p className="mt-1 text-sm text-muted-foreground">{course.targetChapter.title}</p> : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {[course.currentModule, course.targetChapter?.title].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-6">
        <Progress value={course.percentComplete} className="gap-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:duration-200 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none">
          <ProgressLabel className="text-xs text-muted-foreground">
            {course.chaptersCompleted} of {course.chaptersTotal} chapters complete
          </ProgressLabel>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {course.percentComplete === 0 && course.chaptersCompleted > 0 ? "<1" : course.percentComplete}%
          </span>
        </Progress>
      </div>
      {course.targetChapter && course.targetChapter.blocksTotal > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {course.targetChapter.blocksCompleted} of {course.targetChapter.blocksTotal} checkpoints complete in this chapter.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={course.href}
          className={cn(buttonVariants({ size: "lg", variant: "default" }), "h-auto min-h-11 max-w-full whitespace-normal py-3 text-center transition-colors duration-200 active:bg-primary/80 motion-reduce:transition-none")}
        >
          {course.actionLabel}
          <ArrowRight data-icon="inline-end" />
        </Link>
        <Link href={course.overviewHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          View course
        </Link>
      </div>
      </div>
    </section>
  );
}

function weekdayLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day.slice(-2);
  return date.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
}

function ActivityStrip({ days, maxSeconds }: { days: DashboardDay[]; maxSeconds: number }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">Estimated active time</p>
      <div className="mt-2 flex items-end gap-1.5" role="img" aria-label="Estimated study time for the last 7 days">
        {days.map((day) => {
          const height = day.seconds <= 0 ? 0 : Math.max(12, Math.round((day.seconds / Math.max(1, maxSeconds)) * 100));
          return (
            <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${day.day}: ${formatStudyAmount(day.seconds)}`}>
              <div className="flex h-12 w-full items-end rounded-sm bg-muted">
                <div className="w-full rounded-sm bg-primary" style={{ height: `${height}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{weekdayLabel(day.day)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklySnapshot({ model }: { model: MenteeDashboardViewModel }) {
  const metrics = [
    { label: "Estimated study this week", value: formatStudyAmount(model.overview.weekSeconds) },
    { label: "Active days", value: `${model.activity.activeDays} of 7` },
    { label: "Chapters completed (all courses)", value: String(model.overview.chaptersCompleted) },
    { label: "Awaiting review", value: String(model.overview.pendingReviews) },
  ];

  return (
    <section aria-labelledby="snapshot-heading" className="self-start rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="size-4 text-muted-foreground" aria-hidden />
        <h2 id="snapshot-heading" className="text-sm font-semibold">This week</h2>
      </div>
      {showsGameElements(model.gamification) ? (
        <LearningMomentum summary={model.gamification} streak={model.habit.streakCount} />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {model.habit.streakCount === 0
            ? "Every visit counts. Learn at your own pace."
            : `${model.habit.streakCount}-day learning streak. One step at a time.`}
        </p>
      )}
      <ActivityStrip days={model.activity.week} maxSeconds={model.activity.maxDaySeconds} />
      <dl className="mt-4 divide-y divide-border">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <dt className="text-sm text-muted-foreground">{metric.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{metric.value}</dd>
          </div>
        ))}
      </dl>
      {(model.habit.goal ?? model.habit.weeklyGoal) ? (
        <div className="mt-5 rounded-xl border bg-muted/20 p-4">
          {(() => {
            const studyGoal = (model.habit.goal ?? model.habit.weeklyGoal)!;
            const unit =
              studyGoal.kind === "MINUTES" ? "minutes" : studyGoal.kind === "CHAPTERS" ? "chapters" : "sessions";
            const remaining = Math.max(0, studyGoal.target - studyGoal.progress);
            const windowLabel = studyGoal.period === "DAILY" ? "today" : "this week";
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Target className="size-4" aria-hidden /> {studyGoal.period === "DAILY" ? "Daily goal" : "Weekly goal"}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {Math.min(studyGoal.progress, studyGoal.target)} / {studyGoal.target}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {studyGoal.progress >= studyGoal.target
                    ? "You reached your goal. Your effort adds up."
                    : `${remaining} ${unit} to go ${windowLabel}`}
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Study goal progress"
                  aria-valuenow={Math.min(studyGoal.progress, studyGoal.target)}
                  aria-valuemin={0}
                  aria-valuemax={studyGoal.target}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round((studyGoal.progress / studyGoal.target) * 100))}%` }}
                  />
                </div>
                {studyGoal.note ? <p className="mt-3 text-xs leading-5 text-muted-foreground">Focus: {studyGoal.note}</p> : null}
                {studyGoal.dailyReminder ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="size-3.5" aria-hidden /> Email reminder on
                  </p>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}
      <Link href="/progress" className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline">
        View progress details <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}

function ResumeBanner({ session }: { session: NonNullable<MenteeDashboardViewModel["activity"]["runningSession"]> }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">You were studying {session.chapterTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{session.courseTitle}</p>
      </div>
      <Link href={session.href} className={buttonVariants()}>
        Continue
        <ArrowRight data-icon="inline-end" />
      </Link>
    </section>
  );
}

const ACTION_ICONS: Record<DashboardAction["kind"], typeof RotateCcw> = {
  REVISION: RotateCcw,
  CONTINUE: BookOpen,
  HELP: CircleHelp,
  START: BookOpen,
  FEEDBACK: MessageSquareText,
  PENDING_REVIEW: Clock3,
  REVIEW: MessageSquareText,
};

function shortCourseAction(course: DashboardCourse) {
  if (course.state === "COMPLETED") return "Review";
  if (course.state === "NOT_STARTED" || course.state === "PAYMENT_REQUIRED") return "Open";
  return "Continue";
}

function ActionCenter({ actions, hasCourse }: { actions: DashboardAction[]; hasCourse: boolean }) {
  const visible = actions
    .filter(
      (action, index, all) =>
        all.findIndex((candidate) => candidate.href === action.href && candidate.title === action.title) === index
    )
    .slice(0, 3);
  return (
    <section aria-labelledby="attention-heading" className="min-w-0">
      <h2 id="attention-heading" className="text-base font-semibold tracking-tight">Your next steps</h2>
      {visible.length > 0 ? (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border bg-card">
          {visible.map((action) => {
            const Icon = ACTION_ICONS[action.kind];
            return (
              <li key={action.id}>
                <Link
                  href={action.href}
                  className="group flex items-center gap-3 px-3.5 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{action.title}</span>
                      {action.kind === "REVISION" ? <Badge variant="secondary">Feedback</Badge> : null}
                      {action.unread ? <Badge variant="secondary">Unread</Badge> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{action.context}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm font-medium">You are all caught up</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hasCourse ? "Continue a course when you are ready." : "New assignments will appear here."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function CourseListPreview({ courses }: { courses: DashboardCourse[] }) {
  const visible = courses.slice(0, 3);
  return (
    <section aria-labelledby="courses-preview-heading" className="min-w-0 border-t border-border pt-8 sm:pt-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="courses-preview-heading" className="text-lg font-semibold tracking-tight">My learning</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off.</p>
        </div>
        <Link
          href="/my-courses"
          className={cn(buttonVariants({ size: "sm" }), "h-9 shrink-0 px-3")}
        >
          View all courses
        </Link>
      </div>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((course) => {
          const status = statusDetails(course.state);
          const percent = course.percentComplete === 0 && course.chaptersCompleted > 0 ? "<1" : course.percentComplete;
          return (
            <li key={course.id}>
              <article className="flex h-full min-h-[220px] flex-col rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-10 place-items-center rounded-xl bg-muted text-primary">
                    {course.state === "COMPLETED" ? <CheckCircle2 className="size-5" aria-hidden /> : <BookOpen className="size-5" aria-hidden />}
                  </span>
                  <Badge variant={status.variant} className="max-w-[7.5rem] truncate">{status.label}</Badge>
                </div>
                <h3 className="mt-4 line-clamp-2 text-base font-semibold leading-snug tracking-[-0.01em]">
                  {course.title}
                </h3>
                <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted-foreground">
                  {course.targetChapter?.title ?? course.currentModule ?? "Ready when you are"}
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <Progress value={course.percentComplete} className="min-w-0 flex-1 [&_[data-slot=progress-track]]:h-2" />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{percent}%</span>
                </div>
                <Link
                  href={course.href}
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "mt-5 h-10 w-full justify-center"
                  )}
                >
                  {shortCourseAction(course)}
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CourseCard({ course, featured }: { course: DashboardCourse; featured: boolean }) {
  const status = statusDetails(course.state);
  return (
    <article className={cn("overflow-hidden rounded-2xl border bg-card transition-shadow duration-200  focus-within:ring-2 focus-within:ring-ring motion-reduce:transition-none", featured && "border-primary/40")}>
      {featured ? <p className="border-b border-border bg-muted px-4 py-3 text-sm font-medium">{course.state === "IN_PROGRESS" ? "Continue where you left off" : "Your next step"}</p> : null}
      <div className="flex min-h-24 items-stretch border-b bg-muted/30">
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {course.pendingReviews > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <MessageSquareText className="size-3" aria-hidden />
                {course.pendingReviews} review
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold">{course.title}</h3>
          <CourseStageLine course={course} className="mt-1" />
        </div>
      </div>
      <div className="p-4">
        <Progress value={course.percentComplete} className="gap-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:duration-200 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none">
          <ProgressLabel className="text-xs">{course.chaptersCompleted} of {course.chaptersTotal} chapters complete</ProgressLabel>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{course.percentComplete === 0 && course.chaptersCompleted > 0 ? "<1" : course.percentComplete}%</span>
        </Progress>
        {course.targetChapter ? <p className="mt-4 text-sm leading-6">{course.targetChapter.status === "IN_PROGRESS" ? "Current" : "Next"}: <span className="font-medium">{course.targetChapter.title}</span></p> : null}
        {course.state === "COMPLETED" ? <p className="mt-4 flex items-start gap-2 text-sm leading-6"><CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" aria-hidden />You completed this course. Take a moment to see what you have learned.</p> : null}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{formatStudyAmount(course.totalStudySeconds)} studied</span>
          <span>{relativeTime(course.lastActiveAt)}</span>
          {course.maxScore > 0 ? <span>{Math.round((course.totalScore / course.maxScore) * 100)}% scored accuracy</span> : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={course.href}
            className={cn(buttonVariants({ variant: "default" }), "h-auto min-h-11 max-w-full whitespace-normal py-3 text-center transition-colors duration-200 active:bg-primary/80 motion-reduce:transition-none")}
          >
            {course.actionLabel}
          </Link>
          <Link href={course.overviewHref} className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Course overview</Link>
        </div>
      </div>
    </article>
  );
}

export function MenteeCourseList({ courses, showHeading = true, primaryCourseId }: { courses: DashboardCourse[]; showHeading?: boolean; primaryCourseId?: string }) {
  const orderedCourses = [...courses].sort((a, b) => Number(b.id === primaryCourseId) - Number(a.id === primaryCourseId));
  return (
    <section aria-labelledby={showHeading ? "courses-heading" : undefined}>
      {showHeading ? <div><h2 id="courses-heading" className="text-lg font-semibold tracking-tight">My learning</h2><p className="mt-1 text-sm text-muted-foreground">All assigned courses and their next available steps.</p></div> : null}
      <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2", showHeading && "mt-4")}>
        {orderedCourses.map((course) => <CourseCard key={course.id} course={course} featured={course.id === primaryCourseId && course.state !== "COMPLETED"} />)}
      </div>
    </section>
  );
}

function EmptyDashboard({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <MascotStill role="guide" state="begin" className="mx-auto size-24" />
      <h2 className="mt-4 text-lg font-semibold">Your learning starts here</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {name}, choose a course from the catalog to get started. If your mentor sent an invite, open its link to join your course.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/catalog" className={buttonVariants()}>Browse catalog</Link>
        <Link href="/my-questions" className={buttonVariants({ variant: "outline" })}>{helpUiCopy.learnerNav}</Link>
      </div>
    </div>
  );
}

function RecentEvents({ events }: { events: DashboardEvent[] }) {
  const visible = events.slice(0, 3);
  if (visible.length === 0) return null;
  return (
    <section aria-labelledby="recent-heading" className="min-w-0">
      <h2 id="recent-heading" className="text-base font-semibold tracking-tight">Recent activity</h2>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border bg-card">
        {visible.map((event) => (
          <li key={event.id}>
            <Link
              href={event.href}
              className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{event.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.context}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{relativeTime(event.occurredAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MenteeDashboard({ model }: { model: MenteeDashboardViewModel }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <DashboardHeader model={model} />
      {model.courses.length === 0 ? (
        <div className="mt-8"><EmptyDashboard name={model.learner.name} /></div>
      ) : (
        <div className="mt-6 space-y-6">
          <WeeklyQuests />
          {model.activity.runningSession ? <ResumeBanner session={model.activity.runningSession} /> : null}
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            {model.primaryCourse ? <ContinueLearning course={model.primaryCourse} /> : null}
            <WeeklySnapshot model={model} />
          </div>
          <CourseListPreview courses={model.courses} />
          <div className="grid grid-cols-1 gap-5 border-t border-border pt-6 xl:grid-cols-2">
            <ActionCenter actions={model.actions} hasCourse={Boolean(model.primaryCourse)} />
            <RecentEvents events={model.recentEvents} />
          </div>
        </div>
      )}
    </div>
  );
}
