import {
  CourseIDEProvider,
  CourseIDEPanel,
  OpenIDEButton,
  useCourseIDE,
} from '../labs/CourseIDE';
import { playFeedback } from '../../lib/sound-feedback';
import { useToast } from '../toast/Toast';
import { useDotVoice } from '../mascot/DotVoice';
import { DesktopToolbar } from '../layout/DesktopToolbar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson } from '../../domain/learning';
import type { QuizChapterState } from '../../../../server/src/shared/api/blocks';
import { LessonContent } from './LessonContent';
import { Exercise } from './Exercise';
import { QuizSession } from './quiz/QuizSession';
import { AccountMenu } from '../auth/AccountMenu';
import type { Session } from '../auth/useSession';
import { ArrowLeft } from 'lucide-react';
import { ResizeDivider, loadPaneWidth } from '../labs/ResizeDivider';
import {
  ChapterSidebar,
  SidebarToggle,
} from '@buildment/learning-ui/components/learn/chapter-sidebar';
import {
  ChapterToc,
  TocToggle,
} from '@buildment/learning-ui/components/learn/chapter-toc';
import { CourseNavigationProvider } from '@buildment/learning-ui/components/learn/course-navigation';
import {
  VariantThemeScope,
  variantForTrack,
} from '@buildment/learning-ui/components/learn/variant-theme';
import { lessonHeadings } from './lesson-headings';
import { LessonLoading } from './LessonLoading';

export function CourseReader(props: Parameters<typeof CourseReaderBody>[0]) {
  return (
    <CourseIDEProvider key={props.courseSlug}>
      <CourseReaderBody {...props} />
    </CourseIDEProvider>
  );
}
function CourseReaderBody({
  courseSlug,
  courseTitle,
  initialChapter,
  onBack,
  onSignedOut,
  session,
}: {
  courseSlug: string;
  courseTitle: string;
  initialChapter?: string;
  onBack: () => void;
  onSignedOut: () => void;
  session: Session;
}) {
  const ide = useCourseIDE();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [queuedChapter, setQueuedChapter] = useState<string | null>(null);
  const toast = useToast();
  const { track: trackDot } = useDotVoice();
  const [quiz, setQuiz] = useState<QuizChapterState | null>(null);
  const [sidebarClosed, setSidebarClosed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('curriculum-sidebar-width'));
      return saved >= 240 && saved <= 560 ? Math.max(252, saved) : 288;
    } catch {
      return 288;
    }
  });
  const resizeSidebar = (width: number) => {
    setSidebarWidth(width);
    try {
      localStorage.setItem('curriculum-sidebar-width', String(width));
    } catch {
      /* local preferences are optional */
    }
  };
  const [tocClosed, setTocClosed] = useState(false);
  const [smallWindow, setSmallWindow] = useState(() => window.innerWidth < 768);
  const [idePaneWidth, setIdePaneWidth] = useState(loadPaneWidth);
  const handleResize = useCallback(
    (percent: number) => setIdePaneWidth(percent),
    [],
  );
  const annotated = useMemo(
    () => (lesson ? lessonHeadings(lesson.document) : null),
    [lesson?.document],
  );
  const variant = variantForTrack(lesson?.track ?? null);
  const showHeadings =
    lesson?.chapter.readerMode !== 'QUIZ' &&
    !(lesson?.content?.predictGate && !lesson.content.predictRevealed);
  useEffect(() => {
    const media = matchMedia('(max-width: 767px)');
    const update = () => {
      setSmallWindow(media.matches);
      setSidebarClosed(media.matches);
      setTocClosed(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  function navigate(href: string) {
    if (href === `/courses/${courseSlug}`) return onBack();
    const prefix = `/courses/${courseSlug}/`;
    if (href.startsWith(prefix)) {
      if (smallWindow) setSidebarClosed(true);
      void load(decodeURIComponent(href.slice(prefix.length)));
    }
  }
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  function fail(result: { code: string; message: string }) {
    setError(result.message);
    if (result.code === 'AUTH_REQUIRED') onSignedOut();
  }
  // Errors that happen while a lesson is open show as a toast with a retry action.
  useEffect(() => {
    if (!error || !lesson) return;
    toast.error('Something went wrong', {
      description: error,
      action: { label: 'Try again', onClick: () => void load(lesson.chapter.slug, true) },
    });
    // The toast should fire once per error message, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  async function load(chapter: string, refresh = false) {
    const request = ++generation.current;
    if (!refresh) {
      setLoading(true);
      setLesson(null);
      setQuiz(null);
    }
    setError('');
    try {
      const result = await window.buildment.learning.lesson(
        courseSlug,
        chapter,
      );
      if (request !== generation.current) return;
      if (!result.ok) {
        fail(result);
        return;
      }
      setLesson(result.data);
      if (!result.data.locked && result.data.chapter.readerMode === 'QUIZ') {
        const quizResult = await window.buildment.learning.quiz(
          result.data.chapter.id,
        );
        if (request !== generation.current) return;
        if (!quizResult.ok) fail(quizResult);
        else {
          const state = quizResult.data as QuizChapterState;
          setQuiz(state);
        }
      }
    } catch {
      if (request === generation.current)
        setError('Could not load the lesson. Please try again.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  async function start() {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const next = await window.buildment.startLearning(courseSlug);
      if (request !== generation.current) return;
      if (!next.ok) {
        fail(next);
        setLoading(false);
        return;
      }
      if (next.data.href) {
        await load(next.data.href.split('/').pop()!);
        return;
      }
      const overview = await window.buildment.learning.overview(courseSlug);
      if (request !== generation.current) return;
      if (!overview.ok) {
        fail(overview);
        setLoading(false);
        return;
      }
      const data = overview.data as {
        syllabus?: { modules: Array<{ chapters: Array<{ slug: string }> }> };
      };
      const first = data.syllabus?.modules.flatMap(
        (module) => module.chapters,
      )[0];
      if (first) await load(first.slug);
      else {
        setError('No lessons are available for this course yet.');
        setLoading(false);
      }
    } catch {
      if (request === generation.current) {
        setError('Could not open this course. Please try again.');
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    if (initialChapter) void load(initialChapter);
    else void start();
    return () => {
      generation.current++;
    };
  }, [courseSlug, initialChapter]);
  useEffect(() => {
    if (!loading) heading.current?.focus();
  }, [lesson?.chapter.id, loading]);

  async function complete() {
    if (!lesson || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.buildment.learning.complete(lesson.chapter.id);
      if (!result.ok) {
        fail(result);
      } else if ((result.data as { queued?: boolean } | null)?.queued) {
        // Offline: the completion is queued and syncs in the background, so reloading would only fail.
        setQueuedChapter(lesson.chapter.id);
        toast.info('Saved offline', { description: 'This lesson will be marked complete when you are back online.' });
      } else {
        playFeedback('completion');
        void trackDot({ type: 'chapter_completed', chapterId: lesson.chapter.id });
        await load(lesson.chapter.slug, true);
      }
    } catch {
      toast.error('Could not save lesson completion', {
        description: 'Try again in a moment.',
        action: { label: 'Try again', onClick: () => void complete() },
      });
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => {
    if (lesson) void load(lesson.chapter.slug, true);
  };
  return (
    <CourseNavigationProvider onNavigate={navigate}>
      <VariantThemeScope variant={variantForTrack(lesson?.track ?? null)}>
        <div className="course-overview-surface flex h-full flex-col overflow-hidden bg-background">
          {!quiz && (
          <DesktopToolbar>
            <div className="flex min-w-0 items-center gap-2">
              <SidebarToggle
                collapsed={sidebarClosed}
                onClick={() => setSidebarClosed(!sidebarClosed)}
              />
              <button
                aria-label="Back to course preview"
                title="Back to course preview"
                onClick={onBack}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={16} />
                <span>Course</span>
              </button>
              <div className="min-w-0 border-l border-border pl-3">
                <p className="truncate text-[11px] font-medium text-muted-foreground">
                  {lesson?.course.title || courseTitle}
                </p>
                <p className="truncate text-[13px] font-semibold">
                  {lesson?.chapter.title || 'Loading lesson…'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showHeadings && Boolean(annotated?.headings.length) && (
                <TocToggle
                  collapsed={tocClosed}
                  onClick={() => setTocClosed(!tocClosed)}
                />
              )}
              <OpenIDEButton />
              <AccountMenu session={session} />
            </div>
          </DesktopToolbar>
          )}
          {session.authError && (
            <p role="alert" className="m-5 rounded border border-border p-4">
              {session.authError}
            </p>
          )}
          {error && !lesson && !loading && (
            <div role="alert" className="m-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
              <p className="font-semibold text-foreground">This lesson did not load</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button
                type="button"
                className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
                onClick={() => void start()}
              >
                Try again
              </button>
            </div>
          )}
          {loading && <LessonLoading />}
          {lesson && !loading && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className={ide.open ? 'hidden' : 'contents'}>
                {lesson.chapter.readerMode !== 'QUIZ' && (
                <ChapterSidebar
                  courseSlug={courseSlug}
                  courseTitle={lesson.course.title}
                  modules={lesson.modules}
                  currentChapterSlug={lesson.chapter.slug}
                  collapsed={sidebarClosed}
                  mobileSheet={smallWindow}
                  width={sidebarWidth}
                  onWidthChange={resizeSidebar}
                  onToggle={() => setSidebarClosed(true)}
                />
                )}
              </div>
              <div
                className={`${ide.open && (ide.focused || smallWindow) ? 'hidden' : ''} min-w-0 flex-1 overflow-y-auto`}
                key={lesson.chapter.id}
              >
                <article className="mx-auto w-full min-w-0 max-w-[860px] px-7 py-10 lg:px-12 lg:py-14">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Lesson {lesson.chapter.lessonLabel}
                    {lesson.chapter.estimatedMinutes
                      ? ' · ' + lesson.chapter.estimatedMinutes + ' min'
                      : ''}
                  </p>
                  <h1
                    ref={heading}
                    tabIndex={-1}
                    className="max-w-[24ch] text-3xl font-semibold leading-tight tracking-tight outline-none lg:text-4xl"
                  >
                    {lesson.chapter.title}
                  </h1>
                  {lesson.course.projectGoal &&
                    lesson.chapter.readerMode !== 'QUIZ' && (
                      <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">
                          The project:{' '}
                        </span>
                        {lesson.course.projectGoal.trim().replace(/\.+$/, '')}.
                      </div>
                    )}
                  {variant && lesson.chapter.readerMode !== 'QUIZ' && (
                    <div className="mt-2 rounded-xl bg-muted/60 px-4 py-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">
                        You are building:{' '}
                      </span>
                      {variant.productName} ({variant.label.toLowerCase()}{' '}
                      variant)
                    </div>
                  )}
                  {lesson.locked ? (
                    <div className="mt-6">
                      <p>
                        This lesson is locked. Finish{' '}
                        {lesson.previous?.title || 'the previous lesson'} first.
                      </p>
                      {lesson.previous && (
                        <button
                          className="mt-4 underline"
                          onClick={() => void load(lesson.previous!.slug)}
                        >
                          Open previous lesson
                        </button>
                      )}
                    </div>
                  ) : (
                    lesson.content && (
                      <>
                        {lesson.chapter.readerMode === 'QUIZ' ? (
                          quiz ? (
                            <QuizSession
                              key={lesson.chapter.id}
                              chapterId={lesson.chapter.id}
                              state={quiz}
                              complete={lesson.content.chapterComplete}
                              onSaved={refresh}
                              onExit={onBack}
                            />
                          ) : (
                            <p role="status">Loading quiz…</p>
                          )
                        ) : (
                          <div
                            key={lesson.chapter.id}
                            className="lesson-prose mt-8"
                          >
                            {lesson.content.predictGate &&
                            !lesson.content.predictRevealed ? (
                              <>
                                <p>
                                  Answer the prediction before reading the
                                  lesson.
                                </p>
                                <PredictionContent
                                  node={lesson.document}
                                  onSaved={refresh}
                                />
                              </>
                            ) : (
                              <LessonContent
                                node={annotated?.document || lesson.document}
                                lesson={lesson}
                                onSaved={refresh}
                              />
                            )}
                          </div>
                        )}
                        <footer className="mt-10 space-y-4 border-t border-border pt-6">
                          <p className="text-sm text-muted-foreground">
                            {lesson.content.checkpointsCompleted} /{' '}
                            {lesson.content.checkpointsTotal} checkpoints
                            complete
                          </p>
                          {lesson.content.reflectionPending && (
                            <p>
                              Save your learning reflection to complete this
                              lesson.
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3">
                            {lesson.prev && (
                              <button
                                disabled={busy}
                                onClick={() => void load(lesson.prev!.slug)}
                                className="rounded-lg border border-border px-4 py-2"
                              >
                                Previous lesson
                              </button>
                            )}
                            <button
                              disabled={busy || !lesson.content.canMarkComplete || queuedChapter === lesson.chapter.id}
                              onClick={() => void complete()}
                              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                            >
                              {lesson.content.chapterComplete
                                ? 'Lesson completed'
                                : queuedChapter === lesson.chapter.id
                                  ? 'Saved offline'
                                  : busy
                                    ? 'Saving…'
                                    : 'Mark lesson complete'}
                            </button>
                            {lesson.next && (
                              <button
                                disabled={busy || lesson.content.nextLocked}
                                onClick={() => void load(lesson.next!.slug)}
                                className="rounded-lg border border-border px-4 py-2 disabled:opacity-50"
                              >
                                Next lesson
                              </button>
                            )}
                          </div>
                        </footer>
                      </>
                    )
                  )}
                </article>
              </div>
              {showHeadings && !ide.open && (
                <ChapterToc
                  headings={annotated?.headings || []}
                  collapsed={tocClosed}
                  mobileSheet={smallWindow}
                  onToggle={() => setTocClosed(true)}
                />
              )}
              {ide.open && !ide.focused && !smallWindow && (
                <ResizeDivider onResize={handleResize} />
              )}
              <CourseIDEPanel
                courseSlug={courseSlug}
                courseTitle={courseTitle}
                smallWindow={smallWindow}
                widthPercent={idePaneWidth}
              />
            </div>
          )}
        </div>
      </VariantThemeScope>
    </CourseNavigationProvider>
  );
}
function PredictionContent({
  node,
  onSaved,
}: {
  node: import('../../domain/learning').LessonNode;
  onSaved: () => void;
}) {
  const id = node.attributes?.id || node.attributes?.blockId;
  if (node.name === 'Predict' && typeof id === 'string')
    return <Exercise id={id} onSaved={onSaved} />;
  return (
    <>
      {node.children?.map((child, index) => (
        <PredictionContent key={index} node={child} onSaved={onSaved} />
      ))}
    </>
  );
}
