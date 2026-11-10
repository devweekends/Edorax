import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, CircleAlert, Target } from 'lucide-react';
import { ProgressSkeleton } from '../shared/Skeleton';
import {
  calendar,
  dateLabel,
  dayLabel,
  aggregateDays,
  formatStudy,
  scorePercent,
  weeklyBuckets,
  type Day,
  type ProgressCourse,
  type ProgressData,
} from '../../domain/progress';

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function ProgressPage({ onOpenCourse, onBrowse }: { onOpenCourse: (slug: string) => void; onBrowse: () => void }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    let alive = true;
    window.buildment
      .progress()
      .then((result) => {
        if (!alive) return;
        if (result.ok) setData(result.data);
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

  if (loading) return <ProgressSkeleton />;
  if (error || !data) return <Page><p role="alert" className="mt-10 text-sm text-destructive">{error ?? 'Could not load your progress.'}</p></Page>;

  if (data.courses.length === 0) {
    return (
      <Page>
        <Header />
        <div className="mt-8 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <h2 className="font-heading text-xl font-bold tracking-tight">Nothing to show yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">Start a chapter and your progress shows up here.</p>
          <button type="button" onClick={onBrowse} className={`${BUTTON} mt-6`}>Browse courses</button>
        </div>
      </Page>
    );
  }

  const course = selected === 'all' ? null : data.courses.find((item) => item.course.slug === selected) ?? null;
  const visible: ProgressCourse[] = course ? [course] : data.courses;
  const summary = course
    ? { chaptersCompleted: course.chaptersCompleted, totalChapters: course.totalChapters, weekSeconds: course.weekSeconds, pendingReviews: course.pendingReviews }
    : { chaptersCompleted: data.overall.chaptersCompleted, totalChapters: data.overall.totalChapters, weekSeconds: data.overall.weekSeconds, pendingReviews: data.overall.pendingReviews };
  const days = aggregateDays(visible);
  const nextUp = data.courses.find((item) => item.chaptersCompleted < item.totalChapters) ?? null;

  return (
    <Page>
      <Header
        right={
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            View progress for
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="min-h-11 w-72 rounded-lg border border-input bg-card px-3 text-sm font-medium normal-case tracking-normal text-foreground"
            >
              <option value="all">All courses</option>
              {data.courses.map((item) => (
                <option key={item.course.slug} value={item.course.slug}>
                  {item.course.title}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-muted-foreground">Streak</p>
          <p className="font-heading mt-2 text-4xl font-bold tracking-tight">
            {data.streak > 0 ? `${data.streak} ${data.streak === 1 ? 'day' : 'days'}` : 'Start today'}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {data.streak > 0 ? 'Days in a row you studied. Today is still open.' : 'One short chapter starts a streak.'}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-muted-foreground">This week</p>
          <p className="font-heading mt-2 text-4xl font-bold tracking-tight">{formatStudy(summary.weekSeconds)}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            {summary.chaptersCompleted} of {summary.totalChapters} chapters done
            {summary.pendingReviews > 0 ? `. ${summary.pendingReviews} waiting for review.` : '.'}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-primary">Next up</p>
          {nextUp ? (
            <>
              <p className="mt-2 text-lg font-bold leading-snug tracking-tight">{nextUp.course.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {nextUp.chaptersCompleted} of {nextUp.totalChapters} chapters done
              </p>
              <button type="button" onClick={() => onOpenCourse(nextUp.course.slug)} className={`${BUTTON} mt-4 inline-flex items-center gap-2`}>
                Continue <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <p className="mt-2 text-base text-muted-foreground">You are caught up on every course.</p>
          )}
        </Card>
      </div>

      {data.closedWrong.length > 0 && (
        <section className="mt-12">
          <h2 className="font-heading text-2xl font-bold tracking-tight">Checkpoints to revisit</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scored checkpoints that closed on a wrong answer because retries were off.</p>
          <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {data.closedWrong.map((item) => (
              <li key={item.blockId} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.chapter.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.course.title} · {item.type.toLowerCase().replace(/_/g, ' ')}</p>
                </div>
                <button type="button" onClick={() => onOpenCourse(item.course.slug)} className="shrink-0 text-sm font-medium text-primary hover:underline">
                  Open course
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Study activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your learning time across the selected courses.</p>
        <div className="mt-5 space-y-4">
          <WeeklyChart days={days} timeZone={data.timezone} />
          <LastSevenDays days={days} timeZone={data.timezone} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Your courses</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chapter completion and scored checkpoints for each course.</p>
        <div className="mt-5 space-y-4">
          {visible.map((item) => (
            <CourseCard key={item.course.slug} item={item} onOpenCourse={onOpenCourse} />
          ))}
        </div>
      </section>
    </Page>
  );
}

const BUTTON =
  'min-h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90';

function Page({ children }: { children: ReactNode }) {
  return <section className="mx-auto w-full max-w-6xl px-8 py-8">{children}</section>;
}

function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
      <div>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">Progress</h1>
        <p className="mt-2 text-lg text-muted-foreground">Where you are, and what to do next.</p>
      </div>
      {right}
    </header>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-6">{children}</div>;
}

function WeeklyChart({ days, timeZone }: { days: Day[]; timeZone: string }) {
  const weeks = weeklyBuckets(days, timeZone);
  const total = weeks.reduce((sum, week) => sum + week.seconds, 0);
  const max = Math.max(...weeks.map((week) => week.seconds), 0);
  const scale = Math.max(max, 60);

  return (
    <article className="rounded-2xl border border-border bg-card p-6" aria-labelledby="weekly-study-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="weekly-study-heading" className="text-lg font-semibold tracking-tight">Weekly study time</h3>
          <p className="mt-1 text-sm text-muted-foreground">How much time you studied in each 7-day period.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{formatStudy(total)}</p>
          <p className="text-xs text-muted-foreground">Total in the last 12 weeks</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
        <div className="flex h-56 flex-col justify-between pb-1 text-right text-xs tabular-nums text-muted-foreground">
          <span>{formatStudy(scale)}</span>
          <span>{formatStudy(scale / 2)}</span>
          <span>0m</span>
        </div>
        <div className="relative h-56 border-b border-border">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <div className="relative flex h-full items-end gap-2 px-1">
            {weeks.map((week) => {
              const height = week.seconds > 0 ? Math.max(2, (week.seconds / scale) * 85) : 0;
              return (
                <div
                  key={week.start}
                  className="flex h-full min-w-0 flex-1 items-end justify-center"
                  title={`${dateLabel(week.start)} to ${dateLabel(week.end)}: ${formatStudy(week.seconds)}`}
                >
                  {week.seconds > 0 ? (
                    <div className="relative w-full max-w-10 rounded-t-md bg-primary/85" style={{ height: `${height}%` }}>
                      <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-xs font-medium tabular-nums text-foreground">
                        {formatStudy(week.seconds)}
                      </span>
                    </div>
                  ) : (
                    <div className="h-1 w-full max-w-10 rounded-t-sm bg-muted" />
                  )}
                </div>
              );
            })}
          </div>
          {total === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No study time recorded in this period
            </p>
          ) : null}
        </div>
      </div>
      <div className="ml-[4.25rem] flex gap-2 px-1 pt-3">
        {weeks.map((week, index) => (
          <span key={week.start} className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
            {index % 3 === 0 || index === 11 ? dateLabel(week.start) : ''}
          </span>
        ))}
      </div>
    </article>
  );
}

function LastSevenDays({ days, timeZone }: { days: Day[]; timeZone: string }) {
  const week = calendar(days, 7, Date.now(), timeZone);
  const max = Math.max(...week.map((item) => item.seconds), 1);
  const active = week.filter((item) => item.seconds > 0).length;
  const total = week.reduce((sum, item) => sum + item.seconds, 0);
  const best = week.reduce((top, item) => (item.seconds > top.seconds ? item : top), week[0]!);

  return (
    <article className="rounded-2xl border border-border bg-card p-6" aria-labelledby="last-seven-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="last-seven-heading" className="text-lg font-semibold tracking-tight">Your last 7 days</h3>
          <p className="mt-1 text-sm text-muted-foreground">Daily study time, so you can spot your learning rhythm.</p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Includes today</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <ul className="space-y-3">
          {week.map((item) => (
            <li key={item.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
              <span className="text-muted-foreground">{dayLabel(item.day)}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${clamp((item.seconds / max) * 100)}%` }} />
              </div>
              <span className="text-right tabular-nums text-muted-foreground">{item.seconds > 0 ? formatStudy(item.seconds) : '–'}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-border p-5">
          <p className="text-xs text-muted-foreground">Active days</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {active} <span className="text-sm font-normal text-muted-foreground">/ 7</span>
          </p>
          <div className="my-4 border-t border-border" />
          <p className="text-xs text-muted-foreground">Time studied</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatStudy(total)}</p>
          <div className="my-4 border-t border-border" />
          <p className="text-xs text-muted-foreground">Most active day</p>
          <p className="mt-1 font-semibold">{best.seconds > 0 ? dayLabel(best.day) : 'No activity yet'}</p>
        </div>
      </div>
    </article>
  );
}

function CourseCard({ item, onOpenCourse }: { item: ProgressCourse; onOpenCourse: (slug: string) => void }) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const percent = clamp(item.percentComplete);
  const score = scorePercent(item.totalScore, item.maxScore);
  const started = item.modules.filter((module) => module.completed > 0 && module.completed < module.total);
  const upcoming = item.modules.filter((module) => module.completed === 0);
  const finished = item.modules.filter((module) => module.total > 0 && module.completed >= module.total);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-2xl font-bold tracking-tight">{item.course.title}</h3>
            {item.pendingReviews > 0 ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                {item.pendingReviews} awaiting review
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.chaptersCompleted} of {item.totalChapters} chapters · {formatStudy(item.totalStudySeconds)} studied · {item.activeDays} active{' '}
            {item.activeDays === 1 ? 'day' : 'days'}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            {score === null ? <Target size={14} /> : score >= 80 ? <CheckCircle2 size={14} className="text-primary" /> : <CircleAlert size={14} />}
            {score === null ? 'Not scored yet' : `Score ${score}%`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onOpenCourse(item.course.slug)} className={`${BUTTON} inline-flex items-center gap-2`}>
            Continue <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => onOpenCourse(item.course.slug)}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Course overview
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 pb-6">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Course progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-12 text-right text-sm font-semibold tabular-nums">{percent}%</span>
      </div>

      <div className="border-t border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Modules in progress</p>
          <p className="text-xs text-muted-foreground">
            {finished.length} of {item.modules.length} finished
          </p>
        </div>
        {started.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Start a chapter to see module progress here.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {started.map((module) => (
              <ModuleTile key={module.id} module={module} />
            ))}
          </div>
        )}
      </div>

      {upcoming.length > 0 ? (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setShowUpcoming((value) => !value)}
            aria-expanded={showUpcoming}
            className="flex w-full items-center justify-between px-6 py-3 text-left text-sm font-medium hover:bg-muted/50"
          >
            View {upcoming.length} upcoming {upcoming.length === 1 ? 'module' : 'modules'}
            <ChevronDown size={16} className={`transition-transform ${showUpcoming ? 'rotate-180' : ''}`} />
          </button>
          {showUpcoming ? (
            <div className="grid gap-3 px-6 pb-6 sm:grid-cols-2">
              {upcoming.map((module) => (
                <ModuleTile key={module.id} module={module} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ModuleTile({ module }: { module: { order: number; title: string; completed: number; total: number; score: number; maxScore: number } }) {
  const percent = module.total > 0 ? clamp((module.completed / module.total) * 100) : 0;
  const score = scorePercent(module.score, module.maxScore);
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{String(module.order).padStart(2, '0')}</p>
      <p className="mt-0.5 font-medium">{module.title}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>
          {module.completed} of {module.total} chapters
        </span>
        <span>{score === null ? 'Not scored' : `${score}%`}</span>
      </div>
    </div>
  );
}
