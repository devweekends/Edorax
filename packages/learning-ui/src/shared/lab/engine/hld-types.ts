// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The pure data shapes of a high-level design (HLD) lab: the board, the challenge, the
// reference solution and the HLD spec. No UI and no network imports, so the server can
// replay a design with the same types the lab board uses.

import type { ComponentKind, Role } from "./catalog";

export type LabFamily = "hld" | "db" | "net";

export interface BoardNode {
  id: string;
  kind: ComponentKind;
  x: number;
  y: number;
  props?: Record<string, number | string>;
}

export interface BoardEdge {
  from: string;
  to: string;
  /** Which dot each end uses (t, r, b, l); the board picks bottom to top when absent. */
  via?: [string, string];
}

export interface Board {
  nodes: BoardNode[];
  edges: BoardEdge[];
}

export interface LabLevel {
  id: string;
  load: number;
  targets: { rps?: number; p99Ms?: number; availability?: number; budgetPerHour?: number };
  event?: string;
}

// ---- challenge: the checks a visual lab's Run puts the design through ----------

/** Something that goes wrong in a scenario. */
export type Fault =
  /** One instance of the first component with this role dies; a fleet of one dies whole. */
  | { type: "lose-instance"; role: Role }
  /** Every component with this role goes down. */
  | { type: "down"; role: Role };

export interface ChallengeScenario {
  id: string;
  /** Short name, shown on the run strip: "The cache dies". */
  title: string;
  /** One line shown while this phase plays. */
  story: string;
  faults: Fault[];
}

export type CheckMetric = "p99" | "capacity" | "served" | "availability" | "cost";

interface CheckBase {
  id: string;
  kind: "functional" | "non-functional";
  label: string;
}

export type CheckDef =
  /** A functional check: a request can travel client -> ... -> the next role, in order. */
  | (CheckBase & {
      type: "path";
      chain: Role[];
      target: string;
      /** A design with no component of this role passes without the chain: the work is done inline instead. */
      inlineIfNo?: Role;
    })
  /** A measured check: one number from one scenario against a limit. */
  | (CheckBase & { type: "metric"; scenario: string; metric: CheckMetric; op: "<=" | ">="; value: number })
  /** Work queued while its consumer is down must be fully counted once it is back. */
  | (CheckBase & {
      type: "drain";
      outageSeconds: number;
      maxDrainSeconds: number;
      /** What waits in the queue, plural: "clicks" (the default), "posts", "messages". */
      items?: string;
      /** What happens to each item once a worker takes it: "counted" (the default), "delivered", "saved". */
      done?: string;
    });

export interface ChallengeDef {
  /** Requests a second at the busiest moment; every scenario runs at this load. */
  peakLoad: number;
  /**
   * With no queue on the board, each request writes its click to the database before it
   * answers, so counting works but costs a database write per request.
   */
  inlineClicks?: boolean;
  /**
   * The share of requests that send work to parts of a role, for side jobs only some
   * requests need: { queue: 0.1 } means 1 request in 10 leaves a job in the queue.
   * Each share is above 0 and at most 1; a role with no share gets the whole stream.
   */
  shares?: Partial<Record<Role, number>>;
  scenarios: ChallengeScenario[];
  checks: CheckDef[];
}

// ---- solution: a reference design a learner can open and compare with ----------

/** Why one part is in the reference design. */
export interface SolutionPart {
  /** Plain words: what this part does in the design. */
  why: string;
  /** Ids of the checks this part helps pass. */
  checks: string[];
  /** What goes wrong without it, with numbers from the model. */
  without: string;
}

export interface SolutionDef {
  /** The reference design. It must pass every check of the lab. */
  board: Board;
  /** One or two plain sentences: the idea behind the design. */
  summary: string;
  /** Keyed by node id in `board`. */
  parts: Record<string, SolutionPart>;
}

export interface LabBase {
  slug: string;
  family: LabFamily;
  title: string;
  purpose: string;
  limits: string;
  hints: string[];
  referenceSlug?: string;
}

export interface HldLabSpec extends LabBase {
  family: "hld";
  allowedComponents: ComponentKind[];
  startingBoard?: Board;
  scenario: string;
  levels: LabLevel[];
  /** A visual challenge: functional and non-functional checks and the scenarios that test them. */
  challenge?: ChallengeDef;
  /** A reference design the learner can open after pressing Run, and compare with their own. */
  solution?: SolutionDef;
}
