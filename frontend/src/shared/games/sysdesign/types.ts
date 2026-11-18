// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Shared types for the System Design Runner. Everything here is plain data (no functions), because
// a round travels from the server to the browser as JSON.
import type { RoundBase } from "../types";

/** Number of traffic steps in one simulated day. One step is one hour. */
export const STEPS = 24;

export type Pricing = "ondemand" | "savings" | "reserved";

/** The system as the player sees it. A change patches some of these numbers. */
export type Model = {
  app: {
    /** For example "m5.2xlarge". */
    label: string;
    count: number;
    /** Requests per second one server can handle. */
    rpsEach: number;
    /** Illustrative on-demand dollars per server per month. */
    monthlyEach: number;
    /** Time to answer when the server is idle, in ms. */
    baseMs: number;
    /** 1 means one Availability Zone, 2 means two. */
    zones: 1 | 2;
    healthChecks: boolean;
    autoscale: boolean;
    /** Autoscaling keeps at least this many servers and at most scaleMax. */
    scaleMin: number;
    scaleMax: number;
    pricing: Pricing;
  };
  db: {
    kind: "rds" | "dynamodb";
    label: string;
    /** Work units per second the primary can do. */
    capacity: number;
    monthly: number;
    replicas: number;
    replicaMonthly: number;
    /** A standby in a second zone. Costs about the same as the primary again. */
    multiAz: boolean;
    pricing: "ondemand" | "reserved";
    /** Time for a read and for a write when idle, in ms. */
    readMs: number;
    writeMs: number;
    /** Work units one read uses (a missing index makes this big). */
    readCost: number;
    /** 1 is an even spread. 4 means one hot key gets 4 times its fair share of work. */
    skew: number;
  };
  cache: { on: boolean; /** Share of reads answered by the cache, 0 to 1. */ hit: number; monthly: number };
  cdn: { on: boolean; /** Share of static files served at the edge, 0 to 1. */ offload: number; monthly: number };
  queue: { on: boolean; monthly: number };
  /** Where the nightly batch job runs. Separate means spot workers away from the web tier. */
  batch: { separate: boolean; workersMonthly: number };
  net: {
    /** GB per month leaving to the internet from the origin. */
    egressGb: number;
    /** GB per month through the NAT gateway. */
    natGb: number;
    /** Share of NAT traffic that is really S3 or DynamoDB traffic, 0 to 1. */
    s3Share: number;
    /** A gateway VPC endpoint for S3 is in place. */
    s3Endpoint: boolean;
    natGateways: number;
  };
  logs: { gb: number; hotRate: number; coldRate: number; /** Share kept in cold storage, 0 to 1. */ coldShare: number };
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** A change the player can apply. It is data: a patch merged onto the model. */
export type ChangeDef = {
  id: string;
  label: string;
  /** Plain English: what it does and why it helps (or what it costs). */
  description: string;
  patch: DeepPartial<Model>;
};

export type Goals = {
  /** The p95 request latency over the whole day must be at or below this, in ms. */
  maxP95Ms: number;
  /** Share of requests that must succeed, in percent. */
  minAvailability: number;
  /** Monthly bill must be at or below this, in dollars. */
  maxCostUsd: number;
  /** Optional extras. */
  maxPeakAppUtil?: number;
  maxPeakDbUtil?: number;
};

export type Stretch = { maxCostUsd?: number; maxP95Ms?: number };

export type ComponentId = "users" | "cdn" | "lb" | "app" | "cache" | "queue" | "db" | "replica" | "workers" | "storage" | "nat";

export type SysdesignRound = RoundBase & {
  /** Alarm text shown in the incident banner. */
  incident: string;
  /** The system before the player changes anything. */
  model: Model;
  /** Requests per second at each of the 24 steps. */
  traffic: number[];
  /** Share of requests that are static files, and share of dynamic requests that are reads. */
  mix: { staticShare: number; readShare: number };
  /** An Availability Zone fails during these steps (inclusive), if set. */
  outage?: { from: number; to: number };
  /** A batch job adds this load on the web tier and the database during these steps. */
  batchJob?: { from: number; to: number; appLoad: number; dbLoad: number };
  goals: Goals;
  stretch: Stretch;
  changes: ChangeDef[];
  maxChanges: number;
  /** A change set that earns three stars. */
  solution: string[];
  /** A tempting change that does not help, or makes things worse. */
  trap?: string;
  trapNote?: string;
  /** Clues, from vague to clear. */
  hints: string[];
  /** The component to highlight as the problem. */
  focus: ComponentId;
};

export type SysdesignSubmission = { changes: string[] };

export type StepStatus = "ok" | "slow" | "down";

export type StepResult = {
  t: number;
  load: number;
  appInstances: number;
  /** Utilisation of each part, 0 upwards. Above 1 means it is overloaded. */
  appUtil: number;
  dbUtil: number;
  replicaUtil: number;
  /** Share of requests that succeeded this step, 0 to 1. */
  success: number;
  p95Ms: number;
  status: StepStatus;
  /** Share of requests lost before the app tier (dead zone or full servers), and share lost at the database, 0 to 1. */
  appDrop: number;
  dbDrop: number;
  zoneDown: boolean;
  batchRunning: boolean;
  /** Writes waiting in the queue after this step. */
  backlog: number;
  /** Bill so far, in dollars per month (grows to the monthly total by the last step). */
  costToDate: number;
};

export type CostLine = { id: string; label: string; usd: number };

export type SimResult = {
  model: Model;
  steps: StepResult[];
  p95Ms: number;
  /** Percent, 0 to 100. */
  availability: number;
  costUsd: number;
  costLines: CostLine[];
  peakAppUtil: number;
  peakDbUtil: number;
  peakBacklog: number;
};

export type GoalCheck = { id: string; label: string; met: boolean; actual: string; target: string };
