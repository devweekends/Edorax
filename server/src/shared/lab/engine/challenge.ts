// The run behind a visual challenge: pure and server-importable like the model it
// wraps. It takes a board and plays it through the challenge's scenarios (peak
// traffic, then each fault), asks the tiered-architecture model for the numbers in
// every one, and turns them into a pass or fail per check, each with the measured
// value, the target and, when it fails, the reason.
//
// Functional checks are about structure: can a request travel the path the feature
// needs? Non-functional checks are measurements: latency, how much is still served
// when something dies, whether queued work is all counted, and cost.

import type { Board, BoardNode, ChallengeDef, ChallengeScenario, CheckDef, CheckMetric, Fault, HldLabSpec } from "./hld-types.js";
import type { ComponentKind, Role } from "./catalog.js";
import { COMPONENT_CATALOG, roleOf } from "./catalog.js";
import { runTieredModel, type ModelOptions, type ModelResult, type Targets, type TierLoad } from "./tiered-architecture.js";

export const STEADY: ChallengeScenario = {
  id: "steady",
  title: "Peak traffic",
  story: "Everything is healthy and traffic is at its busiest.",
  faults: [],
};

export interface CheckResult {
  id: string;
  kind: "functional" | "non-functional";
  label: string;
  pass: boolean;
  /** What the run found, with its unit. */
  measured: string;
  /** What it had to be. */
  target: string;
  /** Why it failed and what to look at; absent when it passed. */
  reason?: string;
  /** The scenario the number comes from, so the board can replay it. */
  scenario: string;
}

export interface PhaseReport {
  id: string;
  title: string;
  story: string;
  load: number;
  /** The board as the scenario left it (fault applied). */
  board: Board;
  /** The components the fault took down or thinned out. */
  hit: string[];
  /** False when the fault named a part this design does not have. */
  applicable: boolean;
  /** The part the fault names when the design has none: "cache". */
  missing?: string;
  result: ModelResult;
}

export interface ChallengeReport {
  phases: PhaseReport[];
  checks: CheckResult[];
  passed: number;
  total: number;
  allPass: boolean;
}

const labelOf = (kind: ComponentKind) => COMPONENT_CATALOG[kind].label;
// Lowercases the first letter of a label for use mid-sentence, but leaves acronyms such as CDN alone.
const lower = (text: string) => (/^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
const pct = (n: number) => `${(Math.floor(n * 10000) / 100).toFixed(2)}%`;
const roleLabel = (role: Role) => Object.values(COMPONENT_CATALOG).find((c) => c.role === role)?.label ?? role;
const perSec = (n: number) => `${Math.round(n).toLocaleString("en-US")}/s`;

function metricText(metric: CheckMetric, v: number): string {
  switch (metric) {
    case "p99": return `${Math.round(v)} ms`;
    case "capacity": return perSec(v);
    case "served": return `${(Math.floor(v * 1000) / 10).toFixed(1)}%`;
    case "availability": return pct(v);
    case "cost": return `$${v.toFixed(2)}/h`;
  }
}
const targetText = (metric: CheckMetric, op: "<=" | ">=", v: number) =>
  `${op === "<=" ? "at most" : "at least"} ${metric === "availability" ? pct(v) : metricText(metric, v)}`;

// ---- faults -------------------------------------------------------------------

function applyFaults(board: Board, faults: Fault[], steady: ModelResult): { board: Board; hit: string[]; applicable: boolean } {
  const nodes: BoardNode[] = board.nodes.map((n) => ({ ...n, props: { ...(n.props ?? {}) } }));
  const hit: string[] = [];
  for (const fault of faults) {
    const targets = nodes.filter((n) => roleOf(n.kind) === fault.role);
    if (targets.length === 0) continue;
    if (fault.type === "down") {
      for (const n of targets) { n.props!.down = 1; hit.push(n.id); }
    } else {
      const first = targets[0]!;
      const units = steady.tiers.find((t) => t.id === first.id)?.units ?? 1;
      if (units <= 1) first.props!.down = 1;
      else { first.props!.autoscale = 0; first.props!.count = units - 1; }
      hit.push(first.id);
    }
  }
  return { board: { ...board, nodes }, hit, applicable: hit.length > 0 };
}

// ---- functional checks: can a request travel the path? ---------------------------

function reachFrom(board: Board, starts: string[]): Set<string> {
  const next = new Map<string, string[]>();
  for (const e of board.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const to of next.get(id) ?? []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
  }
  return seen;
}

/** Walks the roles in order. Returns the labels found so far and the first role that has no way in. */
export function followChain(board: Board, chain: Role[]): { trail: string[]; missing?: Role } {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  let frontier = board.nodes.filter((n) => roleOf(n.kind) === chain[0] && !n.props?.down).map((n) => n.id);
  const trail: string[] = frontier.length > 0 ? [labelOf(byId.get(frontier[0]!)!.kind)] : [];
  if (frontier.length === 0) return { trail, missing: chain[0] };
  for (const role of chain.slice(1)) {
    const reached = reachFrom(board, frontier);
    frontier = [...reached].filter((id) => roleOf(byId.get(id)!.kind) === role && !byId.get(id)!.props?.down);
    if (frontier.length === 0) return { trail, missing: role };
    trail.push(labelOf(byId.get(frontier[0]!)!.kind));
  }
  return { trail };
}

const ROLE_NAME: Partial<Record<Role, string>> = {
  client: "a client", compute: "an app server", database: "a database", queue: "a queue", worker: "a worker", cache: "a cache", balancer: "a load balancer",
};
const roleName = (role: Role) => ROLE_NAME[role] ?? `a ${role}`;

function pathCheck(def: Extract<CheckDef, { type: "path" }>, board: Board): CheckResult {
  const { trail, missing } = followChain(board, def.chain);
  if (missing !== undefined && def.inlineIfNo && !board.nodes.some((n) => roleOf(n.kind) === def.inlineIfNo)) {
    return {
      id: def.id, kind: def.kind, label: def.label, pass: true, scenario: "steady", target: def.target,
      measured: `saved during the request (inline), no ${lower(roleLabel(def.inlineIfNo))}`,
    };
  }
  const pass = missing === undefined;
  const last = trail.at(-1);
  return {
    id: def.id, kind: def.kind, label: def.label, pass, scenario: "steady", target: def.target,
    measured: pass ? trail.join(" > ") : trail.length > 0 ? `${trail.join(" > ")} > ?` : "no path",
    reason: pass ? undefined : trail.length === 0
      ? `There is no ${missing === "client" ? "client" : roleName(missing!).replace(/^an? /, "")} on the board.`
      : `The path stops at ${lower(last!)}: link it to ${roleName(missing!)}.`,
  };
}

// ---- non-functional checks: measured in a scenario ---------------------------------

function worstTier(result: ModelResult): TierLoad | undefined {
  return [...result.tiers].filter((t) => t.reachable && !t.managed).sort((a, b) => b.utilisation - a.utilisation)[0];
}
const busy = (t: TierLoad) => `${labelOf(t.kind)} is ${Math.round(t.utilisation * 100)}% busy`;

function measure(metric: CheckMetric, r: ModelResult, load: number): number {
  switch (metric) {
    case "p99": return r.p99Ms;
    case "capacity": return r.capacityCeiling;
    case "served": return load > 0 ? Math.min(1, r.capacityCeiling / load) : 1;
    case "availability": return r.availability;
    case "cost": return r.costPerHour;
  }
}

function whyMetricFailed(metric: CheckMetric, r: ModelResult, scenario: PhaseReport): string {
  const worst = worstTier(r);
  const during = scenario.id === "steady" ? "" : ` while ${lower(scenario.title)}`;
  if (r.failure) return r.failure;
  switch (metric) {
    case "p99": {
      const slow = [...r.tiers].filter((t) => t.waitMs > 0.5).sort((x, y) => y.waitMs - x.waitMs).slice(0, 2);
      return slow.length > 0
        ? `Requests wait in line at ${slow.map((t) => `the ${lower(labelOf(t.kind))} (${Math.round(t.utilisation * 100)}% busy, +${Math.round(t.waitMs)} ms)`).join(" and ")}${during}. Give them more capacity, or take load off them.`
        : "The path itself is too slow: fewer hops would help.";
    }
    case "capacity":
    case "served":
      return worst ? `${busy(worst)}${during}, so it cannot serve the whole load. Add machines, read-only copies or a cache in front of it.` : "Nothing on the board can serve the load.";
    case "availability": {
      const role = r.weakest?.role;
      return role ? `${roleLabel(role)} is the weak link (${pct(r.weakest!.availability)}): run more than one, or in two zones.` : "Add redundancy.";
    }
    case "cost": {
      const priciest = [...r.tiers].sort((a, b) => b.cost - a.cost)[0];
      return priciest ? `${labelOf(priciest.kind)} costs the most ($${priciest.cost.toFixed(2)}/h). Try a smaller size or fewer machines.` : "Over budget.";
    }
  }
}

function metricCheck(def: Extract<CheckDef, { type: "metric" }>, phases: Map<string, PhaseReport>): CheckResult {
  const phase = phases.get(def.scenario) ?? phases.get("steady")!;
  const value = measure(def.metric, phase.result, phase.load);
  const pass = def.op === "<=" ? value <= def.value : value >= def.value;
  return {
    id: def.id, kind: def.kind, label: def.label, pass, scenario: phase.id,
    measured: metricText(def.metric, value) + (phase.applicable || phase.id === "steady" ? "" : ` (no ${phase.missing} to lose)`),
    target: targetText(def.metric, def.op, def.value),
    reason: pass ? undefined : whyMetricFailed(def.metric, phase.result, phase),
  };
}

function drainCheck(def: Extract<CheckDef, { type: "drain" }>, steady: PhaseReport, scenarioId: string, inlineClicks: boolean, share = 1): CheckResult {
  const { board, result, load } = steady;
  const queue = board.nodes.find((n) => roleOf(n.kind) === "queue" && result.tiers.find((t) => t.id === n.id)?.reachable);
  const items = def.items ?? "clicks";
  const done = def.done ?? "counted";
  const Items = items.charAt(0).toUpperCase() + items.slice(1);
  const target = `no ${items} lost, all ${done} within ${def.maxDrainSeconds} s of the worker coming back`;
  const base = { id: def.id, kind: def.kind, label: def.label, scenario: scenarioId, target };
  if (!queue && inlineClicks && !board.nodes.some((n) => roleOf(n.kind) === "queue")) {
    return { ...base, pass: true, measured: `no worker to lose: ${items} are saved during the request (inline)` };
  }
  if (!queue) {
    // With no queue there is no link to read the rate from, so take the queue's share of the stream.
    const lost = Math.round(load * share * def.outageSeconds);
    return { ...base, pass: false, measured: `${lost.toLocaleString("en-US")} ${items} lost in ${def.outageSeconds} s`, reason: `${Items} have nowhere to wait while the worker is down. Put a queue between the app server and the worker.` };
  }
  const workers = board.edges.filter((e) => e.from === queue.id).map((e) => result.tiers.find((t) => t.id === e.to)).filter((t): t is TierLoad => !!t && roleOf(t.kind) === "worker");
  if (workers.length === 0) {
    return { ...base, pass: false, measured: `${items} pile up and are never ${done}`, reason: "The queue has no worker. Link the queue to a worker, and the worker to where it saves its work." };
  }
  const arriving = board.edges.filter((e) => e.to === queue.id).reduce((sum, e) => sum + (result.edgeFlows[`${e.from}>${e.to}`] ?? 0), 0);
  const capacity = workers.reduce((sum, w) => sum + w.capacity, 0);
  const spare = capacity - arriving;
  const backlog = Math.round(arriving * def.outageSeconds);
  if (spare <= 0) {
    return { ...base, pass: false, measured: `${backlog.toLocaleString("en-US")} ${items} waiting, never all ${done}`, reason: `Workers handle ${perSec(capacity)} but ${items} arrive at ${perSec(arriving)}: they can never catch up. Add workers or a bigger size.` };
  }
  const drain = Math.ceil(backlog / spare);
  const pass = drain <= def.maxDrainSeconds;
  return {
    ...base, pass, measured: `${backlog.toLocaleString("en-US")} ${items} waiting, all ${done} after ${drain} s`,
    reason: pass ? undefined : `Workers have only ${perSec(spare)} to spare, so ${backlog.toLocaleString("en-US")} waiting ${items} take ${drain} s. Add workers or a bigger size.`,
  };
}

// ---- the run ----------------------------------------------------------------------

/** Labs with no authored challenge are scored on their targets, as non-functional checks. */
export function challengeFor(spec: HldLabSpec): ChallengeDef {
  if (spec.challenge) return spec.challenge;
  const level = spec.levels[0];
  const t = level?.targets ?? {};
  const checks: CheckDef[] = [];
  const add = (id: string, label: string, metric: CheckMetric, op: "<=" | ">=", value?: number) => {
    if (value != null) checks.push({ type: "metric", id, kind: "non-functional", label, scenario: "steady", metric, op, value });
  };
  add("capacity", "Serves the load", "capacity", ">=", t.rps);
  add("p99", "Slowest 1 in 100 requests (p99)", "p99", "<=", t.p99Ms);
  add("availability", "Stays up (availability)", "availability", ">=", t.availability);
  add("cost", "Cost per hour", "cost", "<=", t.budgetPerHour);
  return { peakLoad: level?.load ?? 1000, scenarios: [], checks };
}

/** The model run for a lab: the same options the challenge's own scenarios use, so every number agrees. */
export function runModel(spec: HldLabSpec, board: Board, load: number, targets: Targets = {}): ModelResult {
  const options: ModelOptions = {
    inlineWrites: Boolean(spec.challenge?.inlineClicks) && !board.nodes.some((n) => roleOf(n.kind) === "queue"),
    shares: spec.challenge?.shares,
  };
  return runTieredModel(board, load, targets, options);
}

/** Plays the board through the challenge. `board` must already carry the learner's properties. */
export function runChallenge(spec: HldLabSpec, board: Board, load: number): ChallengeReport {
  const challenge = challengeFor(spec);
  const steadyResult = runModel(spec, board, load);
  const phases: PhaseReport[] = [{ ...STEADY, load, board, hit: [], applicable: true, result: steadyResult }];
  for (const scenario of challenge.scenarios) {
    const { board: faulted, hit, applicable } = applyFaults(board, scenario.faults, steadyResult);
    const missing = applicable ? undefined : lower(roleLabel(scenario.faults[0]?.role ?? "compute"));
    phases.push({ id: scenario.id, title: scenario.title, story: scenario.story, load, board: faulted, hit, applicable, missing, result: runModel(spec, faulted, load) });
  }
  const byId = new Map(phases.map((p) => [p.id, p]));
  const steady = phases[0]!;
  const checks: CheckResult[] = challenge.checks.map((def) => {
    if (def.type === "path") return pathCheck(def, board);
    if (def.type === "drain") return drainCheck(def, steady, challenge.scenarios.find((s) => s.faults.some((f) => f.type === "down" && f.role === "worker"))?.id ?? "steady", Boolean(challenge.inlineClicks), challenge.shares?.queue ?? 1);
    return metricCheck(def, byId);
  });
  const passed = checks.filter((c) => c.pass).length;
  return { phases, checks, passed, total: checks.length, allPass: passed === checks.length };
}
