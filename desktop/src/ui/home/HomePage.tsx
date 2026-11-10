import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Award, BookOpen, Clock, Flame, Snowflake, TrendingUp } from 'lucide-react';
import { STATE_LABELS, timeAgo, type HomeAction, type HomeCareer, type HomeCourse, type HomeSummary } from '../../domain/home';
import { formatStudy } from '../../domain/progress';
import { CoverArt } from '../courses/CoverArt';
import { HomeSkeleton } from '../shared/Skeleton';
import { isAllowedWebPath } from '../../domain/remote';
import type { LeaderboardSelection } from '../../domain/leaderboard';
import { GoalCard, DotTip, MilestoneCard } from './HomeExtras';

type Props = {
  onOpenCourse: (slug: string) => void;
  onBrowse: () => void;
  onViewAll: () => void;
  onOpenProgress: () => void;
  onOpenLeaderboard: (selection: LeaderboardSelection) => void;
};

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const BUTTON = 'rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90';

export function HomePage({ onOpenCourse, onBrowse, onViewAll, onOpenProgress, onOpenLeaderboard }: Props) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((value) => value + 1);

  useEffect(() => {
    let alive = true;
    window.buildment
      .home()
      .then((result) => {
        if (!alive) return;
        if (result.ok) setSummary(result.data);
        else setError(result.message);
      })
      .catch(() => {
        if (alive) setError('The desktop connection is unavailable. Restart the app and try again.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  if (loading) return <HomeSkeleton />;
  if (error || !summary) return <Page><p role="alert" className="mt-10 text-sm text-destructive">{error ?? 'Could not load your learning.'}</p></Page>;

  return (
    <Page>
      <p className="text-sm font-medium text-muted-foreground">
        {summary.name ? `Welcome back, ${summary.name}` : 'Welcome back'}
      </p>
      <div className="mt-4">
        <Hero primary={summary.primary} onOpenCourse={onOpenCourse} onBrowse={onBrowse} />
      </div>

      {summary.streakMilestone !== null && (
        <div className="mt-6">
          <MilestoneCard
            days={summary.streakMilestone}
            onAcknowledged={reload}
            onSeeRank={() => onOpenLeaderboard({ category: 'streak', scope: 'global', courseId: null })}
          />
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ContinueCard course={summary.primary} onOpenCourse={onOpenCourse} onBrowse={onBrowse} />
        <div className="space-y-6">
          <WeekPanel summary={summary} onOpenProgress={onOpenProgress} />
          <GoalCard goal={summary.goal} onChanged={reload} />
          <DotTip />
        </div>
      </div>

      <section className="mt-12">
        <SectionHeader title="My learning" description="Pick up where you left off." action={summary.courses.length > 0 ? { label: 'View all courses', onClick: onViewAll } : undefined} />
        {summary.courses.length === 0 ? (
          <Card className="mt-5 text-center">
            <p className="text-sm text-muted-foreground">You have no courses yet.</p>
            <button type="button" onClick={onBrowse} className={`${BUTTON} mt-4`}>Browse courses</button>
          </Card>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summary.courses.slice(0, 6).map((course, index) => (
              <CourseTile key={course.slug} course={course} index={index} onOpenCourse={onOpenCourse} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title="Your next steps" description="What is waiting on you." />
          <div className="mt-5 space-y-3">
            {summary.actions.length === 0 ? (
              <Card><p className="text-sm text-muted-foreground">Nothing is waiting on you right now.</p></Card>
            ) : (
              summary.actions.map((action) => (
                <ActionRow key={action.id} action={action} onOpenCourse={onOpenCourse} />
              ))
            )}
          </div>
        </section>
        <section>
          <SectionHeader title="Recent activity" description="The last few things you did." />
          <Card className="mt-5 divide-y divide-border p-0">
            {summary.events.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No activity yet. Start a chapter and it shows up here.</p>
            ) : (
              summary.events.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{event.title}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{event.context}</p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{timeAgo(event.occurredAt)}</span>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>
    </Page>
  );
}

function Hero({ primary, onOpenCourse, onBrowse }: { primary: HomeCourse | null; onOpenCourse: (slug: string) => void; onBrowse: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-secondary/70 px-8 py-12 sm:px-12 sm:py-14">
      <div className="relative z-10 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/70">Learn. Build. Make it yours.</p>
        <h1 className="font-heading mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
          Your next chapter
          <span className="block italic text-primary">starts here.</span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
          {primary
            ? `Pick up ${primary.title} where you left off. Explore practical courses and build your understanding.`
            : 'Explore practical courses. Build your understanding. Turn what you learn into something real.'}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => (primary ? onOpenCourse(primary.slug) : onBrowse())}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
          >
            {primary ? 'Continue learning' : 'Browse courses'}
            <ArrowRight size={18} />
          </button>
          <button type="button" onClick={onBrowse} className="rounded-xl border border-border bg-card px-6 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted">
            Explore courses
          </button>
        </div>
      </div>
      <HeroArt />
    </section>
  );
}

function HeroArt() {
  return (
    <div aria-hidden className="pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 md:block">
      <div className="relative size-72">
        <span className="absolute inset-0 rounded-full border border-primary/10" />
        <span className="absolute inset-10 rounded-full border border-primary/10" />
        <span className="absolute inset-20 rounded-full border border-primary/10" />
        <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 rotate-12 place-items-center rounded-3xl bg-primary shadow-2xl shadow-primary/30">
          <BookOpen size={44} strokeWidth={1.6} className="-rotate-12 text-primary-foreground" />
        </div>
        <ArrowUpRight size={22} strokeWidth={1.6} className="absolute right-6 top-4 text-primary/50" />
      </div>
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-7xl px-8 py-8">{children}</section>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-6 ${className}`}>{children}</div>;
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? (
        <button type="button" onClick={action.onClick} className={BUTTON}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const value = clamp(percent);
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatePill({ state }: { state: string }) {
  return <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{STATE_LABELS[state] ?? state}</span>;
}

function ContinueCard({ course, onOpenCourse, onBrowse }: { course: HomeCourse | null; onOpenCourse: (slug: string) => void; onBrowse: () => void }) {
  if (!course) {
    return (
      <Card className="p-8">
        <span className="grid size-11 place-items-center rounded-xl bg-muted text-primary">
          <BookOpen size={20} />
        </span>
        <h2 className="font-heading mt-5 text-2xl font-bold tracking-tight">Pick your first course</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Enroll in a course and it will show up here, with the chapter you left off.</p>
        <button type="button" onClick={onBrowse} className={`${BUTTON} mt-6`}>Browse courses</button>
      </Card>
    );
  }

  const continueLabel = course.targetChapter ? `Continue ${course.targetChapter}` : 'Continue learning';
  return (
    <Card className="p-8">
      <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground">
        <BookOpen size={18} className="text-primary" />
        Continue where you left off
        <StatePill state={course.state} />
      </div>
      <h2 className="font-heading mt-5 text-4xl font-bold leading-tight tracking-tight text-foreground">{course.title}</h2>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-base text-muted-foreground">
        {course.stage ? (
          <>
            <span>Stage {course.stage.current} of {course.stage.total}</span>
            <span aria-hidden>·</span>
            <span>{course.stage.title}</span>
          </>
        ) : null}
        {course.xp !== null ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">{course.xp} XP</span> : null}
      </p>
      {course.targetChapter ? <p className="mt-2 text-sm text-muted-foreground">{course.targetChapter}</p> : null}

      <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
        <span>{course.chaptersCompleted} of {course.chaptersTotal} chapters complete</span>
        <span className="tabular-nums">{clamp(course.percentComplete)}%</span>
      </div>
      <div className="mt-2">
        <ProgressBar percent={course.percentComplete} label="Course progress" />
      </div>

      <button
        type="button"
        onClick={() => onOpenCourse(course.slug)}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <span className="truncate">{continueLabel}</span>
        <ArrowRight size={18} className="shrink-0" />
      </button>
      <button type="button" onClick={() => onOpenCourse(course.slug)} className="mt-4 w-full text-sm font-medium text-foreground underline-offset-4 hover:underline">
        View course
      </button>
    </Card>
  );
}

function WeekPanel({ summary, onOpenProgress }: { summary: HomeSummary; onOpenProgress: () => void }) {
  const maxSeconds = Math.max(1, ...summary.week.map((day) => day.seconds));
  return (
    <aside className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock size={16} className="text-muted-foreground" />
        This week
      </div>

      <div className="mt-5 space-y-5">
        <StatRow icon={<Flame size={18} />} title={summary.streak > 0 ? `${summary.streak}-day streak` : 'No streak yet'}>
          {summary.freezes ? (
            <span className="flex items-center gap-1">
              <Snowflake size={12} /> {summary.freezes.available} of {summary.freezes.max} streak freezes
            </span>
          ) : null}
        </StatRow>

        {summary.level ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{summary.level.level}</span>
                Level {summary.level.level}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{summary.level.toNext} XP to level {summary.level.level + 1}</span>
            </div>
            <div className="mt-3">
              <ProgressBar percent={summary.level.percent} label="Level progress" />
            </div>
          </div>
        ) : null}

        {summary.career ? <CareerRow career={summary.career} /> : null}

        <div>
          <p className="text-sm font-semibold">Estimated active time</p>
          <div className="mt-3 flex items-end gap-2">
            {summary.week.map((day) => {
              const height = day.seconds > 0 ? Math.max(8, (day.seconds / maxSeconds) * 100) : 0;
              const letter = new Date(`${day.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });
              return (
                <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted">
                    <div className="w-full rounded-md bg-primary/85" style={{ height: `${height}%` }} title={formatStudy(day.seconds)} />
                  </div>
                  <span className="text-xs text-muted-foreground">{letter}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
        <Stat label="Estimated study this week" value={formatStudy(summary.weekSeconds)} />
        <Stat label="Active days" value={`${summary.activeDays} of 7`} />
        <Stat label="Chapters completed" value={`${summary.chaptersCompleted}`} />
        <Stat label="Awaiting review" value={`${summary.pendingReviews}`} />
      </dl>

      <button type="button" onClick={onOpenProgress} className="mt-5 flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
        <TrendingUp size={16} /> View progress details <ArrowRight size={14} />
      </button>
    </aside>
  );
}

function StatRow({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="mt-0.5 text-xs text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

function CareerRow({ career }: { career: HomeCareer }) {
  const required = career.requiredForNext;
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Award size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {career.title} <span className="font-normal text-muted-foreground">· {career.tierIndex} of {career.totalTiers}</span>
        </p>
        {career.nextTitle ? <p className="text-xs text-muted-foreground">Next: {career.nextTitle}</p> : null}
        {required ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {career.completedCourses}/{required.courses} courses · {Math.round(career.avgScore)}% avg · need {required.minScore}%
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function CourseTile({ course, index, onOpenCourse }: { course: HomeCourse; index: number; onOpenCourse: (slug: string) => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-28 overflow-hidden">
        <CoverArt variant={index} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug text-foreground">{course.title}</h3>
          <StatePill state={course.state} />
        </div>
        {course.targetChapter ? <p className="line-clamp-2 text-sm text-muted-foreground">{course.targetChapter}</p> : null}
        <div className="mt-auto">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>{course.chaptersCompleted} of {course.chaptersTotal} chapters</span>
            <span className="tabular-nums">{clamp(course.percentComplete)}%</span>
          </div>
          <ProgressBar percent={course.percentComplete} label={`${course.title} progress`} />
        </div>
        <button type="button" onClick={() => onOpenCourse(course.slug)} className={`${BUTTON} w-full`}>
          Continue
        </button>
      </div>
    </article>
  );
}

function ActionRow({ action, onOpenCourse }: { action: HomeAction; onOpenCourse: (slug: string) => void }) {
  // Next steps link to a course path like /courses/<slug>/...; anything else opens on the web when allowed.
  const slug = action.href?.match(/^\/courses\/([^/?#]+)/)?.[1] ?? null;
  const webPath = action.href && !slug && isAllowedWebPath(action.href) ? action.href : null;
  const open = slug ? () => onOpenCourse(slug) : webPath ? () => void window.buildment.openWeb(webPath) : null;
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Clock size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{action.title}</p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {action.context} · {action.statusLabel}
        </p>
      </div>
      {open ? <ArrowRight size={16} className="shrink-0 text-muted-foreground" /> : null}
    </>
  );

  if (!open) return <Card className="flex items-center gap-4 p-5">{body}</Card>;
  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40"
    >
      {body}
    </button>
  );
}
