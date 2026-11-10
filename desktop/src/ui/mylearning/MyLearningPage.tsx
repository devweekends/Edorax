import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Clock, MessageSquare, Sparkles } from 'lucide-react';
import { STATE_LABELS, timeAgo, type HomeCourse, type HomeSummary } from '../../domain/home';
import { formatStudy } from '../../domain/progress';
import { CoverArt } from '../courses/CoverArt';
import { MyLearningSkeleton } from '../shared/Skeleton';

type Filter = 'all' | 'progress' | 'review' | 'completed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'In progress' },
  { id: 'review', label: 'Awaiting review' },
  { id: 'completed', label: 'Completed' },
];

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const BUTTON = 'rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90';

function isInProgress(course: HomeCourse) {
  return course.state === 'IN_PROGRESS' || course.state === 'NOT_STARTED' || course.state === 'NEEDS_REVISION';
}

function matches(course: HomeCourse, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'progress') return isInProgress(course);
  if (filter === 'review') return course.pendingReviews > 0 || course.state === 'AWAITING_REVIEW';
  return course.state === 'COMPLETED';
}

export function MyLearningPage({ onOpenCourse, onBrowse }: { onOpenCourse: (slug: string) => void; onBrowse: () => void }) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

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
  }, []);

  if (loading) return <MyLearningSkeleton />;
  if (error || !summary) return <Page><p role="alert" className="mt-10 text-sm text-destructive">{error ?? 'Could not load your courses.'}</p></Page>;

  const courses = summary.courses;
  const totalSeconds = courses.reduce((sum, course) => sum + course.totalStudySeconds, 0);
  const reviews = courses.reduce((sum, course) => sum + course.pendingReviews, 0);
  const counts: Record<Filter, number> = {
    all: courses.length,
    progress: courses.filter(isInProgress).length,
    review: courses.filter((course) => matches(course, 'review')).length,
    completed: courses.filter((course) => course.state === 'COMPLETED').length,
  };

  const visible = courses.filter((course) => matches(course, filter));
  const featured = filter === 'all' ? summary.primary ?? courses.find(isInProgress) ?? null : null;
  const featuredSlug = featured?.slug ?? null;
  const rest = visible.filter((course) => course.slug !== featuredSlug);

  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">My learning</h1>
          <p className="mt-2 text-base text-muted-foreground">Pick up where you left off, review your lessons, or open a course you have joined.</p>
        </div>
        <button type="button" onClick={onBrowse} className={BUTTON}>Browse courses</button>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Courses" value={`${courses.length}`} />
        <StatTile label="Chapters done" value={`${summary.chaptersCompleted} of ${summary.chaptersTotal}`} />
        <StatTile label="Time studied" value={formatStudy(totalSeconds)} />
        <StatTile label="Awaiting review" value={`${reviews}`} highlight={reviews > 0} />
      </div>

      <div role="tablist" aria-label="Filter courses" className="mt-8 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {FILTERS.map((item) => {
          const on = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(item.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
              <span className={`rounded-md px-1.5 text-xs tabular-nums ${on ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>{counts[item.id]}</span>
            </button>
          );
        })}
      </div>

      {courses.length === 0 ? (
        <Empty
          title="You have not joined a course yet"
          body="Enroll in a course and it will show up here, with the chapter you left off."
          action={<button type="button" onClick={onBrowse} className={BUTTON}>Browse courses</button>}
        />
      ) : visible.length === 0 ? (
        <Empty title="Nothing in this filter" body="Try another tab to see your other courses." />
      ) : (
        <div className="mt-6 space-y-6">
          {featured ? <FeaturedCard course={featured} index={courses.indexOf(featured)} onOpenCourse={onOpenCourse} /> : null}
          {rest.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rest.map((course) => (
                <CourseCard key={course.slug} course={course} index={courses.indexOf(course)} onOpenCourse={onOpenCourse} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-7xl px-8 py-8">{children}</section>;
}

function StatTile({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-2 font-heading text-2xl font-bold tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'primary' }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'}`}>
      {children}
    </span>
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  const value = clamp(percent);
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusPills({ course }: { course: HomeCourse }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill>{STATE_LABELS[course.state] ?? course.state}</Pill>
      {course.pendingReviews > 0 ? (
        <Pill tone="primary">
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={12} /> {course.pendingReviews} {course.pendingReviews === 1 ? 'review' : 'reviews'}
          </span>
        </Pill>
      ) : null}
    </div>
  );
}

function FeaturedCard({ course, index, onOpenCourse }: { course: HomeCourse; index: number; onOpenCourse: (slug: string) => void }) {
  const continueLabel = course.targetChapter ? `Continue ${course.targetChapter}` : 'Continue learning';
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-6 py-3 text-sm font-medium text-muted-foreground">
        <Sparkles size={15} className="text-primary" />
        Continue where you left off
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="p-6 md:p-8">
          <StatusPills course={course} />
          <h2 className="font-heading mt-4 text-3xl font-bold leading-tight tracking-tight text-foreground">{course.title}</h2>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {course.stage ? (
              <>
                <span>Stage {course.stage.current} of {course.stage.total}</span>
                <span aria-hidden>·</span>
                <span>{course.stage.title}</span>
              </>
            ) : null}
            {course.xp !== null ? <Pill>{course.xp} XP</Pill> : null}
          </p>

          <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
            <span>{course.chaptersCompleted} of {course.chaptersTotal} chapters complete</span>
            <span className="tabular-nums">{clamp(course.percentComplete)}%</span>
          </div>
          <div className="mt-2">
            <Bar percent={course.percentComplete} label={`${course.title} progress`} />
          </div>

          {course.targetChapter ? (
            <p className="mt-5 text-sm text-foreground">
              <span className="text-muted-foreground">Current: </span>
              {course.targetChapter}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} /> {formatStudy(course.totalStudySeconds)} studied
            </span>
            <span>{course.lastActiveAt ? `Last active ${timeAgo(course.lastActiveAt)}` : 'No activity yet'}</span>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenCourse(course.slug)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
            >
              <span className="max-w-md truncate">{continueLabel}</span>
              <ArrowRight size={18} className="shrink-0" />
            </button>
            <button type="button" onClick={() => onOpenCourse(course.slug)} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
              Course overview
            </button>
          </div>
        </div>
        <div className="relative hidden min-h-56 overflow-hidden border-l border-border md:block">
          <CoverArt variant={index < 0 ? 0 : index} />
        </div>
      </div>
    </article>
  );
}

function CourseCard({ course, index, onOpenCourse }: { course: HomeCourse; index: number; onOpenCourse: (slug: string) => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative h-28 overflow-hidden">
        <CoverArt variant={index < 0 ? 0 : index} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <StatusPills course={course} />
        <h3 className="font-semibold leading-snug text-foreground">{course.title}</h3>
        <p className="text-sm text-muted-foreground">
          {course.stage ? `Stage ${course.stage.current} of ${course.stage.total}` : `${course.chaptersCompleted} of ${course.chaptersTotal} chapters`}
          {course.xp !== null ? ` · ${course.xp} XP` : ''}
        </p>
        {course.targetChapter ? <p className="line-clamp-2 text-sm text-foreground">Current: {course.targetChapter}</p> : null}
        <div className="mt-auto space-y-3 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatStudy(course.totalStudySeconds)} studied</span>
            <span className="tabular-nums">{clamp(course.percentComplete)}%</span>
          </div>
          <Bar percent={course.percentComplete} label={`${course.title} progress`} />
          <button type="button" onClick={() => onOpenCourse(course.slug)} className={`${BUTTON} w-full`}>
            Continue
          </button>
          <button type="button" onClick={() => onOpenCourse(course.slug)} className="w-full text-center text-sm font-medium text-foreground underline-offset-4 hover:underline">
            Course overview
          </button>
        </div>
      </div>
    </article>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-primary">
        <BookOpen size={20} />
      </span>
      <h2 className="font-heading mt-5 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
