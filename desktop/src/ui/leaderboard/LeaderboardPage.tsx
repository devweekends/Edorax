import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { Dot, type DotMood } from '@buildment/learning-ui/brand-dot';
import { fireMiniConfetti } from '@buildment/learning-ui/components/learn/mini-confetti';
import {
  LEADERBOARD_CATEGORIES,
  boardContext,
  type LeaderboardContext,
  type LeaderboardHubView,
  type LeaderboardSelection,
} from '../../domain/leaderboard';
import { BestScore, LastWeekWinners, LeagueCard, StandingCard, StandingsList } from './LeaderboardParts';
import { playCelebration } from './celebration-sound';
import { LeaderboardSkeleton, ListSkeleton } from '../shared/Skeleton';

const DEFAULT_SELECTION: LeaderboardSelection = { category: 'weekly_xp', scope: 'global', courseId: null };
const BUTTON =
  'min-h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60';

/** Dot reacts to the board: asleep when off, cheering on the podium, waving at the join prompt. */
function dotMood(context: LeaderboardContext | null, contextError: string | null, view: LeaderboardHubView | null): DotMood {
  if (!context) return contextError ? 'oops' : 'happy';
  if (!context.featuresEnabled) return 'sleep';
  if (context.courses.length === 0) return 'think';
  if (!view) return 'oops';
  if (view.status === 'ready') return view.you.rank <= 3 && view.you.score > 0 ? 'cheer' : 'happy';
  if (view.status === 'opt_in_required') return 'wave';
  if (view.status === 'unavailable') return 'oops';
  return 'think';
}

function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <Trophy className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mx-auto mt-2 max-w-md text-base text-muted-foreground">{children}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function LeaderboardPage({ initialSelection }: { initialSelection?: LeaderboardSelection }) {
  const [context, setContext] = useState<LeaderboardContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [selection, setSelection] = useState<LeaderboardSelection>(initialSelection ?? DEFAULT_SELECTION);
  const [view, setView] = useState<LeaderboardHubView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const confettiAnchor = useRef<HTMLDivElement | null>(null);
  const celebrated = useRef<string | null>(null);
  const latest = useRef(0);

  const loadContext = useCallback(async () => {
    setContextError(null);
    try {
      const result = await window.buildment.leaderboard.context();
      if (result.ok) setContext(result.data);
      else setContextError(result.message);
    } catch {
      setContextError('The desktop connection is unavailable. Restart the app and try again.');
    }
  }, []);

  const loadBoard = useCallback(async (next: LeaderboardSelection) => {
    const request = ++latest.current;
    setPending(true);
    setError(null);
    try {
      const result = await window.buildment.leaderboard.hub(next);
      if (request !== latest.current) return;
      if (result.ok) setView(result.data);
      else setError(result.message);
    } catch {
      if (request === latest.current) setError('Something went wrong. Please try again.');
    } finally {
      if (request === latest.current) setPending(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const boardsOn = Boolean(context && context.featuresEnabled && context.courses.length > 0);
  useEffect(() => {
    if (boardsOn) void loadBoard(selection);
    // Load the first board once the learner's courses arrive.
  }, [boardsOn]);

  // Celebrate once per board: a podium finish or a promotion at the Monday reset.
  useEffect(() => {
    if (!view || view.status !== 'ready') return;
    const key = `${view.category}|${view.scope}|${view.courseId ?? 'global'}`;
    const onPodium = view.you.rank >= 1 && view.you.rank <= 3 && view.you.score > 0;
    const promoted = view.league?.lastWeek?.outcome === 'PROMOTED';
    if ((!onPodium && !promoted) || celebrated.current === key) return;
    celebrated.current = key;
    const timer = window.setTimeout(() => {
      if (onPodium) playCelebration();
      if (confettiAnchor.current) fireMiniConfetti(confettiAnchor.current);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [view]);

  const select = (next: LeaderboardSelection) => {
    const withCourse =
      next.scope === 'course' && !next.courseId
        ? { ...next, courseId: context?.initialCourseId ?? context?.courses[0]?.courseId ?? null }
        : next;
    setSelection(withCourse);
    void loadBoard(withCourse);
  };

  const setOptIn = async (optIn: boolean) => {
    setPending(true);
    setError(null);
    try {
      const result = await window.buildment.leaderboard.setOptIn(optIn);
      if (!result.ok) {
        setError(result.message);
        setPending(false);
        return;
      }
      await loadBoard(selection);
    } catch {
      setError('Something went wrong. Please try again.');
      setPending(false);
    }
  };

  const weekly = selection.category === 'weekly_xp';
  const courseTitle =
    context?.courses.find((course) => course.courseId === selection.courseId)?.title ??
    (view && view.status === 'ready' ? view.courseTitle : null);
  const bestLabel = selection.category === 'streak' ? 'Beat your longest streak' : 'Beat your best week';

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
      <header className="flex items-start justify-between gap-5 border-b border-border pb-7">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Competition</p>
          <h1 className="font-heading mt-1 text-4xl font-bold tracking-tight text-foreground">Leaderboard</h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Weekly leagues with promotion and demotion, plus all-time, speed and streak boards. Boards reset every Monday.
          </p>
        </div>
        <Dot mood={dotMood(context, contextError, view)} size={72} />
      </header>

      {!context && contextError ? (
        <div className="mt-8">
          <Notice
            title="Leaderboard did not load"
            action={
              <button type="button" className={BUTTON} onClick={() => void loadContext()}>
                Try again
              </button>
            }
          >
            {contextError}
          </Notice>
        </div>
      ) : !context ? (
        <LeaderboardSkeleton />
      ) : !context.featuresEnabled ? (
        <div className="mt-8">
          <Notice title="Leaderboards are off">
            Game elements are hidden or unavailable on your account. You can turn them back on in your profile settings on the web.
          </Notice>
        </div>
      ) : context.courses.length === 0 ? (
        <div className="mt-8">
          <Notice title="Join a course first">
            Boards are for learners. Enroll in a course, then come back to see how you compare.
          </Notice>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            <div role="tablist" aria-label="Leaderboard category" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
              {LEADERBOARD_CATEGORIES.map((category) => {
                const on = selection.category === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    disabled={pending}
                    onClick={() =>
                      select({
                        category: category.id,
                        scope: category.id === 'weekly_xp' ? selection.scope : 'global',
                        courseId: category.id === 'weekly_xp' ? selection.courseId : null,
                      })
                    }
                    className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50 ${
                      on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>

            {weekly ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex gap-1 rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => select({ ...selection, scope: 'global', courseId: null })}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      selection.scope === 'global' ? 'bg-background font-semibold text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Global League
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => select({ ...selection, scope: 'course' })}
                    className={`rounded-md px-3 py-1.5 transition-colors ${
                      selection.scope === 'course' ? 'bg-background font-semibold text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Course Classmates
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selection.scope === 'global' ? 'Ranked with learners in your league tier' : 'Ranked among learners in your course'}
                </p>
              </div>
            ) : null}

            {weekly && selection.scope === 'course' ? (
              context.courses.length > 1 ? (
                <select
                  aria-label="Course"
                  value={selection.courseId ?? ''}
                  disabled={pending}
                  onChange={(event) => select({ ...selection, courseId: event.target.value })}
                  className="min-h-11 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground disabled:opacity-60"
                >
                  {context.courses.map((course) => (
                    <option key={course.courseId} value={course.courseId}>
                      {course.title}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm font-medium text-foreground">{courseTitle}</p>
              )
            ) : null}
          </div>

          <div aria-busy={pending} className={`mt-8 space-y-6 transition-opacity duration-150 ${pending ? 'opacity-60' : ''}`}>
            {!view ? (
              pending ? (
                <ListSkeleton rows={5} label="Loading board" />
              ) : (
                <Notice
                  title="Board did not load"
                  action={
                    <button type="button" className={BUTTON} disabled={pending} onClick={() => void loadBoard(selection)}>
                      Try again
                    </button>
                  }
                >
                  Something went wrong fetching this board.
                </Notice>
              )
            ) : view.status === 'disabled' ? (
              <Notice title="No board here">Try another category or course, or check back after you start learning.</Notice>
            ) : view.status === 'opt_in_required' ? (
              <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center sm:px-10">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Trophy className="size-7" aria-hidden />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">Join the leaderboards</h2>
                <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
                  See how your week compares with other learners. Only people who join can see the boards, and you can leave any time.
                </p>
                <button type="button" className={`${BUTTON} mt-6`} disabled={pending} onClick={() => void setOptIn(true)}>
                  Join leaderboards
                </button>
              </div>
            ) : view.status === 'unavailable' ? (
              <Notice title="Board unavailable">
                {view.reason === 'organization_disabled'
                  ? 'Your organization has turned leaderboards off for this course.'
                  : 'Leaderboards are available while your enrollment is active.'}
              </Notice>
            ) : (
              <>
                {view.league ? (
                  <LeagueCard
                    league={view.league}
                    score={view.you.score}
                    metricLabel={view.metricLabel}
                    bestScore={view.you.bestScore}
                    resetsAt={view.resetsAt}
                  />
                ) : (
                  <StandingCard
                    context={boardContext(view.scope, view.category, courseTitle)}
                    rank={view.you.rank}
                    groupSize={view.groupSize}
                    score={view.you.score}
                    bestScore={view.you.bestScore}
                    metricLabel={view.metricLabel}
                    bestLabel={bestLabel}
                    resetsAt={view.resetsAt}
                  />
                )}

                <div ref={confettiAnchor}>
                  <StandingsList entries={view.entries} metricLabel={view.metricLabel} league={view.league} />
                </div>

                {view.lastWeek ? <LastWeekWinners winners={view.lastWeek.winners} metricLabel={view.metricLabel} /> : null}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void setOptIn(false)}
                    disabled={pending}
                    className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
                  >
                    Leave leaderboards
                  </button>
                </div>
              </>
            )}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
