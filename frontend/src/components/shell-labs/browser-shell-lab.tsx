"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Check, Circle, CircleAlert, Lightbulb, ListChecks, LoaderCircle, PartyPopper, Play, RotateCcw, SquareTerminal, Volume2, VolumeX, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { fireMiniConfetti } from "@buildment/learning-ui/components/learn/mini-confetti";
import { Dot } from "@/components/brand/dot";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { BrowserLabRuntime, BrowserLabUnsupportedError, type BrowserLabStage } from "@/lib/browser-lab/runtime";
import type { BrowserLab, BrowserLabStep, BrowserLabStepResult } from "@/lib/browser-lab/types";
import { firePartyPopper } from "@/lib/party-popper";
import { isSoundEnabled, playFeedback, setSoundEnabled } from "@/lib/sound-feedback";
import { cn } from "@/lib/utils";
import { Rich } from "./rich";

// A shell lab that runs in the browser: the steps on the left, a real Linux terminal on the right.
// The machine lives in this tab only. Passed steps are saved on the account, like in the desktop app.
// While the machine runs, the "Done when" list of the open step is checked every few seconds, so a
// step ticks off by itself the moment the machine really does what the step asks.

type Phase = "idle" | BrowserLabStage | "error" | "unsupported";

const STAGES: { id: BrowserLabStage; label: string }[] = [
  { id: "support", label: "Check your browser" },
  { id: "download", label: "Download the Linux machine" },
  { id: "boot", label: "Start Linux" },
  { id: "setup", label: "Prepare the lab" },
];
const LIVE_CHECK_MS = 4000;
const noSubscription = () => () => {};
const focusRing = "outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

/** The step body: lines that start with "1." become a numbered list, the rest are paragraphs. */
function Body({ text }: { text: string }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const numbered = lines.filter((line) => /^\d+\.\s/.test(line));
  const plain = lines.filter((line) => !/^\d+\.\s/.test(line));
  return (
    <>
      {plain.map((line, index) => (
        <p key={index} className="text-base">
          <Rich text={line} />
        </p>
      ))}
      {numbered.length > 0 && (
        <ol className="space-y-2.5">
          {numbered.map((line, index) => (
            <li key={index} className="flex gap-3 text-base">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">
                {index + 1}
              </span>
              <span className="min-w-0">
                <Rich text={line.replace(/^\d+\.\s/, "")} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function LabTerminal({ runtime, onError }: { runtime: BrowserLabRuntime; onError: (message: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let active = true;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (!active || !host.current) return;
      const terminal = new Terminal({
        fontSize: 14,
        lineHeight: 1.25,
        cursorBlink: true,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        theme: { background: "#0f1115", foreground: "#e6e6e6", cursor: "#f5c518", selectionBackground: "#3b4252" },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(host.current);
      fit.fit();
      const pty = await runtime.openTerminal(terminal.cols, terminal.rows);
      const reader = pty.output.getReader();
      const input = terminal.onData((data) => void pty.write(data).catch(() => undefined));
      const observer = new ResizeObserver(() => {
        if (!host.current?.clientWidth) return;
        fit.fit();
        pty.resize(terminal.cols, terminal.rows);
      });
      observer.observe(host.current);
      cleanup = () => {
        observer.disconnect();
        input.dispose();
        void reader.cancel().catch(() => undefined);
        void pty.close().catch(() => undefined);
        terminal.dispose();
      };
      if (!active) return cleanup();
      terminal.focus();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        terminal.write(value);
      }
      if (active) terminal.write("\r\n[The shell ended. Use Restart to open a new one.]\r\n");
    })().catch((error: unknown) => active && onErrorRef.current(error instanceof Error ? error.message : String(error)));
    return () => {
      active = false;
      cleanup();
    };
  }, [runtime]);

  return <div ref={host} className="size-full" aria-label="Lab terminal" />;
}

function Quiz({ step, done, onAnswer }: { step: BrowserLabStep; done: boolean; onAnswer: (correct: boolean) => void }) {
  const quiz = step.quiz!;
  const [picked, setPicked] = useState<number | null>(done ? quiz.answer : null);
  const right = picked === quiz.answer;
  return (
    <div className="space-y-3">
      <p className="text-base font-bold">
        <Rich text={quiz.question} />
      </p>
      {quiz.show && <pre className="max-h-64 overflow-auto rounded-md bg-[#0f1115] p-3 font-mono text-sm text-[#e6e6e6]">{quiz.show}</pre>}
      <div className="grid gap-2">
        {quiz.options.map((option, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              setPicked(index);
              onAnswer(index === quiz.answer);
            }}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-left text-base transition-colors",
              focusRing,
              picked === index ? (right ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950" : "border-destructive bg-destructive/10") : "border-border hover:border-primary hover:bg-secondary",
            )}
          >
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-sm font-bold">
              {picked === index ? right ? <Check className="size-3.5" /> : <X className="size-3.5" /> : String.fromCharCode(65 + index)}
            </span>
            <span className="min-w-0">
              <Rich text={option} />
            </span>
          </button>
        ))}
      </div>
      {picked !== null && (
        <p className="text-base text-muted-foreground" aria-live="polite">
          {right ? <Rich text={quiz.why} /> : "Not this one. Read the lesson again and pick another answer."}
        </p>
      )}
    </div>
  );
}

export function BrowserShellLab({ lab, initialDone }: { lab: BrowserLab; initialDone: string[] }) {
  const [runtime] = useState(() => new BrowserLabRuntime(lab));
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>(initialDone);
  const [active, setActive] = useState(() => Math.max(0, lab.steps.findIndex((step) => !initialDone.includes(step.id))));
  const [results, setResults] = useState<Record<string, BrowserLabStepResult>>({});
  const [hints, setHints] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  /** Steps the learner pressed "Check my work" on. Only then does a missing item say what is wrong. */
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [session, setSession] = useState(0);
  // The sound setting lives in localStorage (shared with the course reader). Read it after hydration.
  const [, refreshSound] = useState(0);
  const sound = useSyncExternalStore(noSubscription, isSoundEnabled, () => true);
  /** Set when the learner finishes the last open step in this visit, so the party shows once. */
  const [celebrate, setCelebrate] = useState(false);
  const workspace = useRef<HTMLElement>(null);
  const stepsPane = useRef<HTMLDivElement>(null);
  const doneRef = useRef(done);

  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  const step = lab.steps[active] ?? lab.steps[0];
  const result = results[step.id];
  const stepDone = done.includes(step.id);
  const allDone = lab.steps.every((item) => done.includes(item.id));
  const ready = phase === "ready";
  const busy = phase !== "idle" && phase !== "ready" && phase !== "error" && phase !== "unsupported";

  /** Marks a step passed: saves it, plays the sound and throws confetti. The last step gets the party. */
  const complete = useCallback(
    (stepId: string) => {
      if (doneRef.current.includes(stepId)) return;
      const next = [...doneRef.current, stepId];
      doneRef.current = next;
      setDone(next);
      void apiFetch(`/api/v1/shell-labs/progress/${lab.slug}`, { method: "PUT", json: { steps: next } }).catch(() => undefined);
      const finished = lab.steps.every((item) => next.includes(item.id));
      if (finished) {
        setCelebrate(true);
        playFeedback("celebration");
        firePartyPopper();
      } else {
        playFeedback("success");
        if (stepsPane.current) fireMiniConfetti(stepsPane.current);
      }
      // A step can pass while the learner looks at the terminal. Bring the result into view.
      requestAnimationFrame(() => {
        if (finished) stepsPane.current?.scrollTo({ top: 0, behavior: "smooth" });
        else stepsPane.current?.querySelector("[data-step-result]")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    },
    [lab.slug, lab.steps],
  );

  const start = useCallback(async () => {
    setError("");
    try {
      await runtime.start(setPhase);
      setSession((value) => value + 1);
      playFeedback("notification");
      // The steps and the terminal fill one screen, so bring that screen into view.
      workspace.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (problem) {
      playFeedback("error");
      if (problem instanceof BrowserLabUnsupportedError) {
        setError(problem.problems.join(" "));
        setPhase("unsupported");
      } else {
        setError(problem instanceof Error ? problem.message : String(problem));
        setPhase("error");
      }
    }
  }, [runtime]);

  /** A new machine, like a reload. Passed steps stay saved, so nothing the learner earned is lost. */
  const restart = useCallback(async () => {
    setResults({});
    setAsked({});
    setPhase("boot");
    await runtime.stop();
    await start();
  }, [runtime, start]);

  useEffect(() => () => void runtime.stop(), [runtime]);

  const check = async () => {
    if (!runtime.running) return;
    setChecking(true);
    playFeedback("submit");
    try {
      const [outcome] = await runtime.check([step]);
      setResults((current) => ({ ...current, [step.id]: outcome }));
      setAsked((current) => ({ ...current, [step.id]: true }));
      if (outcome.passed) complete(step.id);
      else playFeedback("error");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setChecking(false);
    }
  };

  // The live check: quiet, no mistake scripts, only while this tab is in front and the step is open.
  useEffect(() => {
    if (!ready || step.quiz || stepDone || !step.checks?.length) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.hidden || !runtime.running) return;
      const [outcome] = await runtime.check([step], { mistakes: false }).catch(() => []);
      if (stopped || !outcome) return;
      // Keep what the last "Check my work" said about a mistake until the step passes.
      setResults((current) => ({ ...current, [step.id]: { ...outcome, mistake: current[step.id]?.mistake } }));
      if (outcome.passed) complete(step.id);
    };
    const timer = setInterval(() => void tick(), LIVE_CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [ready, step, stepDone, runtime, complete]);

  const shownHints = hints[step.id] ?? 0;
  const stageIndex = STAGES.findIndex((item) => item.id === phase);
  const section = "border-t border-border pt-4";
  const status = ready ? "Running" : busy ? "Starting" : phase === "error" || phase === "unsupported" ? "Not running" : "Not started";

  return (
    <section
      ref={workspace}
      aria-label={`${lab.title}, lab workspace`}
      className="mt-6 flex scroll-mt-16 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:h-[calc(100dvh-5rem)] lg:min-h-[34rem]"
    >
      {/* Top bar: progress of the lab, the machine's state and the controls. */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-sm font-bold">
            {done.filter((id) => lab.steps.some((item) => item.id === id)).length} of {lab.steps.length} steps
          </span>
          <div
            className="h-2 min-w-16 max-w-64 flex-1 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Lab progress"
            aria-valuemin={0}
            aria-valuemax={lab.steps.length}
            aria-valuenow={done.length}
          >
            <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${(Math.min(done.length, lab.steps.length) / lab.steps.length) * 100}%` }} />
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-bold" role="status">
          <span aria-hidden className={cn("size-2.5 rounded-full", ready ? "bg-emerald-500" : busy ? "animate-pulse bg-brand-yellow" : "bg-muted-foreground/50")} />
          {status}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={sound}
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            title={sound ? "Sound is on" : "Sound is off"}
            onClick={() => {
              setSoundEnabled(!sound);
              refreshSound((value) => value + 1);
              if (!sound) playFeedback("tick");
            }}
          >
            {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          </Button>
          {ready && (
            <Button variant="outline" size="sm" onClick={() => void restart()} title="A new machine. Passed steps stay saved.">
              <RotateCcw className="size-4" aria-hidden />
              Restart
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Steps */}
        <div ref={stepsPane} className="sidebar-scroll min-w-0 space-y-4 p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto">
          <nav aria-label="Steps" className="flex items-center">
            {lab.steps.map((item, index) => {
              const itemDone = done.includes(item.id);
              return (
                <div key={item.id} className={cn("flex items-center", index > 0 && "flex-1")}>
                  {index > 0 && <span aria-hidden className={cn("h-0.5 flex-1", done.includes(lab.steps[index - 1].id) ? "bg-emerald-600" : "bg-border")} />}
                  <button
                    type="button"
                    aria-current={index === active ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${item.goal}${itemDone ? " (done)" : ""}`}
                    title={item.goal}
                    onClick={() => {
                      setActive(index);
                      playFeedback("tick");
                    }}
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-colors",
                      focusRing,
                      index === active
                        ? "border-primary bg-primary text-primary-foreground"
                        : itemDone
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
                    )}
                  >
                    {itemDone && index !== active ? <Check className="size-4" aria-hidden /> : index + 1}
                  </button>
                </div>
              );
            })}
          </nav>

          {celebrate && allDone && (
            <div className="flex items-center gap-4 rounded-lg border-2 border-emerald-600 bg-emerald-50 p-4 dark:bg-emerald-950" role="status">
              <span className="shrink-0">
                <Dot mood="cheer" size={72} />
              </span>
              <div className="min-w-0 space-y-2">
                <p className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em]">
                  <PartyPopper className="size-5 text-emerald-700 dark:text-emerald-300" aria-hidden />
                  Lab complete
                </p>
                <p className="text-base">
                  You finished all {lab.steps.length} steps of {lab.title} on a real Linux machine.
                </p>
                <Link href={`/labs/${lab.topic ?? "linux"}`} className={cn("inline-flex min-h-11 items-center gap-1.5 text-base font-bold text-primary hover:underline", focusRing)}>
                  Pick the next lab
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-primary">
              Step {active + 1} of {lab.steps.length}
            </p>
            <h2 className="text-2xl leading-snug tracking-[-0.02em]">
              <Rich text={step.goal} />
            </h2>
            {step.about && (
              <p className="text-base text-muted-foreground">
                <Rich text={step.about} />
              </p>
            )}
          </div>

          {step.learn && step.learn.length > 0 && (
            <details key={`learn-${step.id}`} className={cn(section, "group")} open={!stepDone}>
              <summary className={cn("cursor-pointer text-base font-bold", focusRing)}>Lesson</summary>
              <div className="mt-2 space-y-2">
                {step.learn.map((paragraph, index) => (
                  <p key={index} className="text-base">
                    <Rich text={paragraph} />
                  </p>
                ))}
              </div>
            </details>
          )}

          {step.commands && step.commands.length > 0 && (
            <details key={`commands-${step.id}`} className={section}>
              <summary className={cn("cursor-pointer text-base font-bold", focusRing)}>Commands in this step ({step.commands.length})</summary>
              <dl className="mt-3 space-y-3">
                {step.commands.map((note) => (
                  <div key={note.command} className="rounded-md border border-border p-3">
                    <dt className="font-mono text-sm font-bold text-foreground">{note.command}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      <Rich text={note.meaning} />
                      {note.example && (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-[#0f1115] p-2.5 font-mono text-[13px] leading-relaxed text-[#e6e6e6]">
                          <span className="text-emerald-400">$ </span>
                          {note.example}
                          {note.output ? `\n${note.output}` : ""}
                        </pre>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          <div className="space-y-3 rounded-lg border border-border border-l-4 border-l-primary bg-background p-4">
            <h3 className="text-base font-bold">Your task</h3>
            <Body text={step.body} />
          </div>

          {step.quiz ? (
            <Quiz key={step.id} step={step} done={stepDone} onAnswer={(correct) => (correct ? complete(step.id) : playFeedback("error"))} />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <ListChecks className="size-4" aria-hidden />
                  Done when
                  {ready && !stepDone && <span className="ml-auto text-xs font-normal normal-case tracking-normal">Checked live</span>}
                </h3>
                {step.expected && (
                  <p className="mt-2 text-base">
                    <Rich text={step.expected} />
                  </p>
                )}
                <ul className="mt-3 space-y-2" aria-live="polite">
                  {(step.checks ?? []).map((item) => {
                    const outcome = result?.checks.find((entry) => entry.id === item.id);
                    const passed = stepDone || outcome?.passed === true;
                    return (
                      <li key={item.id} className="flex items-start gap-2.5 text-base">
                        {passed ? (
                          <Check className="mt-1 size-4 shrink-0 text-emerald-600" aria-label="Done" />
                        ) : (
                          <Circle className="mt-1 size-4 shrink-0 text-muted-foreground/60" aria-label="Not done yet" />
                        )}
                        <span className={cn("min-w-0", passed && "text-muted-foreground")}>
                          <Rich text={item.label} />
                          {!passed && asked[step.id] && outcome?.message && (
                            <span className="mt-0.5 block text-sm text-destructive">
                              <Rich text={outcome.message} />
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {result?.mistake && !stepDone && (
                <p className="flex gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-base">
                  <CircleAlert className="mt-1 size-4 shrink-0 text-destructive" aria-hidden />
                  <span>
                    <Rich text={result.mistake} />
                  </span>
                </p>
              )}

              {!stepDone && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void check()} disabled={!ready || checking}>
                    {checking ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                    Check my work
                  </Button>
                  {shownHints < step.hints.length && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setHints((current) => ({ ...current, [step.id]: shownHints + 1 }));
                        playFeedback("tick");
                      }}
                    >
                      <Lightbulb className="size-4" aria-hidden />
                      {shownHints === 0 ? "Hint" : `Next hint (${shownHints} of ${step.hints.length})`}
                    </Button>
                  )}
                  {!ready && <span className="text-sm text-muted-foreground">Start the lab to check your work.</span>}
                </div>
              )}

              {step.hints.slice(0, shownHints).map((hint, index) => (
                <p key={index} className="flex gap-2.5 rounded-md bg-brand-yellow/15 p-3 text-base">
                  <Lightbulb className="mt-1 size-4 shrink-0" aria-hidden />
                  <span>
                    <strong>Hint {index + 1}. </strong>
                    <Rich text={hint} />
                  </span>
                </p>
              ))}
            </div>
          )}

          {stepDone && (
            <div data-step-result className="space-y-2 rounded-lg border border-emerald-600/50 bg-emerald-50 p-4 dark:bg-emerald-950" role="status">
              <p className="flex items-start gap-2 text-base font-bold">
                <Check className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  <Rich text={step.win ?? "Step done."} />
                </span>
              </p>
              {step.after && (
                <p className="text-base">
                  <Rich text={step.after} />
                </p>
              )}
              {active + 1 < lab.steps.length && (
                <Button
                  onClick={() => {
                    setActive(active + 1);
                    stepsPane.current?.scrollTo({ top: 0 });
                  }}
                >
                  Next step
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              )}
              {active + 1 === lab.steps.length && allDone && <p className="text-base font-bold">You finished this lab.</p>}
            </div>
          )}
        </div>

        {/* Machine */}
        <div className="flex h-[70dvh] min-w-0 flex-col border-t border-border bg-[#0f1115] lg:h-auto lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </span>
            <SquareTerminal className="ml-2 size-4 text-white/60" aria-hidden />
            <span className="font-mono text-sm text-white/80">root@{lab.machine.name}</span>
            <span className="ml-auto text-xs text-white/50">Linux, in this tab</span>
          </div>
          <div className="min-h-0 flex-1 p-2">
            {ready ? (
              <LabTerminal key={session} runtime={runtime} onError={setError} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-5 p-6 text-center text-white">
                {phase === "unsupported" ? (
                  <>
                    <CircleAlert className="size-9 text-[#ff8a80]" aria-hidden />
                    <p className="max-w-md text-base">
                      This browser cannot run the lab. Use a current version of Chrome, Edge, Firefox or Safari, or use the desktop app below.
                    </p>
                    <p className="max-w-md text-sm text-white/60">{error}</p>
                  </>
                ) : busy ? (
                  <ol className="w-full max-w-xs space-y-3 text-left" role="status" aria-label="Starting the lab">
                    {STAGES.map((item, index) => (
                      <li key={item.id} className={cn("flex items-center gap-3 text-base", index > stageIndex && "text-white/40")}>
                        {index < stageIndex ? (
                          <Check className="size-5 shrink-0 text-emerald-400" aria-hidden />
                        ) : index === stageIndex ? (
                          <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-yellow" aria-hidden />
                        ) : (
                          <Circle className="size-5 shrink-0" aria-hidden />
                        )}
                        <span className={cn(index === stageIndex && "font-bold")}>{item.label}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <>
                    <SquareTerminal className="size-10 text-white/70" aria-hidden />
                    <div className="space-y-1.5">
                      <p className="text-xl font-bold">A real Linux machine, in this tab</p>
                      <p className="max-w-sm text-base text-white/70">Nothing is installed on your computer. It starts in a few seconds.</p>
                    </div>
                    <Button
                      size="lg"
                      onClick={() => {
                        playFeedback("submit");
                        void start();
                      }}
                    >
                      <Play className="size-4" aria-hidden />
                      {phase === "error" ? "Try again" : "Start the lab"}
                    </Button>
                    {phase === "error" && <p className="max-w-md text-sm text-[#ff8a80]">{error}</p>}
                  </>
                )}
              </div>
            )}
          </div>
          <p className="border-t border-white/10 px-3 py-1.5 text-xs text-white/50">
            {ready && error ? <span className="text-[#ff8a80]">{error}</span> : "A reload gives you a new machine. Passed steps stay saved."}
          </p>
        </div>
      </div>
    </section>
  );
}
