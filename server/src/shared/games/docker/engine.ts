/* eslint-disable no-control-regex -- the shell engines reject or use control characters on purpose */
// The Docker Commands daily game. Two modes share each day: "fix" (a virtual Docker host that is
// broken; the player types real commands to repair it) and "build" (the player assembles a
// Dockerfile or a compose file from pieces). The engine is pure: it replays the commands or the
// pieces from the start state and checks the goals. It never throws.

import { dayNumber, hashString, pickDaily } from "../daily.js";
import type { GameEngine, Stars, VerifyResult } from "../types.js";
import { checkBuildGoal, simulateBuild, type BuildReport } from "./builder.js";
import { checkGoal, cloneWorld, runLine } from "./daemon.js";
import { POOL, type BuildRound, type DockerRound, type FixRound } from "./scenarios.js";

export type { BuildRound, DockerRound, FixRound } from "./scenarios.js";

export type FixSubmission = { mode: "fix"; commands: string[]; hints: number };
export type BuildSubmission = { mode: "build"; steps: string[]; hints: number };
export type DockerSubmission = FixSubmission | BuildSubmission;

export const MAX_COMMANDS = 100;
export const MAX_COMMAND_LENGTH = 300;
export const MAX_STEPS = 40;
const MAX_HINTS = 50;

const POOL_BY_ID = new Map<string, DockerRound>(POOL.map((r) => [r.id, r]));

/** Today's three rounds: one per difficulty, and always at least one fix and one build round. */
export function roundsFor(dayKey: string): DockerRound[] {
  const picked = pickDaily<DockerRound>(POOL, dayKey, "docker");
  const modes = new Set(picked.map((r) => r.mode));
  if (modes.size === 2) return picked;
  // All three share a mode: swap the medium round for the nearest medium round of the other mode.
  const want = picked[0]!.mode === "fix" ? "build" : "fix";
  const tier = POOL.filter((r) => r.difficulty === "medium");
  const start = tier.indexOf(picked[1]!);
  for (let step = 1; step <= tier.length; step++) {
    const candidate = tier[(Math.max(0, start) + step + dayNumber(dayKey)) % tier.length]!;
    if (candidate.mode === want) return [picked[0]!, candidate, picked[2]!];
  }
  const any = tier.find((r) => r.mode === want);
  return any ? [picked[0]!, any, picked[2]!] : picked;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseSubmission(input: unknown): DockerSubmission | null {
  try {
    if (!isObject(input)) return null;
    const keys = Object.keys(input);
    const hints = input.hints;
    if (typeof hints !== "number" || !Number.isInteger(hints) || hints < 0 || hints > MAX_HINTS) return null;
    if (input.mode === "fix") {
      if (keys.some((k) => !["mode", "commands", "hints"].includes(k))) return null;
      const commands = input.commands;
      if (!Array.isArray(commands) || commands.length > MAX_COMMANDS) return null;
      for (const c of commands) {
        if (typeof c !== "string" || c.trim().length === 0 || c.length > MAX_COMMAND_LENGTH || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(c)) return null;
      }
      return { mode: "fix", commands: commands as string[], hints };
    }
    if (input.mode === "build") {
      if (keys.some((k) => !["mode", "steps", "hints"].includes(k))) return null;
      const steps = input.steps;
      if (!Array.isArray(steps) || steps.length > MAX_STEPS) return null;
      for (const s of steps) if (typeof s !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(s)) return null;
      return { mode: "build", steps: steps as string[], hints };
    }
    return null;
  } catch {
    return null;
  }
}

const fail = (message: string, score = 0): VerifyResult => ({ passed: false, stars: 0, score, message });

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function verifyFix(round: FixRound, sub: FixSubmission): VerifyResult {
  if (sub.commands.length === 0) return fail("You have not typed any command yet.");
  const world = cloneWorld(round.world);
  for (const command of sub.commands.slice(0, MAX_COMMANDS)) runLine(world, command);
  const unmet = round.goals.filter((g) => !checkGoal(world, g));
  const count = sub.commands.length;
  if (unmet.length > 0) return fail(`Not fixed yet: ${unmet[0]!.label}.`, count);
  let stars: Stars = 1;
  if (sub.hints <= 1 && count <= round.par + 4) stars = 2;
  if (sub.hints === 0 && count <= round.par + 1) stars = 3;
  const message =
    stars === 3 ? `Fixed in ${plural(count, "command")} with no hints, very clean.`
      : stars === 2 ? `Fixed in ${plural(count, "command")}. Fewer commands and no hints give the third star.`
        : `Fixed in ${plural(count, "command")}. Use fewer commands and fewer hints for more stars.`;
  return { passed: true, stars, score: count, message };
}

export function buildReportFor(round: BuildRound, steps: string[]): BuildReport {
  return simulateBuild(round, steps);
}

function verifyBuild(round: BuildRound, sub: BuildSubmission): VerifyResult {
  if (sub.steps.length === 0) return fail("You have not placed any piece yet.");
  const report = simulateBuild(round, sub.steps);
  const count = sub.steps.length;
  const unmet = round.goals.filter((g) => !checkBuildGoal(report, g));
  if (unmet.length > 0) return fail(report.error ?? `Not done yet: ${unmet[0]!.label}.`, count);
  const clean = report.cacheFriendly && report.warnings.length === 0;
  const best = simulateBuild(round, round.solution);
  let stars: Stars = 1;
  if (clean && sub.hints <= 1 && count <= round.par + 2) stars = 2;
  if (clean && sub.hints === 0 && count <= round.par && report.sizeMb <= best.sizeMb * 1.05 + 1) stars = 3;
  const what = round.kind === "compose"
    ? `The stack starts and localhost:${report.port ?? ""} answers.`
    : `The image builds in ${report.coldSec} s, a rebuild takes ${report.rebuildSec} s, and it is ${report.sizeMb} MB.`;
  const tip = stars === 3 ? " Clean and with no hints." : !report.cacheFriendly ? " Put the dependency install before the code copy for more stars." : report.warnings.length ? ` ${report.warnings[0]}` : " Fewer hints and no extra pieces give more stars.";
  return { passed: true, stars, score: count, message: `${what}${tip}` };
}

export function verify(round: DockerRound, submission: DockerSubmission): VerifyResult {
  try {
    const known = isObject(round) && typeof round.id === "string" ? POOL_BY_ID.get(round.id) : undefined;
    const real = known ?? (isObject(round) && (round.mode === "fix" || round.mode === "build") ? round : undefined);
    if (!real) return fail("That round could not be checked.");
    const sub = parseSubmission(submission);
    if (!sub) return fail("That did not look like a finished round.");
    if (real.mode !== sub.mode) {
      return fail(real.mode === "fix" ? "This is a fix round: use the terminal to repair it." : "This is a build round: put the pieces together.");
    }
    return real.mode === "fix" ? verifyFix(real, sub as FixSubmission) : verifyBuild(real, sub as BuildSubmission);
  } catch {
    return fail("That answer could not be checked.");
  }
}

export const dockerEngine: GameEngine<DockerRound, DockerSubmission> = {
  id: "docker",
  title: "Docker Commands",
  tagline: "Fix broken containers in a terminal, and build Dockerfiles and compose files from pieces.",
  roundsFor,
  parseSubmission,
  verify,
};

/** A small stable number for a round id, for tests and for shuffles that must repeat. */
export const roundHash = (id: string) => hashString(id);
