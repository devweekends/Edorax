/* eslint-disable no-control-regex -- the shell engines reject or use control characters on purpose */
// Linux Command Explorer: a terminal quest on a made-up server. The player solves a mission with
// real commands in a fake shell. The browser plays it live; the server replays the same commands
// from a fresh state before it gives XP. Pure and deterministic, so both sides always agree.
import { pickDaily } from "../daily.js";
import type { GameEngine, RoundBase, Stars, VerifyResult } from "../types.js";
import { USAGE } from "./commands.js";
import { MISSIONS, missionById } from "./missions.js";
import { MAX_COMMANDS, MAX_LINE, Shell } from "./shell.js";

export type { OutLine, Progress, RunResult } from "./shell.js";
export { Shell } from "./shell.js";

/** What the browser needs to show a mission. The server definition (files, goal) stays in the engine. */
export type LinuxRound = RoundBase & {
  story: string;
  /** The checklist, in order. The last one is the goal. */
  objectives: string[];
  /** Commands a good player needs. Three stars need this many or fewer, with no hints. */
  par: number;
  hintCount: number;
  /** "answer": give an answer with submit. "state": change the server until the goal is true. */
  kind: "answer" | "state";
};

export type LinuxSubmission = { commands: string[]; hints: number };

const POOL: LinuxRound[] = MISSIONS.map((m) => ({
  id: m.id,
  difficulty: m.difficulty,
  title: m.title,
  brief: m.brief,
  story: m.story,
  objectives: m.objectives.map((o) => o.label),
  par: m.par,
  hintCount: m.hints.length,
  kind: m.answer ? "answer" : "state",
}));

const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;

function parseSubmission(input: unknown): LinuxSubmission | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.some((k) => k !== "commands" && k !== "hints")) return null;
  const { commands, hints } = input as { commands?: unknown; hints?: unknown };
  if (!Array.isArray(commands) || commands.length > MAX_COMMANDS) return null;
  for (const line of commands) {
    if (typeof line !== "string" || line.length > MAX_LINE || CONTROL.test(line)) return null;
  }
  if (typeof hints !== "number" || !Number.isInteger(hints) || hints < 0 || hints > 20) return null;
  return { commands: [...(commands as string[])], hints };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function verify(round: LinuxRound, submission: LinuxSubmission): VerifyResult {
  const fail = (message: string, score = 0): VerifyResult => ({ passed: false, stars: 0, score, message });
  try {
    const mission = missionById(round?.id);
    if (!mission) return fail("This mission is not known.");
    const parsed = parseSubmission(submission);
    if (!parsed) return fail("That did not look like a finished round.");
    if (parsed.commands.length === 0) return fail("No commands were run yet. Try ls to look around.");
    const shell = new Shell(mission);
    for (const line of parsed.commands) shell.run(line);
    const progress = shell.progress();
    if (!shell.isSolved) {
      const open = mission.objectives.find((_, i) => !progress.done[i]);
      return fail(open ? `The goal is not reached yet. Still open: ${open.label}.` : "The goal is not reached yet.", shell.commandCount);
    }
    const commands = shell.commandCount;
    const hints = Math.max(shell.hintCount, parsed.hints);
    const stars: Stars = hints === 0 && commands <= mission.par ? 3 : hints <= 1 && commands <= mission.par + 4 ? 2 : 1;
    const message =
      stars === 3
        ? `Solved in ${plural(commands, "command")}, par is ${mission.par}, with no hints.`
        : `Solved in ${plural(commands, "command")} (par ${mission.par}) with ${plural(hints, "hint")}; use par or fewer commands and no hints for 3 stars.`;
    return { passed: true, stars, score: commands, message };
  } catch {
    return fail("That run could not be checked.");
  }
}

export const linuxEngine: GameEngine<LinuxRound, LinuxSubmission> = {
  id: "linux",
  title: "Linux Command Explorer",
  tagline: "Solve missions on a made-up Linux server with real commands.",
  roundsFor: (dayKey) => pickDaily(POOL, dayKey, "linux"),
  parseSubmission,
  verify,
};

/** A new shell for a round, or null when the round is not one of ours. */
export function createLinuxSession(round: { id: string }): Shell | null {
  const mission = missionById(round?.id);
  return mission ? new Shell(mission) : null;
}

/** The "what works" cheat sheet, grouped. */
export function linuxCheatSheet(): Array<{ group: string; items: Array<{ name: string; usage: string; desc: string }> }> {
  const groups = new Map<string, Array<{ name: string; usage: string; desc: string }>>();
  for (const [name, u] of Object.entries(USAGE)) groups.set(u.group, [...(groups.get(u.group) ?? []), { name, usage: u.usage, desc: u.desc }]);
  return [...groups].map(([group, items]) => ({ group, items }));
}

export const LINUX_LIMITS = { maxCommands: MAX_COMMANDS, maxLine: MAX_LINE };
