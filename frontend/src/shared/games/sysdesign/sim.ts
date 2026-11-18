// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// A small, pure, deterministic traffic simulation. It uses only + - * / and min, max, ceil, round,
// so the browser and the server always agree to the last digit. No clock, no randomness.
import {
  STEPS,
  type CostLine,
  type DeepPartial,
  type GoalCheck,
  type Goals,
  type Model,
  type SimResult,
  type StepResult,
  type SysdesignRound,
} from "./types";

const APP_PRICING = { ondemand: 1, savings: 0.68, reserved: 0.6 } as const;
const DB_PRICING = { ondemand: 1, reserved: 0.62 } as const;
/** Illustrative unit prices, in dollars. They are round numbers, not real quotes. */
export const PRICES = { egressPerGb: 0.09, cdnPerGb: 0.04, natPerGb: 0.045, natPerMonth: 33 } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merge a patch onto a copy of a model. Only objects are merged, everything else is replaced. */
export function mergePatch<T>(base: T, patch: DeepPartial<T>): T {
  if (!isObject(base) || !isObject(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const next = (patch as Record<string, unknown>)[key];
    const prev = out[key];
    out[key] = isObject(prev) && isObject(next) ? mergePatch(prev, next as never) : next;
  }
  return out as T;
}

/** The model after the changes, applied in order. Ids that are not offered are ignored. */
export function applyChanges(round: SysdesignRound, ids: readonly string[]): Model {
  let model = round.model;
  for (const id of ids) {
    const change = round.changes.find((c) => c.id === id);
    if (change) model = mergePatch(model, change.patch);
  }
  return model;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Queueing delay: grows fast as a part gets busy. Capped so a saturated part reads as a timeout. */
const slow = (baseMs: number, util: number) => Math.min(4000, baseMs / (1 - clamp(util, 0, 0.97)));

type Point = { ms: number; weight: number };

/** A class of requests has a spread: most are near the typical time, a few are much slower. */
function spread(ms: number, weight: number, out: Point[]) {
  if (weight <= 0) return;
  out.push({ ms: ms * 0.8, weight: weight * 0.6 }, { ms: ms * 1.3, weight: weight * 0.3 }, { ms: ms * 2.6, weight: weight * 0.1 });
}

function weightedPercentile(points: Point[], q: number): number {
  const sorted = [...points].sort((a, b) => a.ms - b.ms);
  const total = sorted.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return 0;
  let seen = 0;
  for (const p of sorted) {
    seen += p.weight;
    if (seen >= total * q) return Math.min(4000, Math.round(p.ms));
  }
  return Math.min(4000, Math.round(sorted[sorted.length - 1]!.ms));
}

export function costLines(model: Model, appInstancesAvg: number): CostLine[] {
  const appF = APP_PRICING[model.app.pricing] ?? 1;
  const dbF = DB_PRICING[model.db.pricing] ?? 1;
  const lines: CostLine[] = [];
  const add = (id: string, label: string, usd: number) => {
    const rounded = Math.round(usd);
    if (rounded > 0) lines.push({ id, label, usd: rounded });
  };
  add("app", `${model.app.label} servers`, appInstancesAvg * model.app.monthlyEach * appF);
  add("db", `${model.db.label} database`, (model.db.monthly + (model.db.multiAz ? model.db.monthly : 0)) * dbF);
  add("replica", "Read replicas", model.db.replicas * model.db.replicaMonthly * dbF);
  if (model.cache.on) add("cache", "ElastiCache", model.cache.monthly);
  if (model.cdn.on) add("cdn", "CloudFront", model.cdn.monthly);
  if (model.queue.on) add("queue", "SQS queue", model.queue.monthly);
  if (model.batch.separate) add("workers", "Spot workers", model.batch.workersMonthly);
  const off = model.cdn.on ? model.cdn.offload : 0;
  add("egress", "Data transfer out", model.net.egressGb * ((1 - off) * PRICES.egressPerGb + off * PRICES.cdnPerGb));
  const natGb = model.net.natGb * (1 - (model.net.s3Endpoint ? model.net.s3Share : 0));
  add("nat", "NAT gateway", model.net.natGateways * PRICES.natPerMonth + natGb * PRICES.natPerGb);
  add("logs", "Log storage", model.logs.gb * ((1 - model.logs.coldShare) * model.logs.hotRate + model.logs.coldShare * model.logs.coldRate));
  return lines;
}

/** Run the day. The same inputs always give the same result. */
export function simulate(round: SysdesignRound, changeIds: readonly string[]): SimResult {
  const m = applyChanges(round, changeIds);
  const { mix, outage, batchJob } = round;
  const traffic = Array.from({ length: STEPS }, (_, i) => Math.max(0, round.traffic[i] ?? 0));

  const batchApp = (t: number) => (batchJob && t >= batchJob.from && t <= batchJob.to && !m.batch.separate ? batchJob.appLoad : 0);
  const appWorkFor = (t: number) => {
    const load = traffic[t]!;
    const st = load * mix.staticShare;
    const off = m.cdn.on ? m.cdn.offload : 0;
    return st * (1 - off) * 0.25 + (load - st) + batchApp(t);
  };

  const hit = m.cache.on ? m.cache.hit : 0;
  const dbCap = Math.max(1, m.db.capacity / Math.max(1, m.db.skew));
  const replicas = Math.max(0, Math.round(m.db.replicas));

  const steps: StepResult[] = [];
  const all: Point[] = [];
  const instances: number[] = [];
  let backlog = 0;
  let totalReq = 0;
  let totalOk = 0;
  let peakApp = 0;
  let peakDb = 0;
  let peakBacklog = 0;

  for (let t = 0; t < STEPS; t++) {
    const load = traffic[t]!;
    const zoneDown = !!outage && t >= outage.from && t <= outage.to;
    const outageStart = !!outage && t === outage.from;
    const prevWork = appWorkFor(Math.max(0, t - 1));

    const target = m.app.autoscale ? clamp(Math.ceil(prevWork / (m.app.rpsEach * (m.app.zones === 2 ? 0.4 : 0.6))), m.app.scaleMin, m.app.scaleMax) : m.app.count;
    instances.push(target);

    // How many servers are alive, and how much traffic still goes to the dead zone.
    let alive = target;
    let deadRoute = 0;
    if (zoneDown) {
      if (m.app.zones === 1) {
        alive = 0;
        deadRoute = 1;
      } else {
        alive = m.app.autoscale && !outageStart ? clamp(target, Math.ceil(m.app.scaleMin / 2), m.app.scaleMax) : Math.ceil(target / 2);
        deadRoute = m.app.healthChecks ? (outageStart ? 0.04 : 0) : 0.5;
      }
    }
    const reach = 1 - deadRoute;

    const st = load * mix.staticShare;
    const dyn = load - st;
    const reads = dyn * mix.readShare;
    const writes = dyn - reads;
    const off = m.cdn.on ? m.cdn.offload : 0;
    const stCdn = st * off;
    const stOrigin = st - stCdn;
    const hitReads = reads * hit;
    const missReads = reads - hitReads;

    const running = !!batchJob && t >= batchJob.from && t <= batchJob.to && !m.batch.separate;
    const appWork = (stOrigin * 0.25 + dyn + batchApp(t)) * reach;
    const cap = alive * m.app.rpsEach;
    const fa = appWork <= 0 ? 1 : alive === 0 ? 0 : Math.min(1, cap / appWork);
    const appUtil = alive === 0 ? 0 : cap > 0 ? appWork / cap : 0;

    // The database. A single-zone database is lost with the zone. A standby takes over quickly.
    const dbDown = zoneDown && !m.db.multiAz;
    const failover = zoneDown && m.db.multiAz && outageStart ? 0.97 : 1;
    const missIn = missReads * reach * fa;
    const writeIn = writes * reach * fa + (m.queue.on ? backlog : 0);
    const readsPrimary = missIn / (1 + replicas);
    const readsReplica = replicas > 0 ? missIn / (1 + replicas) : 0;
    const batchDb = running ? batchJob!.dbLoad : 0;
    const fixedLoad = readsPrimary * m.db.readCost + batchDb;
    let writesDone = writeIn;
    if (m.queue.on) {
      writesDone = dbDown ? 0 : Math.min(writeIn, Math.max(0, dbCap - fixedLoad));
      backlog = Math.max(0, writeIn - writesDone);
    } else {
      backlog = 0;
    }
    const primaryDemand = writesDone + fixedLoad;
    const pu = dbDown ? 0 : primaryDemand / dbCap;
    const ru = (readsReplica * m.db.readCost) / dbCap;
    const okPrimary = dbDown ? 0 : pu <= 1 ? 1 : 1 / pu;
    const okReplica = ru <= 1 ? 1 : 1 / ru;
    const okWrite = m.queue.on ? 1 : okPrimary;
    const okRead = (okPrimary + replicas * okReplica) / (1 + replicas);

    // Success per class of request.
    const successStOrigin = reach * fa;
    const successHit = reach * fa;
    const successMiss = reach * fa * okRead * failover;
    const successWrite = reach * fa * okWrite * failover;

    const appMs = alive === 0 ? 4000 : slow(m.app.baseMs, appUtil);
    const readUtil = (pu + replicas * ru) / (1 + replicas);
    const dbReadMs = slow(m.db.readMs, readUtil);
    const dbWriteMs = slow(m.db.writeMs, pu);
    const points: Point[] = [];
    spread(12, stCdn, points);
    spread(appMs * 0.6, stOrigin * successStOrigin, points);
    spread(appMs + 2, hitReads * successHit, points);
    spread(appMs + dbReadMs, missReads * successMiss, points);
    spread(appMs + (m.queue.on ? 6 : dbWriteMs), writes * successWrite, points);
    all.push(...points);

    const ok = stCdn + stOrigin * successStOrigin + hitReads * successHit + missReads * successMiss + writes * successWrite;
    const success = load > 0 ? Math.min(1, ok / load) : 1;
    totalReq += load;
    totalOk += ok;
    const p95Ms = weightedPercentile(points, 0.95);
    peakApp = Math.max(peakApp, appUtil);
    peakDb = Math.max(peakDb, pu, ru);
    peakBacklog = Math.max(peakBacklog, backlog);

    steps.push({
      t,
      load,
      appInstances: alive,
      appUtil,
      dbUtil: pu,
      replicaUtil: ru,
      success,
      appDrop: clamp(1 - reach * fa, 0, 1),
      dbDrop: clamp(1 - okRead * failover, 0, 1),
      p95Ms,
      status: success < 0.9 ? "down" : success < 0.995 || p95Ms > round.goals.maxP95Ms ? "slow" : "ok",
      zoneDown,
      batchRunning: running,
      backlog,
      costToDate: 0,
    });
  }

  const avgInstances = instances.reduce((a, b) => a + b, 0) / STEPS;
  const lines = costLines(m, avgInstances);
  const costUsd = lines.reduce((sum, l) => sum + l.usd, 0);
  const appLine = lines.find((l) => l.id === "app")?.usd ?? 0;
  const fixedPerStep = (costUsd - appLine) / STEPS;
  let acc = 0;
  steps.forEach((s, i) => {
    acc += (avgInstances > 0 ? (instances[i]! / (avgInstances * STEPS)) * appLine : 0) + fixedPerStep;
    s.costToDate = Math.round(acc);
  });
  if (steps.length > 0) steps[steps.length - 1]!.costToDate = costUsd;

  return {
    model: m,
    steps,
    p95Ms: weightedPercentile(all, 0.95),
    availability: totalReq > 0 ? Math.round((totalOk / totalReq) * 10000) / 100 : 100,
    costUsd,
    costLines: lines,
    peakAppUtil: peakApp,
    peakDbUtil: peakDb,
    peakBacklog,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Every goal with a yes or no. Used by verify and by the result panel. */
export function evaluateGoals(goals: Goals, sim: SimResult): GoalCheck[] {
  const checks: GoalCheck[] = [
    { id: "p95", label: "Latency (p95)", met: sim.p95Ms <= goals.maxP95Ms, actual: `${sim.p95Ms} ms`, target: `at most ${goals.maxP95Ms} ms` },
    { id: "availability", label: "Availability", met: sim.availability >= goals.minAvailability, actual: `${sim.availability}%`, target: `at least ${goals.minAvailability}%` },
    { id: "cost", label: "Monthly cost", met: sim.costUsd <= goals.maxCostUsd, actual: `$${sim.costUsd}`, target: `at most $${goals.maxCostUsd}` },
  ];
  if (goals.maxPeakAppUtil !== undefined) {
    checks.push({ id: "appUtil", label: "App servers peak load", met: sim.peakAppUtil <= goals.maxPeakAppUtil, actual: pct(sim.peakAppUtil), target: `at most ${pct(goals.maxPeakAppUtil)}` });
  }
  if (goals.maxPeakDbUtil !== undefined) {
    checks.push({ id: "dbUtil", label: "Database peak load", met: sim.peakDbUtil <= goals.maxPeakDbUtil, actual: pct(sim.peakDbUtil), target: `at most ${pct(goals.maxPeakDbUtil)}` });
  }
  return checks;
}

/** What one change alone does to the monthly bill, in dollars (negative saves money). */
export function costDelta(round: SysdesignRound, id: string): number {
  return simulate(round, [id]).costUsd - simulate(round, []).costUsd;
}
