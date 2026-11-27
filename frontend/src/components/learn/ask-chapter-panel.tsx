"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Copy, CornerDownRight, HandHelping, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/learn/safe-markdown";
import { PracticeQuizPanel } from "@/components/learn/practice-quiz-panel";
import { useAskChapter } from "@/components/learn/ask-chapter-context";
import { QUESTION_MAX, isAskable, remainingLabel, showCounter } from "@/lib/chapter-question";
import { markdownToPlainText } from "@/lib/safe-markdown";
import { cn } from "@/lib/utils";

/**
 * The quick-questions content: starters, the question box, the streamed answer, follow-ups and earlier
 * questions. The inline card and the floating window both render this, so they behave the same.
 */
export function AskChapterBody({ className }: { className?: string }) {
  const { ask: chapter, tab, setTab } = useAskChapter();
  const ids = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { status, question, setQuestion, asked, answer, error, asking, followUp, setFollowUp, earlier, copied, starters, locked, finished } = chapter;
  if (!status) return null;

  const questionId = `${ids}-question`;
  const historyId = `${ids}-history`;
  const counterNear = question.length >= QUESTION_MAX - 20;
  const live = asking ? "Working on your answer." : (error ?? (finished ? `Answer: ${markdownToPlainText(answer)}` : ""));

  const modeTabs = (
    <div role="tablist" aria-label="AI study mode" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "ask"}
        onClick={() => setTab("ask")}
        className={cn(
          "min-h-9 rounded-md px-3 text-sm font-semibold transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
          tab === "ask" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Ask a question
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "quiz"}
        onClick={() => setTab("quiz")}
        className={cn(
          "min-h-9 rounded-md px-3 text-sm font-semibold transition-colors outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
          tab === "quiz" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Practice quiz
      </button>
    </div>
  );

  if (tab === "quiz") {
    return (
      <div className={cn("space-y-4", className)}>
        {modeTabs}
        <PracticeQuizPanel />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {modeTabs}
      {!asking && !answer && starters.length > 0 ? (
        <div role="group" aria-label="Starter questions" className="flex flex-wrap gap-2">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={locked}
              onClick={() => void chapter.ask(starter)}
              className="min-h-11 rounded-full border border-border bg-secondary px-4 py-2 text-left text-sm text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow disabled:pointer-events-none disabled:opacity-50"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void chapter.ask(question);
        }}
        className="space-y-3"
      >
        {followUp ? (
          <p className="flex items-start justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
            <span className="min-w-0 break-words">Following up on: {followUp.question}</span>
            <button
              type="button"
              onClick={() => setFollowUp(null)}
              aria-label="Stop following up"
              className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-md hover:bg-accent"
            >
              <X className="size-4" aria-hidden />
            </button>
          </p>
        ) : null}
        <label htmlFor={questionId} className="sr-only">
          Your question about this chapter
        </label>
        <Textarea
          id={questionId}
          ref={box}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter adds a line. Enter while composing (for example with an IME) stays a plain key press.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void chapter.ask(question);
            }
          }}
          maxLength={QUESTION_MAX}
          rows={2}
          placeholder={followUp ? "Ask your follow-up" : "Type your question. Enter sends, Shift+Enter adds a line."}
          disabled={locked}
          className="min-h-20"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[13px] text-muted-foreground">
            {remainingLabel(status.remaining, status.dailyLimit)}
            {showCounter(question.length) ? (
              <span className={cn("ml-3 tabular-nums", counterNear && "font-semibold text-destructive")}>
                {question.length}/{QUESTION_MAX}
              </span>
            ) : null}
          </p>
          <Button type="submit" disabled={locked || !isAskable(question)} aria-busy={asking} className="w-full sm:w-auto">
            {asking ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {asking ? "Answering..." : "Ask"}
          </Button>
        </div>
      </form>

      {/* Spoken once, when the answer is complete, so a screen reader is not interrupted by every streamed word. */}
      <div aria-live="polite" role="status" className="sr-only">
        {live}
      </div>

      {asked ? (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">You asked: {asked}</p>
          {answer || asking ? (
            <div className="rounded-lg bg-secondary px-4 py-3" aria-busy={asking}>
              {answer ? (
                <SafeMarkdown source={answer} />
              ) : (
                <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Reading the chapter...
                </p>
              )}
            </div>
          ) : null}
          {finished ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={chapter.copyAnswer}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  chapter.startFollowUp();
                  box.current?.focus();
                }}
              >
                <CornerDownRight aria-hidden />
                Ask a follow-up
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {earlier.length > 0 ? (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
            aria-controls={historyId}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm font-semibold text-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            Earlier questions ({earlier.length})
            <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", historyOpen && "rotate-180")} aria-hidden />
          </button>
          {historyOpen ? (
            <ul id={historyId} className="mt-2 space-y-4">
              {earlier.map((turn) => (
                <li key={turn.question + turn.answer.slice(0, 40)} className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">{turn.question}</p>
                  <div className="rounded-lg bg-secondary px-4 py-3">
                    <SafeMarkdown source={turn.answer} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">Answers come from AI and can be wrong. Check the chapter.</p>
    </div>
  );
}

/** The quiet way out of the AI panel: hands the learner to the mentor dialog. Pinned below the content in the floating window. */
export function AskMentorLink({ className }: { className?: string }) {
  const { askMentor } = useAskChapter();
  return (
    <button
      type="button"
      onClick={askMentor}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold text-muted-foreground underline underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
        className
      )}
    >
      <HandHelping className="size-4 shrink-0" aria-hidden />
      Still stuck? Ask a mentor
    </button>
  );
}

/**
 * A compact card under the chapter for quick questions. It stays hidden until the API says questions
 * are available for this learner and chapter, starts collapsed, and opens in place below the reading text.
 */
export function AskChapterPanel() {
  const { ask: chapter } = useAskChapter();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const { status, available, outOfQuestions } = chapter;
  if (!available || !status) return null;

  return (
    <section aria-label="Ask about this chapter" className="mt-10 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-4 rounded-md text-left outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-foreground">Ask about this chapter</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {outOfQuestions ? "You have used today's questions. They come back tomorrow." : "Quick questions and practice quizzes."}
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div id={bodyId} className="mt-4">
          <AskChapterBody />
          <AskMentorLink className="mt-1" />
        </div>
      ) : null}
    </section>
  );
}
