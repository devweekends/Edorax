"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameTerminal, type TerminalLine } from "../game-terminal";
import type { GameSounds } from "@/lib/games/audio";
import { checkGoal, cloneWorld, HELP_LINES, runLine, type DockerEvent, type DockerWorld } from "@/shared/games/docker/daemon";
import { MAX_COMMANDS, type FixRound, type FixSubmission } from "@/shared/games/docker/engine";
import { GameFrame, type FrameCheck } from "../game-frame";
import { DockView, stateOf, type Probe } from "./dock-view";
import { HeaderActions, levelOf, MissionPanel, MobileBar, type Primary } from "./mission-panel";

type Props = {
  round: FixRound;
  roundIndex: number;
  attempt: number;
  locked: boolean;
  sounds: GameSounds;
  onFinish: (submission: FixSubmission) => void;
};

const STEPS = [
  "Read the brief and the checks",
  "Type Docker commands in the terminal. Type help to see what works",
  "When every check is Pass, press Finish",
];

const COMPLETIONS = [
  "docker", "ps", "images", "run", "start", "stop", "restart", "rm", "rmi", "logs", "inspect", "exec", "pull", "network", "volume", "stats", "system", "compose",
  "curl", "help", "hint", "clear", "reset", "--name", "--network", "--restart", "--memory", "--tail", "prune", "create", "connect", "ls",
];

function intro(round: FixRound): TerminalLine[] {
  const lines: TerminalLine[] = [{ kind: "sys", text: "Practice Docker host. Type help to see the commands that work here." }];
  if (round.world.compose) lines.push({ kind: "sys", text: "This project has a docker-compose.yml. Read it with: cat docker-compose.yml" });
  return lines;
}

/** Fix mode: a broken virtual Docker host, a terminal to repair it, and a live picture of the host. */
export function FixPlay({ round, roundIndex, attempt, locked, sounds, onFinish }: Props) {
  const [world, setWorld] = useState<DockerWorld>(() => cloneWorld(round.world));
  const [lines, setLines] = useState<TerminalLine[]>(() => intro(round));
  const [commands, setCommands] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [probe, setProbe] = useState<Probe>(null);
  const [announced, setAnnounced] = useState(false);
  const firstAttempt = useRef(attempt);

  const checks = useMemo<FrameCheck[]>(() => round.goals.map((g, i) => ({ id: String(i), label: g.label, state: checkGoal(world, g) ? "pass" : "wait" })), [round.goals, world]);
  const passed = checks.filter((c) => c.state === "pass").length;
  const allMet = passed === checks.length;

  const reset = useCallback(() => {
    setWorld(cloneWorld(round.world));
    setLines([...intro(round), { kind: "sys", text: "The host is back to how it started. Hints you used stay counted." }]);
    setCommands([]);
    setChanged(new Set());
    setProbe(null);
    setAnnounced(false);
  }, [round]);

  // A new attempt starts the round again (the shell also remounts this component).
  useEffect(() => {
    if (attempt !== firstAttempt.current) {
      firstAttempt.current = attempt;
      reset();
      setHintsUsed(0);
    }
  }, [attempt, reset]);

  function sound(events: DockerEvent[], ok: boolean, text: string) {
    if (!ok) return sounds.error();
    if (events.some((e) => e.type === "crashed" || e.type === "blocked")) return sounds.error();
    if (events.some((e) => e.type === "started")) return sounds.boot();
    if (events.some((e) => e.type === "pruned")) return sounds.whoosh();
    if (events.some((e) => e.type === "pulled" && e.name === "curl")) return sounds.whoosh();
    if (events.some((e) => ["created", "removed", "network", "volume", "pulled", "stopped"].includes(e.type)) || /^docker (stop|rm|start)/.test(text)) return sounds.ok();
  }

  function revealHint() {
    if (hintsUsed >= round.hints.length) return;
    const text = round.hints[hintsUsed]!;
    setHintsUsed(hintsUsed + 1);
    setLines((l) => [...l, { kind: "sys", text: `Hint ${hintsUsed + 1}: ${text}` }]);
    sounds.ok();
  }

  function submit(raw: string) {
    const line = raw.trim();
    if (!line) return;
    const echo: TerminalLine = { kind: "in", text: line };
    if (line === "help") return setLines((l) => [...l, echo, ...HELP_LINES.map((text): TerminalLine => ({ kind: "out", text }))]);
    if (line === "hint") {
      setLines((l) => [...l, echo]);
      return revealHint();
    }
    if (line === "clear") return setLines([]);
    if (line === "reset") {
      sounds.whoosh();
      return reset();
    }
    if (commands.length >= MAX_COMMANDS) {
      sounds.error();
      return setLines((l) => [...l, echo, { kind: "sys", text: `That is ${MAX_COMMANDS} commands, the limit. Press Reset to start again.` }]);
    }
    const next = cloneWorld(world);
    const result = runLine(next, line);
    setWorld(next);
    setCommands((c) => [...c, line]);
    const before = new Map(world.containers.map((c) => [c.name, stateOf(c)]));
    setChanged(new Set(next.containers.filter((c) => before.get(c.name) !== stateOf(c)).map((c) => c.name)));
    const curl = /^curl\s/.test(line);
    if (curl) {
      const port = Number(/:(\d{1,5})/.exec(line)?.[1] ?? 80);
      setProbe({ port, ok: result.ok });
    }
    const out: TerminalLine[] = result.lines.map((l) => ({ kind: l.kind, text: l.text }));
    const nowMet = round.goals.every((g) => checkGoal(next, g));
    if (nowMet && !announced) {
      out.push({ kind: "sys", text: "Every check is Pass. Press Finish." });
      setAnnounced(true);
    }
    setLines((l) => [...l, echo, ...out]);
    sound(result.events, result.ok, line);
  }

  const count = commands.length;
  const primary: Primary = { label: "Finish", onClick: () => onFinish({ mode: "fix", commands, hints: hintsUsed }), disabled: !allMet, pulse: allMet };
  const { level, levelNumber } = levelOf(roundIndex);
  const onReset = () => { sounds.whoosh(); reset(); };

  return (
    <>
      <GameFrame
        level={level}
        levelNumber={levelNumber}
        title={round.title}
        brief={round.brief}
        steps={STEPS}
        actions={<HeaderActions hints={round.hints} hintsUsed={hintsUsed} onHint={revealHint} onReset={onReset} primary={primary} locked={locked} />}
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
          <section
            aria-label="Terminal"
            className="min-w-0 border border-[#26305f] bg-[#0b1220] text-slate-100"
            onFocusCapture={(e) => {
              // On a phone the keyboard covers the lower half, so bring the input to the middle.
              const el = e.target as HTMLElement;
              if (el.tagName === "INPUT" && window.innerWidth < 1024) window.setTimeout(() => el.scrollIntoView({ block: "center" }), 300);
            }}
          >
            <div className="flex items-center justify-between gap-3 bg-[#0f1b33] px-3 py-2">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-sky-300">Terminal</h3>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300">{count} {count === 1 ? "command" : "commands"}</span>
            </div>
            {count === 0 ? (
              <p className="border-b border-[#26305f] border-l-4 border-l-emerald-400 bg-emerald-400/10 px-3 py-2.5 font-mono text-[14px] font-bold text-emerald-300">
                Start here: type docker ps and press Enter
              </p>
            ) : null}
            <GameTerminal
              lines={lines}
              prompt="$"
              onSubmit={submit}
              sounds={sounds}
              locked={locked}
              completions={COMPLETIONS}
              placeholder="Type a command"
              height="h-72 lg:h-[26rem]"
              className="rounded-none border-0 text-[14px] [--code-surface:#0b1220] [--code-border:#26305f] [--code-fg:#e8ebff] [--code-lang-fg:#b9c2e8] [&_input]:text-[16px] sm:[&_input]:text-[14px] [&_input]:placeholder:text-slate-400"
            />
            <p className="border-t border-[#26305f] px-3 py-2 text-[13px] text-slate-300">
              Type help for the command list. Press Tab to finish a word. Press the up arrow to repeat a command.
            </p>
          </section>

          <div className="min-w-0 space-y-5">
            <MissionPanel checks={checks} counter={{ noun: "commands", value: count, par: round.par, threeStarsAt: round.par + 1 }} hints={round.hints} hintsUsed={hintsUsed} />
            {allMet ? <p className="border border-l-4 border-border border-l-emerald-500 bg-emerald-50 px-3 py-2.5 text-sm font-medium dark:bg-emerald-950/40" role="status">Every check is Pass. Press Finish.</p> : null}
            <DockView world={world} changed={changed} probe={probe} />
          </div>
        </div>
      </GameFrame>
      <MobileBar primary={primary} passed={passed} total={checks.length} locked={locked} />
    </>
  );
}
