"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import { useBrowserStorage, useHydrated } from "@/lib/use-browser-storage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChapterSidebar, SidebarToggle } from "@/components/learn/chapter-sidebar";
import { ChapterHighlights } from "@/components/learn/chapter-highlights";
import { ChapterToc, TocToggle } from "@/components/learn/chapter-toc";
import { ChapterNav } from "@/components/learn/chapter-nav";
import { ReadingProgressBar, useReadingProgress } from "@/components/learn/chapter-progress-bar";
import { CheckpointHeaderLabel } from "@/components/learn/checkpoint-header-label";
import { ChecklistProvider } from "@/components/learn/checklist";
import { LearningLogProvider } from "@/components/learn/learning-log";
import { UserMenuDropdown } from "@/components/user-menu-dropdown";
import { ReaderShellFade, ReaderShellSkeleton } from "@/components/learn/reader-shell-skeleton";
import { FocusModeToggle, ReaderFocusDock } from "@/components/learn/reader-focus-dock";
import { cn } from "@/lib/utils";
import { useReaderLayout } from "@/lib/use-reader-layout";
import type { Heading } from "@/shared/lib/mdx-headings";
import type { ReaderHighlight } from "@/shared/api/reader";
import type { SyllabusModule } from "@/components/learn/course-syllabus";
import { AskHelpDialog } from "@/components/help/ask-help-dialog";
import { ReportIssueDialog } from "@/components/help/report-issue-dialog";
import { StudyClock } from "@/components/learn/study-time-chip";
import { useStudySession } from "@/lib/use-study-session";
import { useMascot } from "@/lib/engagement/use-mascot";
import { ThemeToggle } from "@/components/theme-toggle";
import type { HelpThreadView } from "@/shared/api/help";
import type { StreakMilestone } from "@/shared/lib/streak";
import { HeadingNotesProvider } from "@/components/learn/heading-note";
import { ChapterAudio } from "@/components/learn/chapter-audio";
import { CourseRatingPrompt } from "@/components/learn/course-rating-modal";
import { AskChapterPanel } from "@/components/learn/ask-chapter-panel";
import { AskChapterProvider } from "@/components/learn/ask-chapter-context";
import { AskAiFloating, AskAiHeaderButton } from "@/components/learn/ask-ai-floating";
import type { ChapterNarration } from "@/lib/narration";
import { PredictRevealProvider } from "@buildment/learning-ui/components/learn/predict-reveal";
import { ChapterLinkProvider } from "@buildment/learning-ui/components/learn/chapter-link-context";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

function FocusProgressBar({ scrollRef }: { scrollRef: React.RefObject<HTMLElement | null> }) {
  const { progress } = useReadingProgress(scrollRef);
  if (progress <= 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] h-0.5 bg-border/80">
      <div
        className="h-full bg-foreground/40 transition-[width] duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function ChapterReaderShell({
  courseSlug,
  courseTitle,
  lessonLabel,
  chapterTitle,
  modules,
  headings,
  prev,
  next,
  chapterSlug,
  chapterId,
  estimatedMinutes = null,
  readerMode = "DEFAULT",
  learningLogAnswers = {},
  checklistState = {},
  chapterComplete,
  canMarkComplete,
  checkpointsCompleted,
  checkpointsTotal,
  isGateChapter = false,
  nextLocked,
  reflectionPending = false,
  projectGoal = null,
  variant = null,
  recap,
  streakMilestone = null,
  headingNotes = {},
  highlights = [],
  predictGate = false,
  predictRevealed = true,
  promptCourseRating = false,
  courseId,
  helpThread,
  narration = null,
  user,
  signOutAction,
  children,
}: {
  courseSlug: string;
  courseTitle: string;
  lessonLabel: string;
  chapterTitle: string;
  chapterSlug: string;
  chapterId: string;
  estimatedMinutes?: number | null;
  readerMode?: "DEFAULT" | "QUIZ";
  learningLogAnswers?: Record<string, string>;
  checklistState?: Record<string, boolean>;
  chapterComplete: boolean;
  canMarkComplete: boolean;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  isGateChapter?: boolean;
  nextLocked: boolean;
  reflectionPending?: boolean;
  projectGoal?: string | null;
  /** The learner's variant in a course family; the shell is already themed by it. */
  variant?: { productName: string; label: string } | null;
  recap?: { checks: string; open: string; next: string };
  streakMilestone?: StreakMilestone | null;
  headingNotes?: Record<string, string>;
  highlights?: ReaderHighlight[];
  predictGate?: boolean;
  predictRevealed?: boolean;
  promptCourseRating?: boolean;
  courseId: string;
  helpThread: HelpThreadView | null;
  /** Listen-along audio for this chapter, when its course has it. */
  narration?: ChapterNarration | null;
  modules: SyllabusModule[];
  headings: Heading[];
  prev?: { slug: string; title: string; moduleOrder: number; order: number };
  next?: { slug: string; title: string; moduleOrder: number; order: number };
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const {
    isMobile,
    leftCollapsed,
    setLeftCollapsed,
    rightCollapsed,
    setRightCollapsed,
    skipSkeleton,
  } = useReaderLayout(courseSlug);
  const scrollRef = useRef<HTMLElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const hydrated = useHydrated();
  const [focusStored, setFocusStored] = useBrowserStorage("buildment:reader-focus", "0");
  const focusMode = hydrated && focusStored === "1";

  const [showSkeleton, setShowSkeleton] = useState(!skipSkeleton);
  const [mentorOpen, setMentorOpen] = useState(false);
  const openMentor = useCallback(() => setMentorOpen(true), []);
  const study = useStudySession(chapterId);
  const layoutBeforeFocus = useRef({ left: true, right: true });
  const skipFocusRestore = useRef(false);
  const wantsFullscreen = useRef(false);

  // After a long while on an unfinished chapter, the helper mascot offers a mentor.
  useMascot({ watchChapter: chapterComplete ? null : { chapterId, estimatedMinutes } });
  const quizAutoFocusSlug = useRef<string | null>(null);

  const exitFocusMode = useCallback(async () => {
    skipFocusRestore.current = false;
    wantsFullscreen.current = false;
    setFocusStored("0");
    setLeftCollapsed(layoutBeforeFocus.current.left);
    setRightCollapsed(layoutBeforeFocus.current.right);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* user gesture may be required */
      }
    }
  }, [setFocusStored, setLeftCollapsed, setRightCollapsed]);

  const enterFocusMode = useCallback(async () => {
    skipFocusRestore.current = true;
    if (focusStored !== "1") {
      layoutBeforeFocus.current = { left: leftCollapsed, right: rightCollapsed };
    }
    setFocusStored("1");
    setLeftCollapsed(true);
    setRightCollapsed(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* fullscreen optional */
    }
    wantsFullscreen.current = Boolean(document.fullscreenElement);
  }, [focusStored, leftCollapsed, rightCollapsed, setFocusStored, setLeftCollapsed, setRightCollapsed]);

  const toggleFocusMode = useCallback(() => {
    if (focusMode) void exitFocusMode();
    else void enterFocusMode();
  }, [focusMode, enterFocusMode, exitFocusMode]);

  useEffect(() => {
    if (!hydrated || focusStored !== "1") {
      skipFocusRestore.current = false;
      return;
    }
    if (skipFocusRestore.current) return;
    skipFocusRestore.current = true;
    layoutBeforeFocus.current = { left: leftCollapsed, right: rightCollapsed };
    setLeftCollapsed(true);
    setRightCollapsed(true);
  }, [hydrated, focusStored, leftCollapsed, rightCollapsed, setLeftCollapsed, setRightCollapsed]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void exitFocusMode();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && wantsFullscreen.current) {
        void exitFocusMode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [focusMode, exitFocusMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [chapterSlug]);

  // `[` / `]` move between chapters. Arrow keys are left alone: code blocks scroll
  // sideways with them and some interactive blocks use them for their own steps.
  const prevHref = prev ? `/courses/${courseSlug}/${prev.slug}` : null;
  const nextHref = next && !nextLocked ? `/courses/${courseSlug}/${next.slug}` : null;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog[open]")) {
        return;
      }
      if (event.key === "]" && nextHref) router.push(nextHref);
      else if (event.key === "[" && prevHref) router.push(prevHref);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, prevHref, nextHref]);

  useEffect(() => {
    if (readerMode !== "QUIZ") return;
    if (quizAutoFocusSlug.current === chapterSlug) return;
    quizAutoFocusSlug.current = chapterSlug;
    void enterFocusMode();
  }, [chapterSlug, readerMode, enterFocusMode]);

  useEffect(() => {
    if (readerMode !== "QUIZ") return;
    const onQuizExitFocus = () => {
      void exitFocusMode();
    };
    window.addEventListener("buildment:quiz-perfect", onQuizExitFocus);
    window.addEventListener("buildment:quiz-exit", onQuizExitFocus);
    return () => {
      window.removeEventListener("buildment:quiz-perfect", onQuizExitFocus);
      window.removeEventListener("buildment:quiz-exit", onQuizExitFocus);
    };
  }, [readerMode, exitFocusMode]);

  // The quiz asks for focus mode again from a click ("Start quiz", "Return to full
  // screen"), which is the user gesture full screen needs.
  useEffect(() => {
    if (readerMode !== "QUIZ") return;
    const onQuizFocus = () => {
      if (!focusMode) {
        void enterFocusMode();
        return;
      }
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener("buildment:quiz-focus", onQuizFocus);
    return () => window.removeEventListener("buildment:quiz-focus", onQuizFocus);
  }, [readerMode, focusMode, enterFocusMode]);

  useEffect(() => {
    if (!showSkeleton) return;
    const timer = window.setTimeout(() => setShowSkeleton(false), 280);
    return () => window.clearTimeout(timer);
  }, [chapterSlug, showSkeleton]);

  return (
    <AskChapterProvider chapterId={chapterId} headings={headings} enabled={readerMode !== "QUIZ"} onAskMentor={openMentor}>
    <div
      data-reader-mode={readerMode}
      className={cn("relative h-[100dvh] overflow-hidden bg-background text-foreground", focusMode && "bg-background")}
    >
      {showSkeleton && !skipSkeleton ? (
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
          <ReaderShellSkeleton visible />
        </div>
      ) : null}

      <ReaderShellFade>
        {!focusMode && (
          <header className="shrink-0 border-b border-border bg-card">
            <div className="flex min-h-14 items-center gap-1 px-2 py-1 sm:gap-2 sm:px-4">
              <Link
                href={`/courses/${courseSlug}`}
                aria-label={`Back to ${courseTitle}`}
                className="grid size-11 place-items-center rounded-md text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-yellow"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
              <div className="min-w-0 flex-1 px-1">
                {/* The course name keeps "where am I" answered on every lesson, not only the course page. */}
                <p className="truncate text-[13px] text-muted-foreground">
                  <span className="tabular-nums">{lessonLabel}</span>
                  <span aria-hidden> · </span>
                  {courseTitle}
                </p>
                <p className="truncate text-[15px] font-bold leading-tight text-foreground">{chapterTitle}</p>
              </div>
              <CheckpointHeaderLabel
                completed={checkpointsCompleted}
                total={checkpointsTotal}
                chapterComplete={chapterComplete}
              />
              <StudyClock
                className="hidden sm:flex"
                status={study.status}
                pauseReason={study.pauseReason}
                busy={study.busy}
                sessionSeconds={study.sessionSeconds}
                chapterTotalSeconds={study.chapterTotalSeconds}
                estimatedMinutes={estimatedMinutes}
                onStart={study.start}
                onPause={study.pause}
                onResume={study.resume}
                onStop={study.stop}
              />
              <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                <SidebarToggle
                  collapsed={leftCollapsed}
                  onClick={() => setLeftCollapsed(!leftCollapsed)}
                />
                <AskAiHeaderButton />
                <AskHelpDialog
                  open={mentorOpen}
                  onOpenChange={setMentorOpen}
                  courseId={courseId}
                  courseSlug={courseSlug}
                  chapterId={chapterId}
                  chapterTitle={chapterTitle}
                  viewerId={user.id}
                  thread={helpThread}
                />
                <div className="hidden items-center gap-1.5 sm:flex">
                  <ThemeToggle />
                  <FocusModeToggle active={focusMode} onClick={toggleFocusMode} />
                </div>
                <div className="hidden md:block">
                  <TocToggle
                  collapsed={rightCollapsed}
                  onClick={() => setRightCollapsed(!rightCollapsed)}
                />
                </div>
                <UserMenuDropdown user={user} compact signOutAction={signOutAction} />
              </div>
            </div>
            <ReadingProgressBar scrollRef={scrollRef} />
          </header>
        )}

        {focusMode && (
          <StudyClock
            className="fixed right-4 top-3 z-40"
            status={study.status}
            pauseReason={study.pauseReason}
            busy={study.busy}
            sessionSeconds={study.sessionSeconds}
            chapterTotalSeconds={study.chapterTotalSeconds}
            estimatedMinutes={estimatedMinutes}
            onStart={study.start}
            onPause={study.pause}
            onResume={study.resume}
            onStop={study.stop}
          />
        )}

        {focusMode && <FocusProgressBar scrollRef={scrollRef} />}

        <div className="flex min-h-0 flex-1">
          <ChapterSidebar
            courseTitle={courseTitle}
            courseSlug={courseSlug}
            modules={modules}
            currentChapterSlug={chapterSlug}
            collapsed={leftCollapsed}
            onToggle={() => setLeftCollapsed(!leftCollapsed)}
            mobileSheet={isMobile || focusMode}
          />

          <div className="flex min-w-0 flex-1 overflow-hidden">
            <main
              ref={scrollRef}
              className={cn(
                "flex-1 overflow-y-auto",
                focusMode ? "px-4 pt-10 pb-24 sm:px-8 lg:px-16" : "px-4 pt-8 pb-24 sm:px-6 lg:px-10"
              )}
              // The Listen player cancels this top padding so it can sit flush with the top edge while pinned.
              style={{ "--reader-pt": focusMode ? "2.5rem" : "2rem" } as CSSProperties}
            >
              {/* ~70 characters per line at 18px: long chapters stay comfortable to read. */}
              <div className="mx-auto max-w-[40rem]">
                <header className={cn("mb-10", readerMode === "QUIZ" && "sr-only")}>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">{lessonLabel}</p>
                  <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground text-balance sm:text-[2.125rem]">
                    {chapterTitle}
                  </h1>
                  {projectGoal && readerMode !== "QUIZ" ? (
                    <p className="mt-4 border border-border bg-card px-4 py-3 text-base leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground">The project: </span>
                      {projectGoal.trim().replace(/\.+$/, "")}.
                    </p>
                  ) : null}
                  {variant && readerMode !== "QUIZ" ? (
                    <p className="mt-2 bg-secondary px-4 py-3 text-base leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground/80">You are building: </span>
                      {variant.productName} ({variant.label.toLowerCase()} variant)
                    </p>
                  ) : null}
                  {isGateChapter && readerMode !== "QUIZ" ? (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                      <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                        Module gate
                      </span>
                      <span className="text-muted-foreground">
                        {nextLocked
                          ? "Check every item and answer the learning log. The next chapter stays locked until both are saved."
                          : "Check every item and answer the learning log to complete this gate chapter."}
                      </span>
                    </p>
                  ) : null}
                  {checkpointsTotal > 0 && (
                    <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground md:hidden">
                      {chapterComplete
                        ? "All checkpoints complete"
                        : `${checkpointsCompleted}/${checkpointsTotal} checkpoints`}
                    </p>
                  )}
                </header>

                {/* Outside the header so it can stay pinned to the top while the chapter scrolls. */}
                {narration && readerMode !== "QUIZ" ? (
                  <ChapterAudio className="-mt-4 mb-8" src={narration.src} minutes={narration.minutes} bytes={narration.bytes} title={chapterTitle} />
                ) : null}

                <ChapterLinkProvider courseSlug={courseSlug} modules={modules}>
                  <LearningLogProvider chapterId={chapterId} initialAnswers={learningLogAnswers}>
                    <ChecklistProvider chapterId={chapterId} initialChecks={checklistState}>
                      <article
                        ref={articleRef}
                        className={cn(
                          "prose prose-neutral max-w-none",
                          "prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-headings:text-balance",
                          "prose-h2:mt-14 prose-h2:mb-5 prose-h2:border-b prose-h2:border-border prose-h2:pb-2.5 prose-h2:text-[1.5rem] prose-h2:leading-snug prose-h2:first:mt-0",
                          "prose-h3:mt-10 prose-h3:mb-3 prose-h3:text-[1.25rem] prose-h3:leading-snug",
                          "prose-p:my-5 prose-p:text-[1.0625rem] prose-p:leading-[1.8] sm:prose-p:text-[1.125rem] sm:prose-p:leading-[1.75]",
                          "prose-li:my-1.5 prose-li:text-[1.0625rem] prose-li:leading-[1.75] sm:prose-li:text-[1.125rem]",
                          "prose-a:font-medium prose-a:underline-offset-4 prose-a:decoration-foreground/30 hover:prose-a:decoration-foreground",
                          "prose-strong:font-semibold prose-strong:text-foreground",
                          "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
                          "prose-pre:max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0",
                          "prose-figure:my-6",
                          "prose-blockquote:rounded-lg prose-blockquote:border-0 prose-blockquote:bg-secondary prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:not-italic",
                          "prose-hr:border-border",
                          "prose-img:rounded-xl prose-img:border prose-img:border-border",
                          "prose-figure:my-8 prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground",
                          "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto prose-th:whitespace-nowrap prose-td:align-top prose-td:text-sm"
                        )}
                      >
                        <HeadingNotesProvider chapterId={chapterId} notes={headingNotes}>
                          <PredictRevealProvider gate={predictGate} revealed={predictRevealed}>
                            {children}
                          </PredictRevealProvider>
                        </HeadingNotesProvider>
                      </article>
                    </ChecklistProvider>
                  </LearningLogProvider>
                </ChapterLinkProvider>

                {readerMode !== "QUIZ" ? (
                  <ChapterHighlights chapterId={chapterId} initialHighlights={highlights} articleRef={articleRef} />
                ) : null}

                {readerMode !== "QUIZ" ? <AskChapterPanel /> : null}

                {!(focusMode && readerMode === "QUIZ") ? (
                  <ChapterNav
                    courseSlug={courseSlug}
                    prev={prev}
                    next={next}
                    nextLocked={nextLocked}
                    chapterId={chapterId}
                    chapterComplete={chapterComplete}
                    canMarkComplete={canMarkComplete}
                    checkpointsCompleted={checkpointsCompleted}
                    checkpointsTotal={checkpointsTotal}
                    nextHref={next ? `/courses/${courseSlug}/${next.slug}` : undefined}
                    nextTitle={next?.title}
                    reflectionPending={reflectionPending}
                    courseCompleted={modules.reduce((total, module) => total + module.completedCount, 0)}
                    courseTotal={modules.reduce((total, module) => total + module.chapters.length, 0)}
                    recap={recap}
                    streakMilestone={streakMilestone}
                  />
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3">
                  {prevHref || nextHref ? (
                    <p className="hidden text-xs text-muted-foreground md:block">
                      Tip: press{" "}
                      {prevHref ? (
                        <>
                          <Kbd>[</Kbd> for the previous chapter
                        </>
                      ) : null}
                      {prevHref && nextHref ? " and " : null}
                      {nextHref ? (
                        <>
                          <Kbd>]</Kbd> for the next
                          {prevHref ? null : " chapter"}
                        </>
                      ) : null}
                      .
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="ml-auto">
                    <ReportIssueDialog
                      courseId={courseId}
                      chapterId={chapterId}
                      chapterTitle={chapterTitle}
                    />
                  </div>
                </div>
              </div>
            </main>

            <ChapterToc
              headings={headings}
              collapsed={rightCollapsed}
              onToggle={() => setRightCollapsed(!rightCollapsed)}
              mobileSheet={isMobile || focusMode}
            />
          </div>
        </div>

        {focusMode && <ReaderFocusDock onExitFocus={() => void exitFocusMode()} />}
        <AskAiFloating focusMode={focusMode} />
        <CourseRatingPrompt
          courseSlug={courseSlug}
          courseTitle={courseTitle}
          shouldPrompt={promptCourseRating}
        />
      </ReaderShellFade>
    </div>
    </AskChapterProvider>
  );
}
