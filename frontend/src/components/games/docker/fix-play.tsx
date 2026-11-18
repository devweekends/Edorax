"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameTerminal, type TerminalLine } from "../game-terminal";
import type { GameSounds } from "@/lib/games/audio";
import { checkGoal, cloneWorld, HELP_LINES, runLine, type DockerEvent, type DockerWorld } from "@/shared/games/docker/daemon";
import { MAX_COMMANDS, type FixRound, type FixSubmission } from "@/shared/games/docker/engine";
import { DockView, type Probe } from "./dock-view";
import { MissionPanel } from "./mission-panel";

type Props = {
  round: FixRound;
  attempt: number;
  locked: boolean;
  sounds: GameSounds;
  onFinish: (submission: FixSubmission) => void;
};

const COMPLETIONS = [
  "docker", "ps", "images", "run", "start", "stop", "restart", "rm", "rmi", "logs", "inspect", "exec", "pull", "network", "volume", "stats", "system", "compose",
  "curl", "help", "hint", "clear", "reset", "--name", "--network", "--restart", "--memory", "--tail", "prune", "create", "connect", "ls",
];

function intro(round: FixRound): TerminalLine[] {
  const lines: TerminalLine[] = [{ kind: "sys", text: "Virtual Docker host. Type help to see the commands, hint for a clue." }];
  if (round.world.compose) lines.push({ kind: "sys", text: "This project has a docker-compose.yml. Read it with: cat docker-compose.yml" });
  return lines;
}

/** Fix mode: a broken virtual Docker host, a terminal to repair it, and a live picture of the host. */
export function FixPlay({ round, attempt, locked, sounds, onFinish }: Props) {
  const [world, setWorld] = useState<DockerWorld>(() => cloneWorld(round.world));
  const [lines, setLines] = useState<TerminalLine[]>(() => intro(round));
  const [commands, setCommands] = useState<string[]>([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [crashed, setCrashed] = useState<ReadonlySet<string>>(new Set());
  const [probe, setProbe] = useState<Probe>(null);
  const [announced, setAnnounced] = useState(false);
  const firstAttempt = useRef(attempt);

  const goals = useMemo(() => round.goals.map((g) => ({ label: g.label, met: checkGoal(world, g) })), [round.goals, world]);
  const allMet = goals.every((g) => g.met);

  const reset = useCallback(() => {
    setWorld(cloneWorld(round.world));
    setLines([...intro(round), { kind: "sys", text: "The host is back to how it started. Your hints stay counted." }]);
    setCommands([]);
    setCrashed(new Set());
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
    setCrashed(new Set(result.events.filter((e) => e.type === "crashed").map((e) => e.name)));
    const curl = /^curl\s/.test(line);
    if (curl) {
      const port = Number(/:(\d{1,5})/.exec(line)?.[1] ?? 80);
      setProbe({ port, ok: result.ok });
    }
    const out: TerminalLine[] = result.lines.map((l) => ({ kind: l.kind, text: l.text }));
    const nowMet = round.goals.every((g) => checkGoal(next, g));
    if (nowMet && !announced) {
      out.push({ kind: "sys", text: "Every goal is met. Press Finish to check your fix." });
      setAnnounced(true);
    }
    setLines((l) => [...l, echo, ...out]);
    sound(result.events, result.ok, line);
  }

  const count = commands.length;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <div className="lg:col-start-1 lg:row-start-1">
        <MissionPanel
          title="Mission"
          goals={goals}
          counter={{ label: count === 1 ? "command" : "commands", value: count, par: round.par, limit: MAX_COMMANDS }}
          hints={round.hints}
          hintsUsed={hintsUsed}
          onHint={revealHint}
          onReset={() => { sounds.whoosh(); reset(); }}
          onFinish={() => onFinish({ mode: "fix", commands, hints: hintsUsed })}
          finishLabel={allMet ? "Finish: all goals met" : "Finish and check"}
          canFinish={count > 0}
          ready={allMet}
          locked={locked}
        />
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <GameTerminal
          lines={lines}
          prompt="$"
          onSubmit={submit}
          sounds={sounds}
          locked={locked}
          completions={COMPLETIONS}
          placeholder="docker ps"
          height="h-72 lg:h-96"
        />
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <DockView world={world} crashed={crashed} probe={probe} />
      </div>
    </div>
  );
}
