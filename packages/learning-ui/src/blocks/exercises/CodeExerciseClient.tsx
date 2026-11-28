"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  CirclePlay,
  Code2,
  Lightbulb,
  RotateCcw,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { CodeMirrorEditor, type CodeEditorHandle } from "../../components/learn/code-editor";
import { canFormatLanguage, formatCode } from "../../lib/format-code";
import { cn } from "../../lib/utils";
import type { SanitizedCodeConfig } from "../../shared/blocks/code/schema";
import { checkpointAttrs } from "../../components/learn/checkpoint-marker";

type CheckResult = {
  isCorrect: boolean | null;
  failedTestName?: string;
  errorMessage?: string;
  explanation?: string;
  solution?: string;
};

function lineCount(source: string) {
  return Math.max(source.split("\n").length, 1);
}

function CodeEditor({
  value,
  onChange,
  readOnly,
  filename,
  language,
  rawLanguage,
  onSubmitShortcut,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  filename: string;
  language: string;
  rawLanguage: string;
  onSubmitShortcut?: () => void;
}) {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const lines = lineCount(value);
  const formattable = !readOnly && canFormatLanguage(rawLanguage);

  const handleFormat = useCallback(async () => {
    if (readOnly || formatting || !value.trim() || !canFormatLanguage(rawLanguage)) return;
    setFormatting(true);
    setFormatError(null);
    try {
      const cursorOffset = editorRef.current?.getCursorOffset();
      const res = await formatCode(value, { language: rawLanguage, cursorOffset });
      if (res.ok) {
        if (editorRef.current) {
          editorRef.current.applyFormatted(res.code, res.cursorOffset);
        } else {
          onChange(res.code);
        }
        setFormatted(true);
        setTimeout(() => setFormatted(false), 1500);
      } else {
        setFormatError(res.error);
      }
    } finally {
      setFormatting(false);
    }
  }, [formatting, onChange, rawLanguage, readOnly, value]);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-surface)]">
      {/* Editor title bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--code-border)] bg-[var(--code-toolbar)] px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
            <span className="truncate text-[var(--code-fg)]">{filename}</span>
            <span className="shrink-0 rounded bg-[var(--code-border)]/40 px-1.5 py-0.5 text-xs uppercase tracking-wide text-[var(--code-lang-fg)]">
              {language}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {formattable ? (
            <button
              type="button"
              onClick={() => void handleFormat()}
              disabled={formatting || !value.trim()}
              aria-label="Format code"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--code-border)] bg-[var(--code-surface)] px-2.5 text-xs font-medium text-[var(--code-fg)] transition-colors hover:bg-[var(--code-border)]/30 focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {formatted ? <Check className="size-3.5 text-ok" aria-hidden /> : <WandSparkles className="size-3.5" aria-hidden />}
              {formatting ? "Formatting…" : formatted ? "Formatted" : "Format"}
            </button>
          ) : (
            <span className="text-xs text-[var(--code-lang-fg)]">Read-only</span>
          )}
        </div>
      </div>

      <CodeMirrorEditor
        value={value}
        onChange={(next) => {
          if (formatError) setFormatError(null);
          onChange(next);
        }}
        language={rawLanguage}
        readOnly={readOnly}
        ariaLabel={`Code editor for ${filename}`}
        onRunShortcut={onSubmitShortcut}
        onFormatShortcut={() => void handleFormat()}
        editorRef={editorRef}
      />

      {formatError ? (
        <div
          role="status"
          className="border-t border-[var(--code-border)] bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive sm:px-4"
        >
          Could not format: {formatError}
        </div>
      ) : null}

      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--code-border)] bg-[var(--code-toolbar)] px-3 py-1.5 font-mono text-xs text-[var(--code-lang-fg)] sm:px-4">
        <span>{lines} line{lines === 1 ? "" : "s"}</span>
        <span className="hidden sm:inline">Shift+Alt+F format · Ctrl+Enter check · Spaces: 2</span>
        <span className="sm:hidden">Spaces: 2</span>
      </div>
    </div>
  );
}

function ReadOnlyCodeBlock({ source, label }: { source: string; label: string }) {
  const lines = source.split("\n");
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-surface)]">
      <div className="border-b border-[var(--code-border)] bg-[var(--code-toolbar)] px-4 py-2 text-xs font-medium text-[var(--code-lang-fg)]">
        {label}
      </div>
      <div className="flex overflow-x-auto">
        <div className="hidden shrink-0 border-r border-[var(--code-border)] py-4 pr-3 pl-4 text-right font-mono text-xs leading-[1.65] text-[var(--code-lang-fg)] sm:block">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="m-0 flex-1 p-4 font-mono text-[13px] leading-[1.65] text-[var(--code-fg)]">
          <code>{source}</code>
        </pre>
      </div>
    </div>
  );
}

export type CodeInitialState = {
  source: string;
  isCorrect: boolean | null;
  failedTestName?: string;
  errorMessage?: string;
  explanation?: string;
  solution?: string;
};

export type CodeEditorProps = {
  value: string;
  onChange: (source: string) => void;
  readOnly?: boolean;
  filename: string;
  language: string;
};

export function CodeExerciseClient({
  id,
  config,
  initialState,
  onRespond,
  onComplete,
  onFeedback,
  renderEditor,
}: {
  renderEditor?: (props: CodeEditorProps) => ReactNode;
  id: string;
  config: SanitizedCodeConfig;
  initialState?: CodeInitialState | null;
  onRespond?: (payload: { source: string }) => Promise<CheckResult>;
  onComplete?: () => void;
  onFeedback?: (kind: "success" | "error") => void;
}) {
  const [source, setSource] = useState(initialState?.source ?? config.starterCode);
  const [result, setResult] = useState<CheckResult | null>(
    initialState
      ? {
          isCorrect: initialState.isCorrect,
          failedTestName: initialState.failedTestName,
          errorMessage: initialState.errorMessage,
          explanation: initialState.explanation,
          solution: initialState.solution,
        }
      : null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintIndex, setHintIndex] = useState(-1);

  const hints = config.hints ?? [];
  const canRetry = result && !result.isCorrect && config.allowRetry;
  const hasAnswered = result !== null;
  const settled = hasAnswered && (result.isCorrect === true || config.allowRetry === false);
  const passed = result?.isCorrect === true;
  const filename = config.filename ?? "exercise.js";
  const language = config.language === "javascript" ? "JavaScript" : config.language;

  const modeMeta =
    config.mode === "complete"
      ? {
          label: "Complete the code",
          badge: "bg-brand-yellow/15 text-foreground ring-brand-yellow",
          accent: "text-foreground",
          iconBg: "bg-brand-yellow/15 text-foreground",
        }
      : {
          label: "Implement this",
          badge: "bg-secondary text-primary ring-ring",
          accent: "text-primary",
          iconBg: "bg-secondary text-primary",
        };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (id.startsWith("preview-")) {
        setResult({ isCorrect: null, explanation: "This gallery preview lets you edit code and reveal hints. Graded checks run in a published exercise." });
        return;
      }
      if (!onRespond) throw new Error("Code submission is unavailable.");
      const body = await onRespond({ source });
      setResult(body);
      if (body.isCorrect === true) onFeedback?.("success");
      else if (body.isCorrect === false) onFeedback?.("error");
      onComplete?.();
    } catch (err) {
      onFeedback?.("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSource(config.starterCode);
    setResult(null);
    setError(null);
    setHintIndex(-1);
  }

  return (
    <div
      {...(id.startsWith("preview-") ? {} : checkpointAttrs(id, settled))}
      className="not-prose my-10 scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground "
      data-code-exercise
    >
      {/* Prompt header — matches quiz / checklist cards */}
      <div className="border-b border-border bg-muted/35 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              modeMeta.iconBg
            )}
          >
            <Code2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Code lab
              </p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset",
                  modeMeta.badge
                )}
              >
                {modeMeta.label}
              </span>
            </div>
            <p className="mt-1.5 text-base font-semibold leading-snug text-foreground sm:text-[17px]">
              {config.prompt}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Type in the editor below — same dark theme as code blocks in this course. Use{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                module.exports
              </code>{" "}
              so automated checks can run your functions.
            </p>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-4 bg-muted/25 px-4 py-5 sm:px-6">
        {renderEditor ? renderEditor({ value: source, onChange: setSource, readOnly: passed || submitting, filename, language: config.language }) : (
          <CodeEditor
            value={source}
            onChange={setSource}
            readOnly={passed || submitting}
            filename={filename}
            language={language}
            rawLanguage={config.language}
            onSubmitShortcut={() => {
              if (!passed && !submitting && source.trim()) {
                void submit();
              }
            }}
          />
        )}

        {hintIndex >= 0 && hints[hintIndex] ? (
          <div className="flex gap-2.5 rounded-xl border border-brand-yellow bg-brand-yellow/15 px-4 py-3 text-sm text-foreground">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-foreground" />
            <p>
              <span className="font-semibold">Hint {hintIndex + 1}:</span> {hints[hintIndex]}
            </p>
          </div>
        ) : null}

        {hasAnswered && result ? (
          <div className="space-y-4">
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5",
                passed
                  ? "border-ok bg-ok-soft"
                  : "border-brand-yellow bg-brand-yellow/15"
              )}
            >
              {passed ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-foreground" />
              )}
              <div className="min-w-0 text-sm">
                <p className={cn("font-semibold", passed ? "text-ok" : "text-foreground")}>
                  {passed ? "All checks passed — well done!" : id.startsWith("preview-") ? "Editor preview" : "Not quite yet — adjust and retry"}
                </p>
                {!passed && result.failedTestName ? (
                  <p className="mt-1.5 text-foreground">
                    Failed: <span className="font-medium">{result.failedTestName}</span>
                    {result.errorMessage ? (
                      <code className="mt-2 block overflow-x-auto rounded-lg bg-brand-yellow/15 px-2.5 py-2 font-mono text-xs text-foreground">
                        {result.errorMessage}
                      </code>
                    ) : null}
                  </p>
                ) : null}
                {result.explanation ? (
                  <p className="mt-2 leading-relaxed text-foreground">{result.explanation}</p>
                ) : null}
              </div>
            </div>

            {passed && result.solution ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="size-3.5 text-ok" />
                  Reference solution
                </p>
                <ReadOnlyCodeBlock source={result.solution} label={filename} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Actions footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {!passed ? (
            <>
              <Button
                size="sm"
                onClick={submit}
                loading={submitting}
                disabled={!source.trim() || submitting}
                className="h-9 gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                <CirclePlay className="size-4" />
                {submitting ? "Running checks…" : id.startsWith("preview-") ? "Try editor" : "Check my code"}
              </Button>
              {hints.length > 0 && hintIndex < hints.length - 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 rounded-full"
                  onClick={() => setHintIndex((i) => Math.min(i + 1, hints.length - 1))}
                >
                  <Lightbulb className="size-3.5" />
                  Hint
                </Button>
              ) : null}
              {canRetry ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 gap-1.5"
                  onClick={reset}
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              ) : null}
            </>
          ) : (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full" onClick={reset}>
              <RotateCcw className="size-3.5" />
              Practice again
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <>
              {config.testCount} check{config.testCount === 1 ? "" : "s"} · {language}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
