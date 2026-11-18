// The LabSpec data contract. An author writes a LabSpec in a lab's data.ts; the
// registry, the runtime and the validator all read it. validateLabSpec is the
// runtime guard the registry test runs over every registered lab.

import type { ComponentKind } from "./catalog";
import { canConnect, isComponentKind } from "./catalog";
import type { BuildGoal, BuildPart, BuildSolution } from "./net/build-model";
import { validateBuildLab } from "./net/build-validate";
import type { NetCheck } from "./net/checks";
import type { NetTopology } from "./net/model";
import type { PlanSpec } from "./net/plan";
import { validateChecks, validatePlan, validateSolution as validateNetSolution, validateTopology } from "./net/validate";
import type { Board, BoardNode, ChallengeDef, HldLabSpec, LabBase } from "../shared/lab/engine/hld-types";
export type {
  Board,
  BoardEdge,
  BoardNode,
  ChallengeDef,
  ChallengeScenario,
  CheckDef,
  CheckMetric,
  Fault,
  HldLabSpec,
  LabBase,
  LabFamily,
  LabLevel,
  SolutionDef,
  SolutionPart,
} from "../shared/lab/engine/hld-types";

export interface DbLabSpec extends LabBase {
  family: "db";
  startingDbml: string;
  query: string;
}

export interface NetSolutionStep {
  device: string;
  command: string;
  why: string;
}

export interface NetSolution {
  summary: string;
  steps?: NetSolutionStep[];
  blocks?: Record<string, { block: string; why: string }>;
  // Build mode: a finished canvas and a why for each step of making it.
  build?: BuildSolution;
}

export interface NetLabSpec extends LabBase {
  family: "net";
  mode: "explore" | "fault" | "plan" | "build";
  topology?: NetTopology;
  checks?: NetCheck[];
  plan?: PlanSpec;
  // Build mode: what the learner can place, and what the finished network must do.
  palette?: BuildPart[];
  goals?: BuildGoal[];
  startDevice?: string;
  tasks?: string[];
  suggested?: string[];
  solution?: NetSolution;
}

export type LabSpec = HldLabSpec | DbLabSpec | NetLabSpec;

function validateNetLab(spec: NetLabSpec): string[] {
  if (spec.mode === "build") return validateBuildLab(spec);
  const problems: string[] = [];
  if (spec.mode !== "explore" && !spec.solution) problems.push(`a ${spec.mode} lab needs a solution`);
  if (spec.mode === "plan") {
    if (!spec.plan) problems.push("a plan lab needs a plan");
    else problems.push(...validatePlan(spec.plan));
    if (spec.plan && spec.solution) problems.push(...validateNetSolution(spec.solution, { plan: spec.plan }));
    return problems;
  }
  if (!spec.topology) return ["an explore or fault lab needs a topology"];
  problems.push(...validateTopology(spec.topology));
  if (spec.checks) problems.push(...validateChecks(spec.topology, spec.checks));
  if (spec.mode === "fault" && !spec.checks?.length) problems.push("a fault lab needs checks");
  if (spec.solution) problems.push(...validateNetSolution(spec.solution, { topology: spec.topology, checks: spec.checks }));
  if (spec.startDevice && !spec.topology.devices.some((d) => d.id === spec.startDevice)) {
    problems.push(`startDevice "${spec.startDevice}" is not a device`);
  }
  return problems;
}

function validateBoard(board: Board, allowed: ComponentKind[]): string[] {
  const problems: string[] = [];
  const byId = new Map<string, BoardNode>();
  for (const node of board.nodes) {
    byId.set(node.id, node);
    if (!allowed.includes(node.kind)) {
      problems.push(`startingBoard node "${node.id}" uses ${node.kind}, which is not in allowedComponents`);
    }
  }
  for (const edge of board.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from) problems.push(`startingBoard edge from unknown node "${edge.from}"`);
    if (!to) problems.push(`startingBoard edge to unknown node "${edge.to}"`);
    if (from && to) {
      if (!isComponentKind(from.kind) || !isComponentKind(to.kind)) {
        // An unknown kind is already reported by the node loop; skip canConnect
        // so the validator reports rather than throwing on a bad catalog lookup.
      } else if (!canConnect(from.kind, to.kind)) {
        problems.push(`startingBoard edge ${from.kind} -> ${to.kind} cannot connect: no matching port`);
      }
    }
  }
  return problems;
}

export function validateChallenge(challenge: ChallengeDef): string[] {
  const problems: string[] = [];
  const scenarioIds = new Set(["steady"]);
  for (const s of challenge.scenarios) {
    if (scenarioIds.has(s.id)) problems.push(`scenario id "${s.id}" is repeated or reserved`);
    scenarioIds.add(s.id);
    if (s.faults.length === 0) problems.push(`scenario "${s.id}" has no fault`);
  }
  const checkIds = new Set<string>();
  for (const c of challenge.checks) {
    if (checkIds.has(c.id)) problems.push(`check id "${c.id}" is repeated`);
    checkIds.add(c.id);
    if (c.type === "metric" && !scenarioIds.has(c.scenario)) problems.push(`check "${c.id}" names unknown scenario "${c.scenario}"`);
    if (c.type === "metric" && !Number.isFinite(c.value)) problems.push(`check "${c.id}" needs a finite value`);
    if (c.type === "path" && c.chain.length < 2) problems.push(`check "${c.id}" needs a chain of at least two roles`);
  }
  if (!(challenge.peakLoad > 0)) problems.push("challenge peakLoad must be positive");
  for (const [role, share] of Object.entries(challenge.shares ?? {})) {
    if (!(typeof share === "number" && share > 0 && share <= 1)) problems.push(`share for ${role} must be above 0 and at most 1`);
  }
  if (!challenge.checks.some((c) => c.kind === "functional")) problems.push("a challenge needs at least one functional check");
  if (!challenge.checks.some((c) => c.kind === "non-functional")) problems.push("a challenge needs at least one non-functional check");
  return problems;
}

/** The check ids a lab scores: its challenge's, or the four target checks. */
export function checkIdsOf(spec: HldLabSpec): string[] {
  if (spec.challenge) return spec.challenge.checks.map((c) => c.id);
  return ["capacity", "p99", "availability", "cost"];
}

function validateSolution(spec: HldLabSpec): string[] {
  const solution = spec.solution!;
  const problems = validateBoard(solution.board, spec.allowedComponents).map((p) => p.replace("startingBoard", "solution board"));
  const ids = new Set(solution.board.nodes.map((n) => n.id));
  const checks = new Set(checkIdsOf(spec));
  if (solution.summary.trim().length === 0) problems.push("solution needs a summary");
  for (const node of solution.board.nodes) {
    if (node.kind !== "client" && !solution.parts[node.id]) problems.push(`solution has no explanation for part "${node.id}"`);
  }
  for (const [id, part] of Object.entries(solution.parts)) {
    if (!ids.has(id)) problems.push(`solution explains unknown part "${id}"`);
    if (part.why.trim().length === 0 || part.without.trim().length === 0) problems.push(`solution part "${id}" needs why and without`);
    for (const c of part.checks) if (!checks.has(c)) problems.push(`solution part "${id}" names unknown check "${c}"`);
  }
  return problems;
}

export function validateLabSpec(spec: LabSpec): string[] {
  const problems: string[] = [];
  if (spec.limits.length <= 20) problems.push("limits must be longer than 20 characters");
  if (spec.title.trim().length === 0) problems.push("title must not be empty");
  if (spec.purpose.trim().length === 0) problems.push("purpose must not be empty");

  if (spec.family === "hld") {
    for (const kind of spec.allowedComponents) {
      if (!isComponentKind(kind)) problems.push(`allowedComponents names "${kind}", which is not a component kind`);
    }
    if (spec.levels.length === 0) problems.push("an hld lab needs at least one level");
    if (spec.startingBoard) problems.push(...validateBoard(spec.startingBoard, spec.allowedComponents));
    if (spec.challenge) problems.push(...validateChallenge(spec.challenge));
    if (spec.solution) problems.push(...validateSolution(spec));
  } else if (spec.family === "net") {
    problems.push(...validateNetLab(spec));
  } else {
    if (spec.startingDbml.trim().length === 0) problems.push("a db lab needs startingDbml");
    if (spec.query.trim().length === 0) problems.push("a db lab needs a query");
  }

  return problems;
}
