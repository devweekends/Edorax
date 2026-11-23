"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, PlayCircle, RotateCcw, X } from "lucide-react";
import { Dot } from "@/components/brand/dot";
import { Button } from "@/components/ui/button";
import { playFeedback } from "@/lib/sound-feedback";
import { apiFetch } from "@/lib/api-client";
import { markChapterComplete } from "@/server/actions/progress";
import { cn } from "@/lib/utils";
import { QuizSessionContext, type QuizBlockGrade } from "@buildment/learning-ui/components/learn/quiz-session-context";
import { QuizIntegrityPanel } from "@/components/learn/quiz-integrity-panel";
import { requestQuizFullscreen, useQuizIntegrity } from "@/lib/integrity/use-quiz-integrity";
import { useMascot } from "@/lib/engagement/use-mascot";
import { QuizGuardNotice } from "@/components/learn/quiz-guard-notice";
import { useQuizGuard } from "@/lib/integrity/quiz-guard";

type QuizResultSummary = { score: number; maxScore: number; questions: number };

type QuizSubmitResponse = QuizResultSummary & {
  grades: Array<{
    blockId: string;
    isCorrect: boolean | null;
    score: number | null;
    maxScore: number | null;
    selected: string[];
    explanation?: string;
    correctOptionIds?: string[];
  }>;
  assessment: QuizAssessment | null;
};

type QuizAssessment = {
  score: number;
  maxScore: 100;
  passingScore: number;
  passed: boolean;
  allAttempted: boolean;
  deterministic: { score: number; weight: number; attempted: number; total: number } | null;
  ai: { score: number; weight: number; attempted: number; total: number } | null;
};

function isPerfectScore(summary: QuizResultSummary | null) {
  return Boolean(summary && summary.maxScore > 0 && summary.score === summary.maxScore);
}

function missedQuestionIndices(
  stepIds: string[],
  quizBlockIds: string[],
  grades: Record<string, QuizBlockGrade>
) {
  const quizIds = new Set(quizBlockIds);
  return stepIds.flatMap((id, index) =>
    quizIds.has(id) && grades[id]?.isCorrect !== true ? [index] : []
  );
}

export function QuizChapterSessionClient({
  children,
  chapterId,
  chapterTitle,
  quizBlockIds,
  stepIds,
  individualActivityCount = 0,
  draftStoragePrefix,
  initialAnswers,
  initialScoreSummary,
  initialBlockGrades,
  initialAssessment,
  nextHref,
  nextLocked,
  canMarkComplete,
  chapterComplete,
}: {
  children: React.ReactNode;
  chapterId: string;
  chapterTitle: string;
  quizBlockIds: string[];
  stepIds: string[];
  individualActivityCount?: number;
  draftStoragePrefix: string;
  initialAnswers: Record<string, string[]>;
  initialScoreSummary: QuizResultSummary | null;
  initialBlockGrades: Record<string, QuizBlockGrade>;
  initialAssessment: QuizAssessment | null;
  nextHref?: string;
  nextLocked: boolean;
  canMarkComplete: boolean;
  chapterComplete: boolean;
}) {
  const router = useRouter();
  const { track } = useMascot();
  const steps = React.Children.toArray(children).filter(Boolean);
  const total = steps.length;
  const [index, setIndex] = useState(() =>
    isPerfectScore(initialScoreSummary)
      ? Math.max(0, total - 1)
      : initialScoreSummary
        ? (missedQuestionIndices(stepIds, quizBlockIds, initialBlockGrades)[0] ?? 0)
        : 0
  );
  const [retryMissed, setRetryMissed] = useState(() =>
    Boolean(
      initialScoreSummary && !initialAssessment?.passed &&
      !isPerfectScore(initialScoreSummary) &&
      missedQuestionIndices(stepIds, quizBlockIds, initialBlockGrades).length > 0
    )
  );
  const [submitting, setSubmitting] = useState(false);
  const [movingNext, setMovingNext] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Step indexes of questions with no answer, shown as an inline note instead of a browser pop-up.
  const [unanswered, setUnanswered] = useState<number[]>([]);
  const [scoreSummary, setScoreSummary] = useState<QuizResultSummary | null>(initialScoreSummary);
  const [blockGrades, setBlockGrades] = useState<Record<string, QuizBlockGrade>>(initialBlockGrades);
  const [dirtyBlockIds, setDirtyBlockIds] = useState<Set<string>>(() => new Set());
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string[]>>({});
  const [assessment, setAssessment] = useState<QuizAssessment | null>(initialAssessment);
  const [launched, setLaunched] = useState(false);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);

  const perfectScore = useMemo(() => isPerfectScore(scoreSummary), [scoreSummary]);
  const assessmentPassed = assessment?.passed ?? false;
  const canCompleteChapter = canMarkComplete || (assessmentPassed && individualActivityCount === 0);
  const reviewMode = scoreSummary !== null;
  const missedIndices = useMemo(
    () => missedQuestionIndices(stepIds, quizBlockIds, blockGrades),
    [stepIds, quizBlockIds, blockGrades]
  );
  const submissionComplete = Boolean(chapterComplete || assessmentPassed);
  const visibleIndices = useMemo(
    () => (launched && submissionComplete) || !(retryMissed && !perfectScore && missedIndices.length > 0)
      ? Array.from({ length: total }, (_, stepIndex) => stepIndex)
      : missedIndices,
    [launched, submissionComplete, retryMissed, perfectScore, missedIndices, total]
  );
  const position = Math.max(0, visibleIndices.indexOf(index));
  const activeIndex = visibleIndices[position] ?? 0;

  // Integrity signals run while the quiz is still open; a finished quiz is not watched.
  const sectionRef = useRef<HTMLElement>(null);
  const integrity = useQuizIntegrity({
    chapterId,
    enabled: launched && total > 0 && !chapterComplete && !assessmentPassed,
    rootRef: sectionRef,
    currentBlockId: stepIds[activeIndex] ?? null,
  });

  const guard = useQuizGuard({
    enabled: integrity.active,
    attemptId: integrity.session?.attemptId ?? null,
    blockId: stepIds[activeIndex] ?? null,
  });

  const [lastServerState, setLastServerState] = useState({ summary: initialScoreSummary, grades: initialBlockGrades, assessment: initialAssessment });
  if (lastServerState.summary !== initialScoreSummary || lastServerState.grades !== initialBlockGrades || lastServerState.assessment !== initialAssessment) {
    setLastServerState({ summary: initialScoreSummary, grades: initialBlockGrades, assessment: initialAssessment });
    setScoreSummary(initialScoreSummary);
    setBlockGrades(initialBlockGrades);
    setAssessment(initialAssessment);
    setDirtyBlockIds(new Set());
    const firstMissed = missedQuestionIndices(stepIds, quizBlockIds, initialBlockGrades)[0];
    setRetryMissed(Boolean(initialScoreSummary && !initialAssessment?.passed && !isPerfectScore(initialScoreSummary) && firstMissed !== undefined));
    if (initialScoreSummary && !initialAssessment?.passed && !isPerfectScore(initialScoreSummary) && firstMissed !== undefined) {
      setIndex(firstMissed);
    } else if (isPerfectScore(initialScoreSummary)) {
      setIndex(Math.max(0, total - 1));
    }
  }

  useEffect(() => {
    if (initialAssessment?.passed) {
      window.dispatchEvent(new Event("buildment:quiz-perfect"));
    }
  }, [initialAssessment]);

  const go = (nextPosition: number) => {
    const boundedPosition = Math.max(0, Math.min(visibleIndices.length - 1, nextPosition));
    setIndex(visibleIndices[boundedPosition] ?? 0);
  };

  useEffect(() => {
    const onAnswerChange = (event: Event) => {
      const detail = (event as CustomEvent<{ blockId: string; selected: string[] }>).detail;
      if (!detail || !Array.isArray(detail.selected)) return;
      setDraftAnswers((previous) => ({ ...previous, [detail.blockId]: detail.selected }));
      setDirtyBlockIds((previous) => {
        const next = new Set(previous);
        next.add(detail.blockId);
        return next;
      });
      setSubmitError(null);
      setUnanswered((previous) => (previous.length > 0 ? previous.filter((stepIndex) => stepIds[stepIndex] !== detail.blockId) : previous));
    };
    window.addEventListener("buildment:quiz-answer-change", onAnswerChange);
    return () => {
      window.removeEventListener("buildment:quiz-answer-change", onAnswerChange);
    };
  }, [stepIds]);

  const submitQuiz = async (force = false) => {
    if (submitting || perfectScore || quizBlockIds.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const answers = quizBlockIds.map((blockId) => {
      const savedCorrectAnswer = blockGrades[blockId]?.isCorrect === true
        ? blockGrades[blockId].selected
        : null;
      let selected = savedCorrectAnswer ?? draftAnswers[blockId] ?? initialAnswers[blockId] ?? [];
      if (!savedCorrectAnswer && !Object.prototype.hasOwnProperty.call(draftAnswers, blockId)) {
        try {
          const saved = window.localStorage.getItem(`${draftStoragePrefix}:${blockId}`);
          if (saved !== null) {
            const parsed: unknown = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) {
              selected = parsed;
            }
          }
        } catch {
          // The active quiz component reports its selection through the page event.
        }
      }
      return { blockId, selected };
    });
    const missing = answers.flatMap((answer) => (answer.selected.length === 0 ? [stepIds.indexOf(answer.blockId)] : []));
    if (missing.length > 0 && !force) {
      setUnanswered(missing.filter((stepIndex) => stepIndex >= 0));
      setSubmitting(false);
      return;
    }
    setUnanswered([]);
    integrity.checkPace(reviewMode ? quizBlockIds.filter((blockId) => dirtyBlockIds.has(blockId)) : quizBlockIds);

    try {
      const body = await apiFetch<QuizSubmitResponse>(`/api/v1/chapters/${encodeURIComponent(chapterId)}/quiz/submit`, {
        method: "POST",
        json: { answers },
      });

      const summary = { score: body.score, maxScore: body.maxScore, questions: body.questions };
      setScoreSummary(summary);
      setAssessment(body.assessment);
      setResultPopupOpen(true);
      track({ type: "quiz_submitted", chapterId });
      setDirtyBlockIds(new Set());

      const gradesFromApi = Array.isArray(body.grades) ? body.grades : [];
      if (gradesFromApi.length > 0) {
        setBlockGrades((previous) => {
          const next = { ...previous };
          for (const grade of gradesFromApi) {
            const existing = previous[grade.blockId];
            next[grade.blockId] = {
              selected: Array.isArray(grade.selected)
                ? grade.selected.filter((item): item is string => typeof item === "string")
                : (existing?.selected ?? []),
              isCorrect: grade.isCorrect,
              explanation: grade.explanation ?? existing?.explanation,
              correctOptionIds: grade.correctOptionIds ?? existing?.correctOptionIds,
            };
          }
          return next;
        });
      }

      const nextMissed = missedQuestionIndices(
        stepIds,
        quizBlockIds,
        Object.fromEntries(gradesFromApi.map((grade) => [grade.blockId, { selected: grade.selected ?? [], isCorrect: grade.isCorrect }]))
      );
      const passed = Boolean(body.assessment?.passed);
      setRetryMissed(!passed && !isPerfectScore(summary) && nextMissed.length > 0);
      if (isPerfectScore(summary) || passed) setIndex(Math.max(0, total - 1));
      else if (nextMissed.length > 0) setIndex(nextMissed[0]);

      if (body.assessment?.passed) {
        playFeedback("celebration");
        if (individualActivityCount === 0) {
          integrity.finish();
          window.dispatchEvent(new Event("buildment:quiz-perfect"));
        }
        for (const blockId of quizBlockIds) {
          try {
            window.localStorage.removeItem(`${draftStoragePrefix}:${blockId}`);
          } catch {
            // Server is the source of truth after a perfect run.
          }
        }
      } else if (summary.score <= 0) {
        playFeedback("error");
      }
      if (!body.assessment?.passed) void integrity.nextAttempt();

      setDraftAnswers({});
      router.refresh();
    } catch (error) {
      playFeedback("error");
      setSubmitError(error instanceof Error ? error.message : "Could not submit the quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  // Full keyboard flow for the assessment: Enter starts it; 1-N selects an option (handled in
  // QuizClient); ArrowLeft / ArrowRight / Enter move between questions; at the last question (or on
  // the submit screen) Enter submits the assessment. Guards match the reader's shortcut guard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog[open]")) return;

      if (!launched) {
        if (event.key === "Enter") {
          event.preventDefault();
          setLaunched(true);
          requestQuizFullscreen();
        }
        return;
      }
      if (submitting || movingNext || submissionComplete) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (position > 0) go(position - 1);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (position < visibleIndices.length - 1) {
          go(position + 1);
        } else if (quizBlockIds.length > 0 && !perfectScore && !submitting) {
          void submitQuiz();
        }
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [launched, submitting, movingNext, submissionComplete, position, visibleIndices.length, quizBlockIds.length, perfectScore, go, submitQuiz]);

  const moveToNextChapter = async () => {
    if (!nextHref || movingNext) return;
    if (chapterComplete || (!nextLocked && (!assessmentPassed || !canCompleteChapter))) {
      router.push(nextHref);
      return;
    }
    if (!assessmentPassed || !canCompleteChapter) return;
    setMovingNext(true);
    setSubmitError(null);
    try {
      const result = await markChapterComplete({ chapterId });
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      track({ type: "chapter_completed", chapterId });
      router.push(nextHref);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not open the next chapter.");
    } finally {
      setMovingNext(false);
    }
  };


  const progressPct = visibleIndices.length > 0 ? ((position + 1) / visibleIndices.length) * 100 : 0;

  const sessionValue = useMemo(
    () => ({
      chapterTitle,
      questionTotal: total,
      reviewMode,
      dirtyBlockIds,
      blockGrades,
      reportWrongAttempt: () => {
        void integrity.nextAttempt();
      },
    }),
    [chapterTitle, total, reviewMode, dirtyBlockIds, blockGrades, integrity]
  );

  const exitQuiz = () => {
    integrity.dismissFullscreenPrompt();
    setLaunched(false);
    window.dispatchEvent(new Event("buildment:quiz-exit"));
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  if (total === 0) return null;

  if (!launched) {
    const buttonLabel = submissionComplete
      ? "Review submission"
      : assessment
        ? "Continue assessment"
        : "Start assessment";

    return (
      <section className="not-prose mb-10 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-7" aria-labelledby="quiz-launch-title">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {submissionComplete ? "Assessment complete" : "Chapter assessment"}
        </p>
        <h2 id="quiz-launch-title" className="mt-2 text-2xl font-semibold tracking-tight">{chapterTitle}</h2>
        {submissionComplete ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            This assessment is finished. Review every question with your answer, the correct answer, and the explanation.
          </p>
        ) : (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Work through one question at a time in a focused window. Automatic questions count for 80% and AI-graded written answers count for 20%.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setLaunched(true);
              requestQuizFullscreen();
            }}
            className="gap-2"
            variant={submissionComplete ? "outline" : "default"}
          >
            {submissionComplete ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <PlayCircle className="size-4" aria-hidden />
            )}
            {buttonLabel}
          </Button>
          {!submissionComplete && (
            <span className="text-sm text-muted-foreground">Pass at {assessment?.passingScore ?? 70}% · three graded attempts per written question</span>
          )}
        </div>
        {assessment ? (
          <p className={cn("mt-4 text-sm font-medium", assessment.passed && "text-ok")}>
            {assessment.passed ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4" aria-hidden />
                Passed with {assessment.score}%
              </span>
            ) : (
              <>Current score: {assessment.score}% · Not passed yet</>
            )}
          </p>
        ) : null}
      </section>
    );
  }

  const fullReview = submissionComplete;

  return (
    <QuizSessionContext.Provider value={sessionValue}>
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
        <section
          ref={sectionRef}
          id="quiz-chapter-session"
          className="not-prose mx-auto min-h-screen max-w-4xl px-4 py-6 text-foreground sm:px-8 sm:py-10"
          aria-label="Quiz session"
        >
          <div className="mb-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={exitQuiz}
              className="gap-1.5"
            >
              <X className="size-4" aria-hidden /> Save and close
            </Button>
          </div>
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl tracking-[-0.035em] text-foreground sm:text-3xl">
              Quiz: {chapterTitle}
            </h1>
            <p className="mt-3 text-base font-bold text-muted-foreground">
              {fullReview
                ? "Review your submission"
                : `Question ${position + 1} of ${visibleIndices.length}${retryMissed && !perfectScore ? " to retry" : ""}`}
            </p>
            {fullReview ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Each question shows the answer you submitted, the correct
                answer, and the explanation.
              </p>
            ) : null}
            <QuizIntegrityPanel
              integrity={integrity}
              questionCount={total}
              onExitQuiz={exitQuiz}
            />
            <QuizGuardNotice text={guard.notice} />
            {individualActivityCount > 0 ? (
              <p className="mt-2 text-base text-muted-foreground">
                Open questions and code exercises have their own Submit button.
                AI-graded written answers contribute 20% of the assessment
                score; mentor-reviewed writing is tracked separately.
              </p>
            ) : null}
            {assessment ? (
              <div
                className={cn(
                  "mt-3 border px-4 py-3 text-sm text-foreground",
                  assessment.passed
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border bg-secondary",
                )}
              >
                <span className="font-bold">
                  Weighted score {assessment.score}%
                </span>{" "}
                · pass at {assessment.passingScore}%
                {assessment.deterministic
                  ? ` · automatic ${assessment.deterministic.score}% × ${assessment.deterministic.weight}%`
                  : ""}
                {assessment.ai
                  ? ` · written ${assessment.ai.score}% × ${assessment.ai.weight}%`
                  : ""}
              </div>
            ) : null}
            {scoreSummary ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm text-card-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-primary">
                    Score: {scoreSummary.score} of {scoreSummary.maxScore}{" "}
                    correct
                  </span>
                  {!perfectScore && missedIndices.length > 0 ? (
                    <span className="text-muted-foreground">
                      · Complete the remaining {missedIndices.length}{" "}
                      {missedIndices.length === 1 ? "question" : "questions"}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {!perfectScore && missedIndices.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setRetryMissed((prev) => !prev);
                        setIndex(retryMissed ? 0 : (missedIndices[0] ?? 0));
                      }}
                    >
                      {retryMissed
                        ? "Review all"
                        : `Retry ${missedIndices.length} remaining`}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setResultPopupOpen(true)}
                  >
                    View result
                  </Button>
                </div>
              </div>
            ) : null}
            {fullReview ? null : (
              <div
                className="mt-4 h-2 overflow-hidden rounded-sm bg-secondary"
                role="progressbar"
                aria-valuenow={position + 1}
                aria-valuemin={1}
                aria-valuemax={visibleIndices.length}
                aria-label="Quiz progress"
              >
                <div
                  className="h-full rounded-sm bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </header>

          {scoreSummary && resultPopupOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quiz-result-popup-title"
              className="fixed inset-0 z-[75] flex items-center justify-center bg-background/85 p-4 text-foreground backdrop-blur-md"
            >
              <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
                <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-7">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-primary">Result</p>
                      <div
                        id="quiz-result-popup-title"
                        className="mt-1 flex items-baseline gap-2.5"
                      >
                        <span className="font-[family-name:var(--font-heading)] text-4xl font-bold leading-none tracking-[-0.035em] text-card-foreground sm:text-5xl">
                          {scoreSummary.score} of {scoreSummary.maxScore}
                        </span>
                        <span className="text-lg font-bold text-muted-foreground">
                          correct
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResultPopupOpen(false)}
                      aria-label="Close result"
                      className="grid size-10 shrink-0 place-items-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                    >
                      <X className="size-5" aria-hidden />
                    </button>
                  </div>

                  {assessment ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Weighted score{" "}
                      <strong className="text-card-foreground">
                        {assessment.score}%
                      </strong>{" "}
                      · pass at {assessment.passingScore}%
                    </p>
                  ) : null}

                  <div className="mt-5 flex items-center gap-3">
                    <Dot
                      mood={
                        perfectScore || assessmentPassed
                          ? "cheer"
                          : "determined"
                      }
                      size={56}
                    />
                    <p className="rounded-md bg-secondary px-4 py-3 text-sm font-bold leading-snug text-secondary-foreground sm:text-base">
                      {perfectScore
                        ? individualActivityCount > 0
                          ? "All multiple-choice answers are right. Complete the remaining activities to finish."
                          : "All correct. Well done!"
                        : assessmentPassed
                          ? `You passed the assessment! You can continue to the next chapter or retry the remaining ${missedIndices.length} ${missedIndices.length === 1 ? "question" : "questions"} to improve your score.`
                          : `Please complete the remaining ${missedIndices.length} ${missedIndices.length === 1 ? "question" : "questions"} to finish the quiz.`}
                    </p>
                  </div>

                  {!perfectScore && missedIndices.length > 0 ? (
                    <div className="mt-5">
                      <p className="text-sm font-bold text-card-foreground">
                        Remaining questions to complete
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {missedIndices.map((stepIndex) => (
                          <li key={stepIndex}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRetryMissed(true);
                                setIndex(stepIndex);
                                setResultPopupOpen(false);
                              }}
                            >
                              Question {stepIndex + 1}
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Your best score is kept.
                      </p>
                    </div>
                  ) : null}
                  {submitError ? (
                    <p className="mt-3 text-sm text-destructive" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:px-8">
                  {assessmentPassed && nextHref ? (
                    <>
                      <Button
                        type="button"
                        size="lg"
                        disabled={
                          movingNext ||
                          (nextLocked &&
                            !chapterComplete &&
                            !canCompleteChapter)
                        }
                        loading={movingNext}
                        onClick={() => void moveToNextChapter()}
                        className="w-full gap-1.5"
                      >
                        {movingNext ? "Opening next chapter…" : "Next chapter"}
                      </Button>
                      {!perfectScore && missedIndices.length > 0 ? (
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          onClick={() => {
                            setRetryMissed(true);
                            setIndex(missedIndices[0] ?? 0);
                            setResultPopupOpen(false);
                          }}
                          className="w-full gap-2"
                        >
                          <RotateCcw className="size-4" aria-hidden />
                          Retry {missedIndices.length} remaining{" "}
                          {missedIndices.length === 1
                            ? "question"
                            : "questions"}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="lg"
                        variant="ghost"
                        onClick={() => setResultPopupOpen(false)}
                        className="w-full"
                      >
                        Review answers
                      </Button>
                    </>
                  ) : !perfectScore && missedIndices.length > 0 ? (
                    <>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => {
                          setRetryMissed(true);
                          setIndex(missedIndices[0] ?? 0);
                          setResultPopupOpen(false);
                        }}
                        className="w-full gap-2"
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        Complete {missedIndices.length} remaining{" "}
                        {missedIndices.length === 1 ? "question" : "questions"}
                      </Button>
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        onClick={() => {
                          setRetryMissed(false);
                          setIndex(0);
                          setResultPopupOpen(false);
                        }}
                        className="w-full"
                      >
                        Review all answers
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => setResultPopupOpen(false)}
                      className="w-full"
                    >
                      {individualActivityCount > 0 && !assessmentPassed
                        ? "Complete remaining activities"
                        : "Continue"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative min-h-[12rem]">
            {steps.map((step, stepIndex) => (
              <div
                key={stepIds[stepIndex] ?? stepIndex}
                className={cn(
                  fullReview || stepIndex === activeIndex ? "block" : "hidden",
                  fullReview &&
                    "mb-12 border-b border-border pb-12 last:mb-0 last:border-b-0",
                )}
                aria-hidden={!fullReview && stepIndex !== activeIndex}
                data-integrity-step={stepIds[stepIndex]}
              >
                {fullReview ? (
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Question {stepIndex + 1}
                  </p>
                ) : null}
                {step}
              </div>
            ))}
          </div>

          {unanswered.length > 0 ? (
            <div
              role="status"
              className="mt-8 border-2 border-brand-yellow bg-brand-yellow/15 p-4 text-base leading-6"
            >
              <p>
                <b>
                  {unanswered.length === 1
                    ? "1 question has no answer yet."
                    : `${unanswered.length} questions have no answer yet.`}
                </b>{" "}
                Tap a number to go there.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {unanswered.map((stepIndex) => (
                  <Button
                    key={stepIndex}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-w-14"
                    onClick={() => setIndex(stepIndex)}
                  >
                    {stepIndex + 1}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void submitQuiz(true)}
                >
                  Submit anyway
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Questions without an answer are marked wrong.
              </p>
            </div>
          ) : null}

          <footer className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
            {fullReview ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exitQuiz}
              >
                Close review
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={position === 0}
                  onClick={() => go(position - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Back
                </Button>
                {position < visibleIndices.length - 1 ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => go(position + 1)}
                      className="gap-1"
                    >
                      {retryMissed && !perfectScore
                        ? "Next missed question"
                        : "Next"}
                      <ChevronRight className="size-4" aria-hidden />
                    </Button>
                    {assessmentPassed && nextHref ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          movingNext ||
                          (nextLocked &&
                            !chapterComplete &&
                            !canCompleteChapter)
                        }
                        loading={movingNext}
                        onClick={() => void moveToNextChapter()}
                        className="gap-1.5"
                      >
                        {movingNext ? "Opening next chapter…" : "Next chapter"}
                        {!movingNext ? (
                          <ChevronRight className="size-4" aria-hidden />
                        ) : null}
                      </Button>
                    ) : null}
                  </div>
                ) : assessmentPassed && nextHref ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!perfectScore && quizBlockIds.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={submitting}
                        loading={submitting}
                        onClick={() => void submitQuiz()}
                      >
                        {submitting ? "Submitting…" : "Submit again"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        movingNext ||
                        (nextLocked && !chapterComplete && !canCompleteChapter)
                      }
                      loading={movingNext}
                      onClick={() => void moveToNextChapter()}
                      className="gap-1.5"
                    >
                      {movingNext
                        ? "Opening next chapter…"
                        : nextLocked && !chapterComplete && !canCompleteChapter
                          ? "Finish remaining activities"
                          : "Next chapter"}
                      {!movingNext &&
                      (!nextLocked || chapterComplete || canCompleteChapter) ? (
                        <ChevronRight className="size-4" aria-hidden />
                      ) : null}
                    </Button>
                  </div>
                ) : quizBlockIds.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={submitting || perfectScore}
                      loading={submitting}
                      onClick={() => void submitQuiz()}
                    >
                      {submitting
                        ? "Submitting…"
                        : perfectScore
                          ? "Automatic questions complete"
                          : scoreSummary
                            ? "Submit again"
                            : individualActivityCount > 0
                              ? "Submit automatic answers"
                              : "Submit assessment"}
                    </Button>
                    {!nextLocked && nextHref ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => void moveToNextChapter()}
                        className="gap-1.5"
                      >
                        Next chapter{" "}
                        <ChevronRight className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <p className="text-sm text-muted-foreground">
                      Submit each activity above. Its result or review status
                      appears on the activity.
                    </p>
                    {!nextLocked && nextHref ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void moveToNextChapter()}
                        className="gap-1.5"
                      >
                        Next chapter{" "}
                        <ChevronRight className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </footer>
          {submitError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
        </section>
      </div>
    </QuizSessionContext.Provider>
  );
}
