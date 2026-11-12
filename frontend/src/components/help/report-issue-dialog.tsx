"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flag, X } from "lucide-react";
import { reportLessonIssue } from "@/server/actions/lesson-report";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "ERROR", label: "Incorrect information" },
  { value: "TYPO", label: "Typo or broken formatting" },
  { value: "CONFUSING", label: "Confusing explanation" },
  { value: "BROKEN_LINK", label: "Broken link" },
  { value: "SUGGESTION", label: "Improvement idea" },
  { value: "OTHER", label: "Something else" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export function ReportIssueDialog({
  courseId,
  chapterId,
  chapterTitle,
}: {
  courseId: string;
  chapterId: string;
  chapterTitle: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingQuoteRef = useRef("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("ERROR");
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function captureSelection() {
    pendingQuoteRef.current = window.getSelection()?.toString().trim().slice(0, 500) ?? "";
  }

  function start() {
    const selected =
      pendingQuoteRef.current || (window.getSelection()?.toString().trim().slice(0, 500) ?? "");
    pendingQuoteRef.current = "";
    setQuote(selected);
    setSubmitted(false);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (pending) return;
    setOpen(false);
  }

  async function submit() {
    if (body.trim().length < 10) {
      setError("Please add a bit more detail (at least 10 characters).");
      return;
    }
    setPending(true);
    setError(null);
    const res = await reportLessonIssue({
      courseId,
      chapterId,
      category,
      body,
      quote: quote || undefined,
    });
    setPending(false);
    if (res.ok) {
      setSubmitted(true);
      setBody("");
      setQuote("");
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onMouseDown={captureSelection}
        onClick={start}
        title="Report an issue with this lesson"
        aria-label="Report an issue with this lesson"
        className="inline-flex size-8 items-center justify-center rounded-[8px] text-muted-foreground/70 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        <Flag className="size-4 shrink-0" aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={close}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-foreground/40 backdrop:backdrop-blur-[2px] open:flex open:items-end open:justify-center sm:open:items-center sm:open:p-4"
        aria-labelledby="report-issue-title"
      >
        <div className="w-full max-w-none rounded-t-[16px] border border-border bg-card p-5 text-card-foreground shadow-2xl sm:max-w-md sm:rounded-[14px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="report-issue-title" className="text-base font-semibold">
                Report an issue
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{chapterTitle}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-7 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {submitted ? (
            <div className="mt-5 flex flex-col items-center gap-2.5 py-5 text-center">
              <CheckCircle2 className="size-9 text-primary" aria-hidden />
              <p className="text-sm font-medium">Thanks. Your instructor will review this.</p>
              <p className="text-xs text-muted-foreground">
                You can follow the conversation in your questions inbox.
              </p>
              <button
                type="button"
                onClick={close}
                className="mt-2 rounded-[8px] border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-foreground/85">What kind of issue?</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as Category)}
                  className="h-9 w-full rounded-[8px] border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              {quote && (
                <div className="rounded-[8px] border border-border bg-secondary/60 px-3 py-2 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">Selected passage</p>
                  <p className="mt-1 line-clamp-3 italic">&ldquo;{quote}&rdquo;</p>
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-foreground/85">What should be fixed?</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Tell your instructor what is wrong or what would make this clearer."
                  className="w-full resize-y rounded-[8px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-[8px] px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className={cn(
                    "rounded-[8px] bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground",
                    pending && "opacity-60"
                  )}
                >
                  {pending ? "Sending…" : "Send report"}
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
