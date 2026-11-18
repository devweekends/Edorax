"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameTerminal, type TerminalLine } from "../game-terminal";
import type { GamePlayProps } from "../types";
import { createLinuxSession, type LinuxRound, type LinuxSubmission, type Shell } from "@/shared/games/linux/engine";
import { FrameButton, GameFrame } from "../game-frame";
import { MissionPanel, type MissionStats } from "./mission-panel";

const LEVELS = ["EASY", "MEDIUM", "HARD"] as const;

// The terminal is dark in both themes, like a real one. These are the dark code tokens.
const DARK_TERMINAL = {
  "--code-surface": "#070b20",
  "--code-border": "#26305f",
  "--code-lang-fg": "#aab3de",
  "--code-fg": "#e8ebff",
} as React.CSSProperties;

const MAX_LINES = 600;
/** The pause between reaching the goal and handing the run to the shell, so the win can be seen. */
const FINISH_DELAY_MS = 1400;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The Linux Command Explorer: a fake shell on a made-up server, with a mission panel next to it.
 * The shared engine runs one command at a time; this component draws the screen, plays the sounds
 * and calls `onFinish` with the commands when the goal is reached.
 */
export default function LinuxPlay({ round, roundIndex, attempt, locked, sounds, onFinish }: GamePlayProps<LinuxRound, LinuxSubmission>) {
  const [session, setSession] = useState<Shell | null>(() => createLinuxSession(round));
  const [run, setRun] = useState(0);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [typed, setTyped] = useState(0);
  const [showBoot, setShowBoot] = useState(true);
  const [prompt, setPrompt] = useState(() => session?.prompt() ?? "$");
  const [stats, setStats] = useState<MissionStats>(() => blankStats(round));
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sent = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const focusTerminal = useCallback(() => {
    box.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const startOver = useCallback(() => {
    clearTimers();
    sent.current = false;
    const next = createLinuxSession(round);
    setSession(next);
    setLines([]);
    setTyped(0);
    setShowBoot(true);
    setFinished(false);
    setStarted(false);
    setPrompt(next?.prompt() ?? "$");
    setStats(blankStats(round));
    setRun((n) => n + 1);
  }, [round, clearTimers]);

  // The shell resets itself when the shell part of the host asks for a new attempt.
  const firstAttempt = useRef(attempt);
  useEffect(() => {
    if (attempt !== firstAttempt.current) {
      firstAttempt.current = attempt;
      startOver();
    }
  }, [attempt, startOver]);

  // Put the cursor in the terminal, so the keyboard works at once (and again after a reset).
  useEffect(() => {
    const t = setTimeout(focusTerminal, 50);
    return () => clearTimeout(t);
  }, [run, focusTerminal]);

  // A typewriter boot line: `typed` counts the characters shown so far.
  const bootFull = useMemo(() => session?.bootLines().join("\n") ?? "", [session]);
  useEffect(() => {
    if (!session) return;
    if (prefersReducedMotion()) {
      const t = setTimeout(() => setTyped(bootFull.length), 0);
      return () => clearTimeout(t);
    }
    if (run === 0) sounds.boot();
    const timer = setInterval(() => {
      setTyped((n) => {
        if (n + 2 >= bootFull.length) clearInterval(timer);
        return Math.min(bootFull.length, n + 2);
      });
    }, 24);
    return () => clearInterval(timer);
  }, [session, run, bootFull]); // eslint-disable-line react-hooks/exhaustive-deps

  const completions = useMemo(() => session?.completions() ?? [], [session, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const runLine = useCallback(
    (line: string) => {
      if (!session || locked || finished) return;
      setStarted(true);
      const before = session.prompt();
      const res = session.run(line);
      const out: TerminalLine[] = res.lines.map((l) => ({ kind: l.kind, text: l.text }));
      if (res.accepted && !res.clear) out.unshift({ kind: "in", text: line, prompt: before });
      if (!res.accepted && out.length === 0) out.push({ kind: "sys", text: "Nothing to run." });

      if (res.clear) setShowBoot(false);
      setLines((prev) => [...(res.clear ? [] : prev), ...out].slice(-MAX_LINES));
      setPrompt(session.prompt());

      const progress = session.progress();
      setStats({ done: progress.done, commands: progress.commands, hints: progress.hints, hintsTotal: progress.hintsTotal, flash: res.newlyDone });

      const notFound = res.lines.some((l) => l.kind === "err" && /command not found/.test(l.text));
      if (notFound || !res.accepted) sounds.error();
      else if (res.newlyDone.length > 0) sounds.ok();

      if (res.newlyDone.length > 0) {
        const t = setTimeout(() => setStats((s) => ({ ...s, flash: [] })), 1200);
        timers.current.push(t);
      }

      if (res.solved && !sent.current) {
        sent.current = true;
        setFinished(true);
        setLines((prev) => [...prev, { kind: "sys", text: "All checks pass. Checking your run ..." }]);
        const t = setTimeout(() => onFinish({ commands: session.commands, hints: session.hintCount }), FINISH_DELAY_MS);
        timers.current.push(t);
      }
    },
    [session, locked, finished, sounds, onFinish],
  );

  const hint = useCallback(() => {
    if (!session || locked || finished) return;
    sounds.snap();
    runLine("hint");
  }, [session, locked, finished, sounds, runLine]);

  if (!session) {
    return (
      <div className="border border-border bg-card p-6">
        <p className="font-medium">This mission could not be loaded. Reload the page to try again.</p>
      </div>
    );
  }

  const booting = typed < bootFull.length;
  const shown: TerminalLine[] = showBoot ? [{ kind: "sys", text: bootFull.slice(0, typed) + (booting ? "_" : "") }, ...lines] : lines;
  const disabled = locked || finished;
  const hintsLeft = stats.hintsTotal - stats.hints;
  const level = LEVELS[roundIndex] ?? LEVELS[0];

  const steps = [
    "Read the brief and the checks list.",
    "Type a command and press Enter. Type help to see what works.",
    round.kind === "answer"
      ? "Finish with: submit <your answer>. The game checks it for you."
      : "When every check shows Pass, you are done. There is no Check button: the game checks for you.",
  ];

  // On a phone the keyboard covers the lower half, so bring the input into the middle of what is left.
  function keepInputVisible(event: React.FocusEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    setTimeout(() => target.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" }), 300);
  }

  return (
    <GameFrame
      level={level}
      levelNumber={roundIndex + 1}
      title={round.title}
      brief={round.story}
      steps={steps}
      actions={
        <>
          <FrameButton
            onClick={hint}
            disabled={disabled || hintsLeft <= 0}
            className="min-h-11 sm:min-h-9"
            title="Shows the next hint in the terminal. Each hint lowers your stars."
          >
            Hint · {hintsLeft} left
          </FrameButton>
          <FrameButton onClick={startOver} disabled={disabled} className="min-h-11 sm:min-h-9" title="Start this mission again">
            Reset
          </FrameButton>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div ref={box} className="min-w-0" onFocus={keepInputVisible} style={DARK_TERMINAL}>
          <div className="flex items-center justify-between gap-3 bg-[#0f1b33] px-3 py-2 text-slate-300">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Terminal</span>
            <span className="hidden font-mono text-[11px] sm:inline">Tab finishes a name. Up arrow repeats a command.</span>
          </div>
          <div className="flex items-center gap-3 border-b border-[var(--code-border)] bg-[var(--code-surface)] px-3 py-2.5 text-[15px] text-[var(--code-fg)]">
            {started ? (
              <p>
                Stuck? Type <code className="bg-white/10 px-1.5 py-0.5 font-mono text-[14px]">help</code> to see what works, or press Hint.
              </p>
            ) : (
              <>
                <span className="shrink-0 bg-emerald-400 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-950">Start here</span>
                <p>
                  Type <code className="bg-white/10 px-1.5 py-0.5 font-mono text-[14px] font-bold">ls</code> and press Enter.
                </p>
              </>
            )}
          </div>
          <GameTerminal
            key={run}
            lines={shown}
            prompt={prompt}
            onSubmit={runLine}
            sounds={sounds}
            locked={disabled}
            completions={completions}
            placeholder="Type: ls"
            className="rounded-none border-0 border-b text-[14px] [&_input]:min-h-11 [&_input]:text-base sm:[&_input]:text-[14px] [&_input]:placeholder:text-slate-500"
            height="h-56 sm:h-72 lg:h-[24rem]"
          />
        </div>
        <MissionPanel round={round} stats={stats} />
      </div>
    </GameFrame>
  );
}

function blankStats(round: LinuxRound): MissionStats {
  return { done: round.objectives.map(() => false), commands: 0, hints: 0, hintsTotal: round.hintCount, flash: [] };
}
