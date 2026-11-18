"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameTerminal, type TerminalLine } from "../game-terminal";
import type { GamePlayProps } from "../types";
import { createLinuxSession, type LinuxRound, type LinuxSubmission, type Shell } from "@/shared/games/linux/engine";
import { Controls, Counter, MissionPanel, type MissionStats } from "./mission-panel";

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
export default function LinuxPlay({ round, attempt, locked, sounds, onFinish }: GamePlayProps<LinuxRound, LinuxSubmission>) {
  const [session, setSession] = useState<Shell | null>(() => createLinuxSession(round));
  const [run, setRun] = useState(0);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [typed, setTyped] = useState(0);
  const [showBoot, setShowBoot] = useState(true);
  const [prompt, setPrompt] = useState(() => session?.prompt() ?? "$");
  const [stats, setStats] = useState<MissionStats>(() => blankStats(round));
  const [finished, setFinished] = useState(false);
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
        setLines((prev) => [...prev, { kind: "sys", text: "Mission complete! Checking your run ..." }]);
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
      <div className="rounded-md border border-border bg-card p-6">
        <p className="font-medium">This mission could not be loaded.</p>
      </div>
    );
  }

  const booting = typed < bootFull.length;
  const shown: TerminalLine[] = showBoot ? [{ kind: "sys", text: bootFull.slice(0, typed) + (booting ? "_" : "") }, ...lines] : lines;
  const disabled = locked || finished;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div ref={box} className="min-w-0 space-y-3">
        <div className="space-y-3 rounded-md border border-border bg-card p-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold" aria-label={`${stats.done.filter(Boolean).length} of ${round.objectives.length} objectives done`}>
              Objectives {stats.done.filter(Boolean).length}/{round.objectives.length}
            </span>
            <Controls stats={stats} disabled={disabled} onHint={hint} onReset={startOver} />
          </div>
          <Counter round={round} stats={stats} compact />
        </div>
        <GameTerminal
          key={run}
          lines={shown}
          prompt={prompt}
          onSubmit={runLine}
          sounds={sounds}
          locked={disabled}
          completions={completions}
          placeholder="type a command, like ls"
          height="h-72 sm:h-80 lg:h-[27rem]"
        />
        <p className="text-xs text-muted-foreground">
          Tab finishes a name. Arrow up repeats a command. Type <code className="font-mono">help</code> to see what works.
        </p>
      </div>
      <div className="min-w-0">
        <MissionPanel round={round} stats={stats} disabled={disabled} onHint={hint} onReset={startOver} />
      </div>
    </div>
  );
}

function blankStats(round: LinuxRound): MissionStats {
  return { done: round.objectives.map(() => false), commands: 0, hints: 0, hintsTotal: round.hintCount, flash: [] };
}
