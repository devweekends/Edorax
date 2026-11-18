// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// System Design Runner: each round is a production incident on a small AWS system. The player
// picks a few changes, and a deterministic traffic simulation says whether the goals are met.
import { pickDaily } from "../daily";
import type { GameEngine, Stars, VerifyResult } from "../types";
import { SYSDESIGN_POOL } from "./scenarios";
import { evaluateGoals, simulate } from "./sim";
import type { SysdesignRound, SysdesignSubmission } from "./types";

export type { SysdesignRound, SysdesignSubmission } from "./types";
export type { ChangeDef, ComponentId, CostLine, GoalCheck, Goals, Model, Pricing, SimResult, StepResult, StepStatus, Stretch } from "./types";
export { STEPS } from "./types";
export { applyChanges, costDelta, evaluateGoals, simulate } from "./sim";
export { SYSDESIGN_POOL } from "./scenarios";

/** Hard ceiling on a submission, whatever the round allows. */
const MAX_PARSED_CHANGES = 8;

function fail(message: string): VerifyResult {
  return { passed: false, stars: 0, score: 0, message };
}

export const sysdesignEngine: GameEngine<SysdesignRound, SysdesignSubmission> = {
  id: "sysdesign",
  title: "System Design Runner",
  tagline: "A real incident on a small AWS system. Pick the fixes, run the traffic, and meet the goals.",
  roundsFor: (dayKey) => pickDaily(SYSDESIGN_POOL, dayKey, "sysdesign"),

  parseSubmission(input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys[0] !== "changes") return null;
    const changes = (input as { changes?: unknown }).changes;
    if (!Array.isArray(changes) || changes.length > MAX_PARSED_CHANGES) return null;
    const seen = new Set<string>();
    for (const id of changes) {
      if (typeof id !== "string" || id.length === 0 || id.length > 64 || seen.has(id)) return null;
      seen.add(id);
    }
    return { changes: [...changes] as string[] };
  },

  verify(round, submission) {
    try {
      const ids = Array.isArray(submission?.changes) ? submission.changes.filter((id): id is string => typeof id === "string") : [];
      if (new Set(ids).size !== ids.length) return fail("Each change can be used only once.");
      if (ids.length > round.maxChanges) return fail(`You can apply at most ${round.maxChanges} changes in this round.`);
      const offered = new Set(round.changes.map((c) => c.id));
      if (ids.some((id) => !offered.has(id))) return fail("One of those changes is not part of this round.");

      const sim = simulate(round, ids);
      const checks = evaluateGoals(round.goals, sim);
      const missed = checks.find((c) => !c.met);
      if (missed) {
        return { passed: false, stars: 0, score: sim.costUsd, message: `Goal missed: ${missed.label.toLowerCase()} is ${missed.actual}, the goal is ${missed.target}.` };
      }

      const stretch = round.stretch;
      const tighter = (stretch.maxCostUsd === undefined || sim.costUsd <= stretch.maxCostUsd) && (stretch.maxP95Ms === undefined || sim.p95Ms <= stretch.maxP95Ms);
      const lean = ids.length <= round.solution.length && !(round.trap !== undefined && ids.includes(round.trap));
      const stars: Stars = tighter ? (lean ? 3 : 2) : 1;
      const target = [stretch.maxCostUsd !== undefined ? `$${stretch.maxCostUsd} a month` : "", stretch.maxP95Ms !== undefined ? `${stretch.maxP95Ms} ms p95` : ""].filter(Boolean).join(" and ");
      const message =
        stars === 3
          ? `All goals met with ${ids.length} change${ids.length === 1 ? "" : "s"}: p95 ${sim.p95Ms} ms, ${sim.availability}% available, $${sim.costUsd} a month.`
          : stars === 2
            ? "All goals met and under the tighter target. For 3 stars, use fewer changes and skip the tempting trap."
            : `All goals met. For more stars, get under the tighter target of ${target}.`;
      return { passed: true, stars, score: sim.costUsd, message };
    } catch {
      return fail("That set of changes could not be checked. Try again.");
    }
  },
};
