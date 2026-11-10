"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { QuizOptions } from "../../components/learn/quiz-options";
import { QuizPromptBody } from "../../components/learn/quiz-prompt-body";
import { useQuizSession } from "../../components/learn/quiz-session-context";
import { readerCard, readerCardFooter, readerCardHeader, readerTitle } from "../../components/learn/reader-theme";
import { fireMiniConfetti } from "../../components/learn/mini-confetti";
import { checkpointAttrs } from "../../components/learn/checkpoint-marker";
import type { SanitizedQuizConfig } from "../../shared/blocks/quiz/schema";
import { useBrowserStorage } from "../../lib/use-browser-storage";

type RespondResult = {
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number | null;
  explanation?: string;
};

export type QuizInitialState = {
  selected: string[];
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number | null;
  explanation?: string;
};

/** "1-4 to answer" for the visible keyboard hint. One-based counting: option 1 is key "1". */
function keyHint(count: number): string {
  if (count <= 0) return "";
  return `1-${count} to answer`;
}

type ParsedExplanationLine = {
  optionLabel: string;
  explanation: string;
};

const QUOTED_LINE = /^\s*["“](.+?)["”]\s*[:.,-]?\s*(.*)$/;

function parseExplanationLines(explanation: string): ParsedExplanationLine[] {
  return explanation
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match = QUOTED_LINE.exec(line);
      if (match) {
        return { optionLabel: match[1]!, explanation: match[2]! };
      }
      return null;
    })
    .filter((item): item is ParsedExplanationLine => item !== null);
}

function hasStructuredExplanation(explanation: string): boolean {
  const lines = explanation.split("\n").filter((line) => line.trim());
  return lines.length > 0 && lines.every((line) => QUOTED_LINE.test(line));
}

function ResultBanner({
  result,
  options,
  selected,
  correctOptionIds,
}: {
  result: RespondResult;
  options: { id: string; label: string }[];
  selected: string[];
  correctOptionIds?: string[];
}) {
  const correct = result.isCorrect === true;
  const selectedSet = new Set(selected);
  const correctSet = new Set(correctOptionIds ?? []);

  const parsedLines = result.explanation ? parseExplanationLines(result.explanation) : [];
  const isStructured = result.explanation ? hasStructuredExplanation(result.explanation) : false;

  const normalizeLabel = (label: string) =>
    label.toLowerCase().replace(/\s+/g, " ").replace(/[.?!\s]+$/, "").trim();

  const optionLabelToId = new Map<string, string>();
  for (const option of options) {
    optionLabelToId.set(normalizeLabel(option.label), option.id);
  }

  // Show only the explanation for the option the learner picked. If no line matches the pick,
  // fall back to the full list so the learner still sees feedback.
  const pickedLines = parsedLines.filter((line) => {
    const optionId = optionLabelToId.get(normalizeLabel(line.optionLabel));
    return optionId ? selectedSet.has(optionId) : false;
  });
  const visibleLines = pickedLines.length > 0 ? pickedLines : parsedLines;

  return (
    <div
      className={cn(
        "rounded-lg border-2 px-4 py-3.5 text-base",
        correct
          ? "border-ok bg-ok-soft text-ok"
          : "border-foreground bg-brand-yellow/15 text-foreground"
      )}
      role="status"
    >
      <div className="flex items-start gap-3">
        {correct ? (
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ok text-white dark:text-ok">
            <CheckCircle2 className="size-4" />
          </div>
        ) : (
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-yellow text-[#0A0F2C]">
            <XCircle className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold">
              {correct ? "Correct. Well done." : "Not quite. Try another answer."}
            </p>
            {correct ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                <Sparkles className="size-3" />
                +100%
              </span>
            ) : null}
          </div>
          {result.explanation && isStructured && parsedLines.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {visibleLines.map((line, index) => {
                const optionId = optionLabelToId.get(normalizeLabel(line.optionLabel));
                const isSelected = optionId ? selectedSet.has(optionId) : false;
                const isCorrectOption = optionId ? correctSet.has(optionId) : false;

                return (
                  <li
                    key={index}
                    className={cn(
                      "rounded-md border px-3 py-2.5",
                      isCorrectOption
                        ? "border-ok/50 bg-ok/10"
                        : isSelected
                          ? "border-foreground/30 bg-foreground/5"
                          : "border-border/50 bg-card/50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        {isCorrectOption && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-ok/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ok">
                            <CheckCircle2 className="size-2.5" />
                            Correct
                          </span>
                        )}
                        {isSelected && !isCorrectOption && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70">
                            Your pick
                          </span>
                        )}
                        {isSelected && isCorrectOption && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-ok/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ok">
                            Your pick
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
                      {line.optionLabel}
                    </p>
                    {line.explanation && (
                      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                        {line.explanation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : result.explanation ? (
            <div className="mt-1.5 space-y-1.5 leading-relaxed">
              {result.explanation.split("\n").filter((line) => line.trim()).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function QuizClient({
  id,
  config,
  initialState,
  presentation = "standalone",
  draftStorageKey,
  correctOptionIds,
  onRespond,
  onComplete,
  onAnswerChange,
  onFeedback,
}: {
  id: string;
  config: SanitizedQuizConfig;
  initialState?: QuizInitialState | null;
  presentation?: "standalone" | "wizard";
  draftStorageKey?: string;
  correctOptionIds?: string[];
  onRespond?: (payload: { type: "QUIZ"; selected: string[] }) => Promise<RespondResult>;
  onComplete?: () => void;
  onAnswerChange?: (selected: string[]) => void;
  onFeedback?: (kind: "success" | "error") => void;
}) {
  const quizSession = useQuizSession();
  const cardRef = useRef<HTMLDivElement>(null);
  const isMultiple = config.quizType === "multiple";
  const optionCount = config.options.length;
  const [localSelected, setLocalSelected] = useState<string[]>(initialState?.selected ?? []);
  const [localResult, setResult] = useState<RespondResult | null>(
    initialState
      ? {
          isCorrect: initialState.isCorrect,
          score: initialState.score,
          maxScore: initialState.maxScore,
          explanation: initialState.explanation,
        }
      : null
  );
  const [localWrongSelection, setWrongSelection] = useState<string[]>(initialState?.isCorrect === false ? initialState.selected : []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isSuccessGlow, setIsSuccessGlow] = useState(false);
  const [draftRaw, setDraftRaw] = useBrowserStorage(
    presentation === "wizard" ? draftStorageKey : undefined,
    JSON.stringify(initialState?.selected ?? []),
  );
  const draftSelected = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(draftRaw);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === "string")) return parsed as string[];
    } catch { /* Ignore malformed stored selections. */ }
    return initialState?.selected ?? [];
  }, [draftRaw, initialState?.selected]);
  const reviewGrade = presentation === "wizard" && quizSession?.reviewMode && !quizSession.dirtyBlockIds.has(id)
    ? quizSession.blockGrades[id] : undefined;
  const selected = reviewGrade?.selected ?? (presentation === "wizard" && draftStorageKey ? draftSelected : localSelected);
  const result: RespondResult | null = reviewGrade ? {
    isCorrect: reviewGrade.isCorrect, score: reviewGrade.isCorrect ? 1 : 0, maxScore: 1, explanation: reviewGrade.explanation,
  } : presentation === "wizard" ? null : localResult;
  const wrongSelection = reviewGrade?.isCorrect === false ? reviewGrade.selected : localWrongSelection;
  function setSelected(next: string[]) {
    setLocalSelected(next);
    if (presentation === "wizard" && draftStorageKey) setDraftRaw(JSON.stringify(next));
  }
  const [previousInitialState, setPreviousInitialState] = useState(initialState);
  if (initialState !== previousInitialState) {
    setPreviousInitialState(initialState);
    if (presentation !== "wizard" && initialState) {
      setLocalSelected(initialState.selected);
      setResult(initialState);
      setWrongSelection(initialState.isCorrect === false ? initialState.selected : []);
    }
  }

  useEffect(() => {
    if (isShaking) {
      const timer = window.setTimeout(() => setIsShaking(false), 450);
      return () => window.clearTimeout(timer);
    }
  }, [isShaking]);

  useEffect(() => {
    if (isSuccessGlow) {
      const timer = window.setTimeout(() => setIsSuccessGlow(false), 800);
      return () => window.clearTimeout(timer);
    }
  }, [isSuccessGlow]);

  async function submitSelection(nextSelected: string[]) {
    setSubmitting(true);
    setError(null);
    try {
      if (id === "preview-quiz" || (correctOptionIds && correctOptionIds.length > 0 && id.startsWith("preview"))) {
        const correctSet = new Set(correctOptionIds ?? []);
        const selectedSet = new Set(nextSelected);
        const isCorrect =
          correctSet.size > 0
            ? selectedSet.size === correctSet.size && [...selectedSet].every((optionId) => correctSet.has(optionId))
            : true;
        const data: RespondResult = {
          isCorrect,
          score: isCorrect ? 1 : 0,
          maxScore: 1,
          explanation: config.explanation,
        };
        applyResult(data, nextSelected);
        return;
      }

      let data: RespondResult;
      try {
        if (!onRespond) throw new Error("Quiz submission is unavailable.");
        data = await onRespond({ type: "QUIZ", selected: nextSelected });
      } catch (err) {
        // A block the server no longer knows (stale content) still grades locally
        // when the answer key shipped with the config.
        const canGradeLocally = (err as { status?: number })?.status === 404 && correctOptionIds && correctOptionIds.length > 0;
        if (!canGradeLocally) throw err;
        const correctSet = new Set(correctOptionIds);
        const selectedSet = new Set(nextSelected);
        const isCorrect =
          correctSet.size === selectedSet.size && [...selectedSet].every((optionId) => correctSet.has(optionId));
        data = { isCorrect, score: isCorrect ? 1 : 0, maxScore: 1, explanation: config.explanation };
      }
      applyResult(data, nextSelected);
      onComplete?.();
    } catch (err) {
      onFeedback?.("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function applyResult(data: RespondResult, nextSelected: string[]) {
    setResult(data);
    if (data.isCorrect === true) {
      setWrongSelection([]);
      setIsSuccessGlow(true);
      setIsShaking(false);
      if (cardRef.current) fireMiniConfetti(cardRef.current);
      onFeedback?.("success");
    } else if (data.isCorrect === false) {
      setWrongSelection(nextSelected);
      setIsSuccessGlow(false);
      setIsShaking(true);
      onFeedback?.("error");
    }
  }

  async function submit() {
    await submitSelection(selected);
  }

  function toggle(optionId: string) {
    let next: string[];
    if (isMultiple) {
      next = selected.includes(optionId)
        ? selected.filter((option) => option !== optionId)
        : [...selected, optionId];
    } else {
      next = [optionId];
    }
    setSelected(next);

    if (presentation === "wizard") {
      setResult(null);
      setWrongSelection([]);
      onAnswerChange?.(next);
      window.dispatchEvent(
        new CustomEvent("buildment:quiz-answer-change", { detail: { blockId: id, selected: next } })
      );
      return;
    }

    if (result?.isCorrect === false) {
      setResult(null);
      setWrongSelection([]);
      if (!isMultiple) {
        void submitSelection(next);
      }
      return;
    }

    if (result?.isCorrect === true) {
      return;
    }
  }

  const wizardReviewGrade =
    presentation === "wizard" && quizSession?.reviewMode && !quizSession.dirtyBlockIds.has(id)
      ? quizSession.blockGrades[id]
      : undefined;
  const wizardShowingReview = Boolean(wizardReviewGrade && wizardReviewGrade.isCorrect !== null);
  const revealedCorrectIds = wizardReviewGrade?.correctOptionIds ?? correctOptionIds ?? [];
  const optionsLocked =
    (wizardShowingReview && wizardReviewGrade?.isCorrect === true) || result?.isCorrect === true;
  const hasAnswered = result !== null;
  const settled = hasAnswered && (result.isCorrect === true || config.allowRetry === false);
  const showWrongOptions = result?.isCorrect === false;
  const showCorrectOptions = result?.isCorrect === true || (wizardShowingReview && revealedCorrectIds.length > 0);

  // A-D / 1-N select an option; Enter submits (standalone "Check answer"). Scoped to this quiz, and
  // guarded so it never fires while typing or with a modifier, matching the reader's `[`/`]` guard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog[open]")) return;
      // Scoped to this quiz. In the wizard (one question visible at a time) the learner gapes at the
      // active question without focusing it, so react when this quiz has a *visible* option. On a
      // standalone page with many quizzes, require focus inside this one so keys can't hit several.
      if (presentation === "wizard") {
        const visible = cardRef.current
          ? [...cardRef.current.querySelectorAll('[role="radio"], [role="checkbox"]')].some(
              (el) => (el as HTMLElement).offsetParent !== null
            )
          : false;
        if (!visible) return;
        // A full-submission review shows every question at once. Number keys then belong to the
        // question the learner is focused on, not to every visible question on the page.
        const foreignVisible = [...document.querySelectorAll('[role="radio"], [role="checkbox"]')].some(
          (el) => el instanceof HTMLElement && el.offsetParent !== null && !cardRef.current?.contains(el)
        );
        if (foreignVisible) {
          const active = document.activeElement;
          if (!cardRef.current || !active || !cardRef.current.contains(active)) return;
        }
      } else {
        const active = document.activeElement;
        if (!cardRef.current || !active || !cardRef.current.contains(active)) return;
      }

      if (event.key === "Enter") {
        // With nothing selected yet, let native Enter activate a focused option; once an answer is
        // chosen, Enter submits (and preventDefault stops a focused option re-activating too).
        if (presentation === "wizard") return; // wizard saves per-block, submits once at the end
        if (submitting || result?.isCorrect === true) return;
        if (selected.length === 0) return;
        event.preventDefault();
        void submit();
        return;
      }

      let index = -1;
      if (/^[1-9]$/.test(event.key)) index = Number(event.key) - 1; // numbers only: 1-4 picks option 1-4
      if (index < 0 || index >= optionCount) return; // keys beyond the option count do nothing
      if (optionsLocked || submitting) return;
      event.preventDefault();
      toggle(config.options[index].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [config.options, optionCount, optionsLocked, presentation, result, selected, submitting, toggle, submit]);

  const optionsBlock = (
    <>
      <QuizOptions
        options={config.options}
        selected={selected}
        onToggle={toggle}
        disabled={optionsLocked}
        multiple={isMultiple}
        incorrectOptionIds={showWrongOptions ? wrongSelection : []}
        correctOptionIds={showCorrectOptions ? (revealedCorrectIds.length > 0 ? revealedCorrectIds : selected) : []}
        showAnswerState={showWrongOptions || showCorrectOptions}
      />
      {optionCount > 0 && !optionsLocked ? (
        <p className="mt-2 text-xs text-muted-foreground" data-slot="quiz-keys">
          Keyboard: {keyHint(optionCount)}
        </p>
      ) : null}
    </>
  );

  const actionsBlock = hasAnswered && result && (presentation !== "wizard" || wizardShowingReview) ? (
      <ResultBanner
        result={result}
        options={config.options}
        selected={selected}
        correctOptionIds={revealedCorrectIds.length > 0 ? revealedCorrectIds : result.isCorrect === true ? selected : correctOptionIds}
      />
    ) : presentation === "wizard" ? (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selected.length === 0
          ? "Choose an answer. You can change it before submitting the quiz."
          : `${selected.length} selected · saved on this device`}
      </p>
    ) : (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void submit()}
          loading={submitting}
          disabled={selected.length === 0 || submitting}
          className="h-9 rounded-md px-5 transition-all active:scale-[0.98]"
        >
          {submitting ? "Checking…" : "Check answer"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {selected.length === 0
              ? "Select an option, then check your answer"
              : `${selected.length} selected`}
          </p>
        )}
      </div>
    );

  if (presentation === "wizard") {
    return (
      <div
        ref={cardRef}
        {...(id.startsWith("preview-") ? {} : checkpointAttrs(id, settled))}
        className={cn(
          "not-prose scroll-mt-24 space-y-8 transition-all duration-300",
          isShaking && "animate-feedback-shake",
          isSuccessGlow && "animate-feedback-success"
        )}
      >
        <QuizPromptBody prompt={config.prompt} className="font-medium sm:text-lg" />
        {optionsBlock}
        {actionsBlock}
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      {...(id.startsWith("preview-") ? {} : checkpointAttrs(id, settled))}
      className={cn(
        "not-prose my-8 scroll-mt-24 transition-all duration-300",
        readerCard,
        isShaking && "animate-feedback-shake",
        isSuccessGlow && "animate-feedback-success"
      )}
    >
      <div className={cn(readerCardHeader, "flex items-start gap-3")}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <span className="text-xs font-semibold">Q</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Knowledge check
          </p>
          <div className={cn("mt-2", readerTitle)}>
            <QuizPromptBody prompt={config.prompt} />
          </div>
        </div>
      </div>
      <div className="px-5 py-4 sm:px-6">{optionsBlock}</div>
      <div className={readerCardFooter}>{actionsBlock}</div>
    </div>
  );
}
