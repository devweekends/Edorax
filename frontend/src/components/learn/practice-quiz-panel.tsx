"use client";

import { useId } from "react";
import { CheckCircle2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { useAskChapter } from "@/components/learn/ask-chapter-context";
import { Button } from "@/components/ui/button";
import { remainingLabel } from "@/lib/chapter-question";
import { PRACTICE_FOCUS_MAX, PRACTICE_QUIZ_COUNT } from "@/lib/practice-quiz";
import { cn } from "@/lib/utils";

export function PracticeQuizPanel() {
  const { ask, practiceQuiz } = useAskChapter();
  const focusId = useId();
  const { status } = ask;
  if (!status) return null;

  const {
    focus,
    setFocus,
    focusChips,
    questions,
    selections,
    result,
    generating,
    checking,
    error,
    outOfQuestions,
    canCheck,
    selectOption,
    generate,
    checkAnswers,
    resetAnswers,
  } = practiceQuiz;

  const resultById = new Map((result?.results ?? []).map((item) => [item.id, item]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
        <span>Practice only · does not affect chapter progress or XP</span>
      </div>

      {focusChips.length > 0 && questions.length === 0 && !generating ? (
        <div role="group" aria-label="Suggested quiz topics" className="flex flex-wrap gap-2">
          {focusChips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={generating || outOfQuestions}
              onClick={() => void generate(chip)}
              className="min-h-10 rounded-full border border-border bg-secondary px-3.5 py-1.5 text-left text-xs font-medium text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:pointer-events-none disabled:opacity-50"
            >
              Quiz on: {chip}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
        className="space-y-2.5"
      >
        <label htmlFor={focusId} className="sr-only">
          Optional quiz topic or difficulty focus
        </label>
        <input
          id={focusId}
          type="text"
          value={focus}
          maxLength={PRACTICE_FOCUS_MAX}
          onChange={(event) => setFocus(event.target.value)}
          disabled={generating || checking || outOfQuestions}
          placeholder="Optional focus (e.g. edge cases, caching, harder)"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">{remainingLabel(status.remaining, status.dailyLimit)}</p>
          <Button type="submit" disabled={generating || checking || outOfQuestions} aria-busy={generating} className="w-full sm:w-auto">
            {generating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {generating
              ? "Writing questions..."
              : questions.length > 0
                ? `Ask for ${PRACTICE_QUIZ_COUNT} more`
                : `Quiz me (${PRACTICE_QUIZ_COUNT})`}
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold",
            result.score === result.maxScore
              ? "border-ok bg-ok-soft text-ok"
              : "border-border bg-secondary text-foreground"
          )}
        >
          <span>
            Score: {result.score} / {result.maxScore}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetAnswers} disabled={generating}>
              <RefreshCw className="size-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      {questions.length > 0 ? (
        <ol className="space-y-4">
          {questions.map((question, qIndex) => {
            const picked = new Set(selections[question.id] ?? []);
            const itemResult = resultById.get(question.id);
            const correctSet = new Set(itemResult?.correctOptionIds ?? []);

            return (
              <li key={question.id} className="space-y-2.5 rounded-lg border border-border bg-background/60 p-3.5">
                <div className="space-y-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {qIndex + 1}. {question.prompt}
                  </p>
                  {question.quizType === "multiple" ? (
                    <p className="text-xs text-muted-foreground">Select all that apply</p>
                  ) : null}
                </div>

                <div
                  role={question.quizType === "multiple" ? "group" : "radiogroup"}
                  aria-label={`Question ${qIndex + 1} options`}
                  className="space-y-2"
                >
                  {question.options.map((option, optIndex) => {
                    const isSelected = picked.has(option.id);
                    const isCorrectOption = itemResult ? correctSet.has(option.id) : false;
                    const isWrongPick = itemResult ? isSelected && !isCorrectOption : false;
                    const letter = String.fromCharCode(65 + optIndex);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        role={question.quizType === "multiple" ? "checkbox" : "radio"}
                        aria-checked={isSelected}
                        disabled={Boolean(itemResult) || checking}
                        onClick={() => selectOption(question.id, option.id, question.quizType)}
                        className={cn(
                          "flex min-h-10 w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                          !itemResult && isSelected && "border-primary bg-primary/10 font-medium text-foreground",
                          !itemResult && !isSelected && "border-border bg-card text-foreground hover:bg-accent",
                          isCorrectOption && "border-ok bg-ok-soft text-foreground",
                          isWrongPick && "border-destructive/60 bg-destructive/10 text-foreground"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 grid size-5 shrink-0 place-items-center rounded text-xs font-bold",
                            isCorrectOption
                              ? "bg-ok text-white"
                              : isWrongPick
                                ? "bg-destructive text-white"
                                : isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                          )}
                        >
                          {letter}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{option.label}</span>
                        {isCorrectOption ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Correct option" />
                        ) : isWrongPick ? (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Incorrect pick" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {itemResult ? (
                  <p
                    className={cn(
                      "rounded-md px-3 py-2 text-xs leading-relaxed",
                      itemResult.isCorrect ? "bg-ok-soft text-foreground" : "bg-secondary text-foreground"
                    )}
                  >
                    <span className="font-semibold">{itemResult.isCorrect ? "Correct: " : "Explanation: "}</span>
                    {itemResult.explanation}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {questions.length > 0 && !result ? (
        <Button type="button" onClick={() => void checkAnswers()} disabled={!canCheck} aria-busy={checking} className="w-full">
          {checking ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
          {checking ? "Checking..." : "Check answers"}
        </Button>
      ) : null}

      <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">
        Practice questions come from AI and can be wrong. Check the chapter.
      </p>
    </div>
  );
}
