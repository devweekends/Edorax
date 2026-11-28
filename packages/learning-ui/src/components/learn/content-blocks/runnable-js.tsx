"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, WandSparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import { startRun, type RunHandle, type RunResult } from "../../../lib/run-js";
import { formatCode } from "../../../lib/format-code";
import { CodeMirrorEditor, type CodeEditorHandle } from "../code-editor";
import { RUNNABLE_JS_MAX_SOURCE, RUNNABLE_JS_TIME_LIMIT_MS } from "../../../shared/runnable-js/spec";

export type RunnableJsProps = {
  /** The example source from the ```js run fence. */
  code?: string;
  title?: string;
};

type RunState = { status: "idle" } | { status: "running" } | { status: "done"; result: RunResult };

/**
 * A small JavaScript example the learner can change and run where they read it.
 * The code runs only in their browser, in a Web Worker with no page, network or
 * storage and a short time limit (see lib/run-js.ts). Nothing is sent to the
 * server, graded or saved. Reset puts the original code back.
 */
export function RunnableJs({ code = "", title }: RunnableJsProps) {
  const original = code.slice(0, RUNNABLE_JS_MAX_SOURCE);
  const [source, setSource] = useState(original);
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [formatting, setFormatting] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const handle = useRef<RunHandle | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const baseId = useId();
  const outputId = `${baseId}-output`;
  const label = title || "JavaScript example";

  // Stop a run that is still going when the learner leaves the page.
  useEffect(() => () => handle.current?.cancel(), []);

  const run = () => {
    if (state.status === "running") return;
    handle.current?.cancel();
    const current = startRun(source);
    handle.current = current;
    setState({ status: "running" });
    void current.result.then((result) => {
      if (handle.current !== current) return;
      handle.current = null;
      setState({ status: "done", result });
    });
  };

  const format = async () => {
    if (formatting || !source.trim()) return;
    setFormatting(true);
    setFormatError(null);
    try {
      const cursorOffset = editorRef.current?.getCursorOffset();
      const res = await formatCode(source, { language: "javascript", cursorOffset });
      if (res.ok) {
        if (editorRef.current) {
          editorRef.current.applyFormatted(res.code, res.cursorOffset);
        } else {
          setSource(res.code);
        }
        setFormatted(true);
        setTimeout(() => setFormatted(false), 1500);
      } else {
        setFormatError(res.error);
      }
    } finally {
      setFormatting(false);
    }
  };

  const reset = () => {
    handle.current?.cancel();
    handle.current = null;
    setSource(original);
    setFormatError(null);
    setFormatted(false);
    setState({ status: "idle" });
  };

  const running = state.status === "running";
  const result = state.status === "done" ? state.result : null;
  const changed = source !== original;

  return (
    <section className="not-prose my-8" aria-label={label} data-learn-panel="runnable-js">
      <div className="overflow-hidden rounded-xl border border-[var(--code-border)] bg-[var(--code-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--code-border)] bg-[var(--code-toolbar)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
            <span className="truncate text-[var(--code-fg)]">{title || "example.js"}</span>
            <span className="shrink-0 rounded bg-[var(--code-border)]/40 px-1.5 py-0.5 uppercase tracking-wide text-[var(--code-lang-fg)]">
              JavaScript
            </span>
          </div>
          <span className="text-xs text-[var(--code-lang-fg)]">You can change this code</span>
        </div>

        <CodeMirrorEditor
          value={source}
          onChange={(next) => {
            if (formatError) setFormatError(null);
            setSource(next);
          }}
          language="javascript"
          ariaLabel={`${label}: code you can edit and run`}
          minHeight="110px"
          maxHeight="360px"
          maxLength={RUNNABLE_JS_MAX_SOURCE}
          onRunShortcut={run}
          onFormatShortcut={() => void format()}
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

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--code-border)] bg-[var(--code-toolbar)] px-3 py-2">
          <button
            type="button"
            onClick={run}
            disabled={running || !source.trim()}
            aria-controls={outputId}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true">&#9654;</span>
            {running ? "Running" : "Run"}
          </button>
          <button
            type="button"
            onClick={() => void format()}
            disabled={running || formatting || !source.trim()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--code-border)] px-3.5 text-sm font-medium text-[var(--code-fg)] hover:bg-[var(--code-border)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {formatted ? <Check className="size-3.5 text-ok" aria-hidden /> : <WandSparkles className="size-3.5" aria-hidden />}
            {formatting ? "Formatting…" : formatted ? "Formatted" : "Format"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!changed && state.status === "idle"}
            className="inline-flex min-h-9 items-center rounded-full border border-[var(--code-border)] px-4 text-sm font-medium text-[var(--code-fg)] hover:bg-[var(--code-border)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <span className="ml-auto hidden text-xs text-[var(--code-lang-fg)] sm:inline">Ctrl + Enter to run · Shift + Alt + F to format</span>
        </div>

        <div className="border-t border-[var(--code-border)]">
          <p className="px-3 pt-2 text-xs font-bold uppercase tracking-widest text-[var(--code-lang-fg)] sm:px-4">Output</p>
          <div
            id={outputId}
            role="log"
            aria-live="polite"
            aria-label={`${label}: output`}
            tabIndex={0}
            className="max-h-64 min-h-[3.5rem] overflow-auto px-3 pb-3 pt-1 font-mono text-[13px] leading-[1.65] text-[var(--code-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
          >
            {state.status === "idle" ? (
              <p className="m-0 font-sans text-sm text-[var(--code-lang-fg)]">Press Run to see what this prints.</p>
            ) : null}
            {running ? <p className="m-0 font-sans text-sm text-[var(--code-lang-fg)]">Running...</p> : null}
            {result ? (
              <>
                {result.lines.length === 0 && !result.error ? (
                  <p className="m-0 font-sans text-sm text-[var(--code-lang-fg)]">
                    The code ran and printed nothing. Use console.log(...) to print a value.
                  </p>
                ) : null}
                {result.lines.map((line, index) => (
                  <p
                    key={index}
                    className={cn(
                      "m-0 whitespace-pre-wrap break-words",
                      line.level === "error" && "text-destructive",
                    )}
                  >
                    {line.level === "warn" ? <span className="mr-2 font-sans text-xs font-bold uppercase">Warning</span> : null}
                    {line.level === "error" ? <span className="mr-2 font-sans text-xs font-bold uppercase">Error</span> : null}
                    {line.text}
                  </p>
                ))}
                {result.truncated ? (
                  <p className="m-0 mt-1 font-sans text-sm text-[var(--code-lang-fg)]">
                    The rest of the output was left out because there were too many lines.
                  </p>
                ) : null}
                {result.error ? (
                  <p className="m-0 mt-2 whitespace-pre-wrap break-words rounded-md border border-destructive/50 bg-destructive/10 p-2 font-sans text-sm text-destructive">
                    {result.error}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        This runs only in your browser, on its own, and stops after {RUNNABLE_JS_TIME_LIMIT_MS / 1000} seconds. Nothing is saved or sent.
      </p>
    </section>
  );
}
