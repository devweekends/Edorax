// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The tiered-architecture model: the engine behind the lab board. Pure and
// server-importable (no DOM, no React), so a graded lab can run it on the server.
//
// From a board and an offered load it routes requests down the links, evaluates
// every component by its role and configuration (instance fleets, autoscaling,
// zones, read replicas, managed services billed per request, Lambda concurrency,
// rate limits, queues), and returns utilisation, the capacity ceiling, p50/p99
// latency with the queueing knee, availability and cost, scored against targets.
//
// Numbers are illustrative. The rules below are stated so a "how this is
// calculated" panel can show them.

import type { Board, BoardNode } from "./hld-types";
import type { ComponentKind, Role, SizeTier } from "./catalog";
import { COMPONENT_CATALOG, SIZE_CATALOG, roleOf } from "./catalog";

const PER_VCPU: Record<SizeTier["family"], number> = { general: 800, compute: 1200, memory: 600 };
/** Roles that serve far more, or far less, per vCPU than a typical app server. */
const ROLE_RATE: Partial<Record<Role, number>> = { cache: 15_000, search: 300, nosql: 2_000 };
const NETWORK_MS = 10;
/** Chance a single Availability Zone is up. */
const AZ_AVAIL = 0.9995;
/** Regional managed services are spread across zones by the provider. */
const MANAGED_AVAIL = 0.9999;

const SERVICE_MS: Record<Role, number> = {
  client: 0, dns: 1, cdn: 2, firewall: 1, limiter: 1, balancer: 2, gateway: 5,
  compute: 20, function: 0, worker: 15, cache: 1, database: 8, nosql: 5, search: 25,
  queue: 5, stream: 10, storage: 20,
};
const SINGLE_AVAIL: Partial<Record<Role, number>> = {
  balancer: 0.9995, gateway: 0.9995, compute: 0.99, worker: 0.99, cache: 0.999,
  database: 0.999, nosql: 0.9995, search: 0.999, stream: 0.999,
};

export interface TierLoad {
  id: string;
  kind: ComponentKind;
  capacity: number;
  utilisation: number;
  down: boolean;
  reachable: boolean;
  /** Instances actually running, after autoscaling. */
  units: number;
  /** Managed services scale for you; their utilisation is rarely the story. */
  managed: boolean;
  /** A short line for the card: autoscaled, throttling, backlog, and so on. */
  note?: string;
  /** What this component costs per hour whether or not it is serving. */
  cost: number;
  /** Milliseconds a request spends waiting in line here, on top of its service time. Zero off the request path. */
  waitMs: number;
  /** For a cache: what it was asked, what it answered itself, and what went on to the database. */
  cacheStats?: { hitRate: number; reads: number; hits: number; misses: number };
}

/** One labelled share of the traffic on a link, such as "cache misses" or "click writes". */
export interface EdgePart {
  label: string;
  rate: number;
}

/** Optional rules a lab can switch on for the whole run. */
export interface ModelOptions {
  /**
   * Every request an app server serves also writes one row (a click) to the database
   * before it answers. Labs turn this on when the board has no queue to carry the clicks.
   */
  inlineWrites?: boolean;
  /**
   * The share of requests that send work to parts of a role, for side jobs that only
   * some requests need: { queue: 0.1 } means 1 request in 10 leaves a job in the queue.
   * Applied wherever a part of another role sends to that role, so it holds however the
   * learner links the board. A role with no share gets the whole stream.
   */
  shares?: Partial<Record<Role, number>>;
}

export interface Targets {
  rps?: number;
  p99Ms?: number;
  availability?: number;
  budgetPerHour?: number;
}

export interface ModelResult {
  capacityCeiling: number;
  p50Ms: number;
  p99Ms: number;
  availability: number;
  costPerHour: number;
  tiers: TierLoad[];
  pass: { rps: boolean; p99: boolean; availability: boolean; budget: boolean };
  allPass: boolean;
  /** Why the design is broken, when a component is down or unlinked. */
  failure?: string;
  /** Request rate on each live link, keyed "from>to". */
  edgeFlows: Record<string, number>;
  /** What the traffic on a link is made of, where that is worth saying (cache reads, misses, writes). */
  edgeParts: Record<string, EdgePart[]>;
  /** Requests rejected by rate limits and throttles, per second. */
  dropped: number;
  /** Requests filtered out by firewalls, per second. */
  blocked: number;
  /** How fast queued work piles up because consumers are too slow, per second. */
  backlog: number;
  /** The role on the request path with the lowest availability, for "add redundancy here". */
  weakest?: { role: Role; availability: number };
}

// ---- reading a node's configuration -------------------------------------------

function propOf(node: BoardNode, key: string): number | string | undefined {
  const own = node.props?.[key];
  if (own !== undefined) return own;
  return COMPONENT_CATALOG[node.kind].properties.find((p) => p.id === key)?.default;
}
function num(node: BoardNode, key: string, fallback: number): number {
  const v = propOf(node, key);
  return typeof v === "number" ? v : fallback;
}
function str(node: BoardNode, key: string, fallback: string): string {
  const v = propOf(node, key);
  return typeof v === "string" ? v : fallback;
}
function tierOf(node: BoardNode): SizeTier {
  const id = propOf(node, "size");
  return SIZE_CATALOG.find((t) => t.id === id) ?? SIZE_CATALOG[0];
}
const isDown = (node: BoardNode) => Boolean(node.props?.down);
const rate = (n: number) => Math.round(n).toLocaleString("en-US");

/** A fleet of `units` spread over `zones`; it is up while any zone has a live instance. */
function fleetAvailability(single: number, units: number, zones: number): number {
  const n = Math.max(1, Math.round(zones));
  const perZone = Math.max(1, units / n);
  const zone = AZ_AVAIL * (1 - Math.pow(1 - single, perZone));
  return 1 - Math.pow(1 - zone, n);
}

// ---- routing --------------------------------------------------------------------

/** Nodes a request can reach from any live client, following the links and skipping down nodes. */
function reachableFrom(board: Board): Set<string> {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const next = new Map<string, string[]>();
  for (const e of board.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const queue = board.nodes.filter((n) => n.kind === "client" && !isDown(n)).map((n) => n.id);
  for (const id of queue) seen.add(id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const to of next.get(id) ?? []) {
      const node = byId.get(to);
      if (node && !isDown(node) && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return seen;
}

/** Live links between reachable nodes, deduplicated, as parent to children and child to parents. */
function liveLinks(board: Board, reachable: Set<string>) {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const e of board.edges) {
    if (!reachable.has(e.from) || !reachable.has(e.to) || e.from === e.to) continue;
    const kids = children.get(e.from) ?? [];
    if (kids.includes(e.to)) continue;
    children.set(e.from, [...kids, e.to]);
    parents.set(e.to, [...(parents.get(e.to) ?? []), e.from]);
  }
  return { children, parents };
}

/** Reachable nodes in topological order (Kahn), so load and latency flow parent before child. */
function topoOrder(reachable: Set<string>, children: Map<string, string[]>, parents: Map<string, string[]>): string[] {
  const indegree = new Map([...reachable].map((id) => [id, (parents.get(id) ?? []).length]));
  const queue = [...reachable].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const kid of children.get(id) ?? []) {
      indegree.set(kid, (indegree.get(kid) ?? 1) - 1);
      if (indegree.get(kid) === 0) queue.push(kid);
    }
  }
  return order;
}

const ASYNC_ROLES = new Set<Role>(["queue", "stream"]);

/** Nodes on the synchronous request path: reachable without passing through a queue or stream. */
function synchronous(order: string[], byId: Map<string, BoardNode>, children: Map<string, string[]>): Set<string> {
  const seen = new Set(order.filter((id) => byId.get(id)!.kind === "client"));
  const queue = [...seen];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (ASYNC_ROLES.has(roleOf(byId.get(id)!.kind))) continue;
    for (const kid of children.get(id) ?? []) {
      if (!seen.has(kid)) {
        seen.add(kid);
        queue.push(kid);
      }
    }
  }
  return seen;
}

/** The most a node lets through per second; above it, requests are rejected. */
function limitOf(node: BoardNode): number | undefined {
  if (node.kind === "rate-limiter" || node.kind === "aws-api-gateway") return num(node, "limit", Infinity);
  if (node.kind === "aws-lambda") return lambdaCapacity(node);
  return undefined;
}
/** Share of what a node serves that continues downstream (CDN misses, traffic a firewall lets in). */
function passOn(node: BoardNode): number {
  const role = roleOf(node.kind);
  if (role === "cdn") return 1 - num(node, "hitRate", 0);
  if (role === "firewall") return 1 - num(node, "blockRate", 0);
  // A cache answers its hits itself; only the misses go on to a database linked behind it.
  if (role === "cache") return 1 - num(node, "hitRate", 0);
  return 1;
}
function lambdaCapacity(node: BoardNode): number {
  return (num(node, "concurrency", 1000) * 1000) / Math.max(1, num(node, "durationMs", 120));
}

// ---- evaluating one component ----------------------------------------------------

interface Evaluation {
  capacity: number;
  units: number;
  cost: number;
  serviceMs: number;
  availability: number;
  /** Whether requests wait in line as it gets busy (the p99 knee), or are throttled instead. */
  queueing: boolean;
  managed: boolean;
  note?: string;
}

function evaluate(node: BoardNode, flow: number, inlineWrites = 0): Evaluation {
  const def = COMPONENT_CATALOG[node.kind];
  const role = def.role;

  if (node.kind === "aws-lambda") {
    const duration = Math.max(1, num(node, "durationMs", 120));
    const memoryGb = Number(str(node, "memoryMb", "512")) / 1024;
    const capacity = lambdaCapacity(node);
    const cost = flow * 3600 * (0.2 / 1e6 + (duration / 1000) * memoryGb * 0.0000166667);
    const note = flow > capacity ? `throttling ${rate(flow - capacity)}/s` : flow > 0 ? `~${rate(Math.ceil((flow * duration) / 1000))} running at once` : undefined;
    return { capacity, units: 1, cost, serviceMs: duration, availability: MANAGED_AVAIL, queueing: false, managed: true, note };
  }

  if (node.kind === "aws-dynamodb") {
    const reads = num(node, "readRatio", 0.8);
    if (str(node, "capacityMode", "on-demand") === "provisioned") {
      const rcu = num(node, "rcu", 1000);
      const wcu = num(node, "wcu", 500);
      const util = Math.max((flow * reads) / (rcu * 2), (flow * (1 - reads)) / wcu);
      return {
        capacity: util > 0 ? flow / util : rcu * 2 + wcu, units: 1, cost: rcu * 0.00013 + wcu * 0.00065,
        serviceMs: 5, availability: MANAGED_AVAIL, queueing: false, managed: true,
        note: util > 1 ? "throttled: raise RCU/WCU or go on-demand" : undefined,
      };
    }
    return {
      capacity: 40_000, units: 1, cost: (flow * 3600 * (reads * 0.25 + (1 - reads) * 1.25)) / 1e6,
      serviceMs: 5, availability: MANAGED_AVAIL, queueing: false, managed: true,
    };
  }

  if (role === "stream") {
    const shards = num(node, "partitions", 2);
    const aws = def.family === "aws";
    return {
      capacity: shards * 1000, units: shards, cost: shards * 0.015 + (aws ? (flow * 3600 * 0.014) / 1e6 : 0),
      serviceMs: SERVICE_MS.stream, availability: aws ? MANAGED_AVAIL : fleetAvailability(0.999, shards, 1),
      queueing: false, managed: aws, note: flow > shards * 1000 ? "producers throttled: add shards" : undefined,
    };
  }

  if (def.managed) {
    let capacity = def.managed.capacity;
    let perMillion = def.managed.pricePerMillion;
    if (node.kind === "aws-api-gateway" && str(node, "apiType", "HTTP") === "REST") perMillion = 3.5;
    if (node.kind === "aws-sqs" && str(node, "queueType", "standard") === "FIFO") capacity = 3000;
    const hourly = node.kind === "k8s-service" && str(node, "serviceType", "ClusterIP") === "LoadBalancer" ? 0.0225 : def.managed.pricePerHour;
    const limit = limitOf(node);
    if (limit != null) capacity = Math.min(capacity, limit);
    const hasZones = def.properties.some((p) => p.id === "azs");
    const availability = hasZones ? fleetAvailability(0.99999, 1, num(node, "azs", 2)) : MANAGED_AVAIL;
    const note = limit != null && flow > limit ? `rejecting ${rate(flow - limit)}/s` : undefined;
    return {
      capacity, units: 1, cost: hourly + (flow * 3600 * perMillion) / 1e6,
      serviceMs: SERVICE_MS[role] + (node.kind === "aws-api-gateway" ? 5 : 0),
      availability, queueing: false, managed: true, note,
    };
  }

  // Instance-based: a fleet of servers of one size.
  const tier = tierOf(node);
  const perUnit = tier.vcpu * (ROLE_RATE[role] ?? PER_VCPU[tier.family]);
  const single = SINGLE_AVAIL[role] ?? 0.99;

  if (role === "database") {
    const replicas = num(node, "replicas", 0);
    const reads = num(node, "readRatio", 0.8);
    const multiAz = num(node, "multiAz", 0) > 0;
    // Every write goes to the primary; reads spread over the primary and its replicas.
    // Inline writes are all writes: they are part of the flow but never reads.
    const other = Math.max(0, flow - inlineWrites);
    const util = Math.max(other * (1 - reads) + inlineWrites, (other * reads) / (1 + replicas)) / perUnit;
    const parts = [replicas > 0 ? `${replicas} read replica${replicas === 1 ? "" : "s"}` : null, multiAz ? "Multi-AZ" : null].filter(Boolean);
    return {
      capacity: util > 0 ? flow / util : perUnit * (1 + replicas), units: 1 + replicas,
      cost: tier.pricePerHour * ((multiAz ? 2 : 1) + replicas), serviceMs: SERVICE_MS.database,
      availability: fleetAvailability(single, 1, multiAz ? 2 : 1), queueing: true, managed: false,
      note: parts.length > 0 ? parts.join(", ") : undefined,
    };
  }

  let units = node.kind === "load-balancer" ? num(node, "zones", 1) : num(node, "count", 1);
  let note: string | undefined;
  if (num(node, "autoscale", 0) > 0) {
    const min = Math.max(1, num(node, "minCount", 1));
    const max = Math.max(min, num(node, "maxCount", 10));
    const target = Math.min(1, Math.max(0.05, num(node, "targetUtil", 0.6)));
    units = Math.min(max, Math.max(min, Math.ceil(flow / (perUnit * target) - 1e-9)));
    note = units === max && flow / (perUnit * units) > target ? `at max ${max}: raise the max or the size` : `autoscaled to ${units} (${min} to ${max})`;
  }

  let cost = tier.pricePerHour * units;
  let availabilityUnits = units;
  if (node.kind === "aws-elasticache") {
    const replicasPerShard = num(node, "replicasPerShard", 1);
    cost = tier.pricePerHour * units * (1 + replicasPerShard);
    availabilityUnits = 1 + replicasPerShard;
  }
  const zones = node.kind === "load-balancer" ? units : num(node, "azs", 1);
  return {
    capacity: perUnit * units, units, cost, serviceMs: SERVICE_MS[role],
    availability: fleetAvailability(single, availabilityUnits, zones), queueing: true, managed: false, note,
  };
}

// ---- the model -------------------------------------------------------------------

export function runTieredModel(board: Board, load: number, targets: Targets, options: ModelOptions = {}): ModelResult {
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const reachable = reachableFrom(board);
  const { children, parents } = liveLinks(board, reachable);
  const order = topoOrder(reachable, children, parents);
  const sync = synchronous(order, byId, children);

  // Load enters at the live clients and flows down the links. A node first applies
  // its limit (rejecting the excess), then passes on what continues (CDN misses,
  // traffic the firewall lets in). Parallel children with the same role share it;
  // different roles are different services and each see the whole stream; a
  // database or key-value store beside a cache only sees the cache misses.
  const incoming = new Map<string, number>();
  const inlineWrites = new Map<string, number>();
  const edgeFlows: Record<string, number> = {};
  const edgeParts: Record<string, EdgePart[]> = {};
  const addPart = (key: string, label: string, rate: number) => { (edgeParts[key] ??= []).push({ label, rate }); };
  let dropped = 0;
  let blocked = 0;
  const clients = order.filter((id) => byId.get(id)!.kind === "client");
  for (const id of clients) incoming.set(id, load / clients.length);
  for (const id of order) {
    const node = byId.get(id)!;
    const flowIn = incoming.get(id) ?? 0;
    const limit = limitOf(node);
    const served = limit != null ? Math.min(flowIn, limit) : flowIn;
    dropped += flowIn - served;
    const out = served * passOn(node);
    if (roleOf(node.kind) === "firewall") blocked += served - out;

    const kids = (children.get(id) ?? []).map((k) => byId.get(k)!);
    const cache = kids.find((n) => roleOf(n.kind) === "cache");
    const missRate = cache ? 1 - num(cache, "hitRate", 0) : 1;
    // Read-through: a store that the cache itself links to is loaded by the cache on a miss,
    // so the app server's own link to it carries no reads (it never counts twice).
    const behindCache = new Set(cache ? children.get(cache.id) ?? [] : []);
    const byRole = new Map<Role, string[]>();
    for (const kid of kids) {
      if (behindCache.has(kid.id)) continue;
      byRole.set(roleOf(kid.kind), [...(byRole.get(roleOf(kid.kind)) ?? []), kid.id]);
    }
    for (const [role, ids] of byRole) {
      const stores = role === "database" || role === "nosql";
      // A worker batches its writes: one trip to the store carries `batchSize` events.
      const batch = node.kind === "worker" && stores ? Math.max(1, num(node, "batchSize", 1)) : 1;
      // A side job only some requests need (an alert, an index update) carries its share of the stream.
      const part = role !== roleOf(node.kind) ? (options.shares?.[role] ?? 1) : 1;
      const share = (stores ? (out * missRate) / batch : out) * part;
      for (const k of ids) {
        const key = `${id}>${k}`;
        const rate = share / ids.length;
        incoming.set(k, (incoming.get(k) ?? 0) + rate);
        edgeFlows[key] = (edgeFlows[key] ?? 0) + rate;
        if (part < 1) addPart(key, `${Math.round(part * 1000) / 10}% of requests send work here`, rate);
        if (role === "cache") addPart(key, `reads, ${Math.round(num(byId.get(k)!, "hitRate", 0) * 100)}% answered by the cache`, rate);
        else if (stores && node.kind === "worker" && batch > 1) addPart(key, `writes, ${batch} per trip`, rate);
        else if (stores && cache) addPart(key, "cache misses", rate);
        else if (stores && roleOf(node.kind) === "cache") addPart(key, "cache misses", rate);
      }
    }
    if (options.inlineWrites && roleOf(node.kind) === "compute") {
      // The click write goes to the store whether the app server reaches it directly or through its cache.
      const direct = kids.filter((k) => roleOf(k.kind) === "database");
      const through = (cache ? children.get(cache.id) ?? [] : []).map((k) => byId.get(k)!).filter((k) => roleOf(k.kind) === "database");
      const stores = [...new Map([...direct, ...through].map((k) => [k.id, k])).values()];
      for (const store of stores) {
        const writes = out / stores.length;
        const key = direct.some((d) => d.id === store.id) ? `${id}>${store.id}` : `${cache!.id}>${store.id}`;
        incoming.set(store.id, (incoming.get(store.id) ?? 0) + writes);
        inlineWrites.set(store.id, (inlineWrites.get(store.id) ?? 0) + writes);
        edgeFlows[key] = (edgeFlows[key] ?? 0) + writes;
        addPart(key, direct.some((d) => d.id === store.id) ? "click writes" : "click writes, written directly", writes);
      }
    }
  }

  const evaluations = new Map<string, Evaluation>();
  const tiers: TierLoad[] = [];
  let cost = 0;
  for (const node of board.nodes) {
    if (node.kind === "client") continue;
    const down = isDown(node);
    const onPath = reachable.has(node.id);
    const flow = onPath ? incoming.get(node.id) ?? 0 : 0;
    const ev = evaluate(node, flow, inlineWrites.get(node.id) ?? 0);
    const capacity = down ? 0 : ev.capacity;
    evaluations.set(node.id, ev);
    cost += ev.cost; // placed hardware costs money whether or not it is serving
    tiers.push({
      id: node.id, kind: node.kind, capacity, utilisation: capacity > 0 ? flow / capacity : 0,
      down, reachable: onPath, units: ev.units, managed: ev.managed, note: ev.note, cost: ev.cost, waitMs: 0,
      cacheStats: roleOf(node.kind) === "cache" && onPath
        ? { hitRate: num(node, "hitRate", 0), reads: flow, hits: flow * num(node, "hitRate", 0), misses: flow * (1 - num(node, "hitRate", 0)) }
        : undefined,
    });
  }
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  // Work behind a queue is asynchronous: slow consumers build a backlog, not slow requests.
  let backlog = 0;
  for (const id of order) {
    const node = byId.get(id)!;
    if (!ASYNC_ROLES.has(roleOf(node.kind))) continue;
    const consumers = (children.get(id) ?? []).reduce((sum, k) => sum + (tierById.get(k)?.capacity ?? 0), 0);
    const behind = Math.max(0, (incoming.get(id) ?? 0) - consumers);
    backlog += behind;
    const tier = tierById.get(id);
    // A consumer that is down is still linked: say so, instead of "no consumers linked".
    const linkedButDown = board.edges.some((e) => e.from === id && isDown(byId.get(e.to)!));
    if (tier) tier.note = consumers === 0 ? (linkedButDown ? `consumers down, backlog grows ${rate(behind)}/s` : "no consumers linked") : behind > 0 ? `backlog grows ${rate(behind)}/s` : "consumers keeping up";
  }

  // Capacity, latency and availability of the synchronous request path.
  let ceiling = Number.POSITIVE_INFINITY;
  const roleAvail = new Map<Role, number[]>();
  const lat50 = new Map<string, number>();
  const lat99 = new Map<string, number>();
  for (const id of order) {
    if (!sync.has(id)) continue;
    const tier = tierById.get(id);
    const ev = evaluations.get(id);
    if (tier && ev) {
      const flow = incoming.get(id) ?? 0;
      if (flow > 0 && tier.capacity > 0) ceiling = Math.min(ceiling, (tier.capacity * load) / flow);
      const role = roleOf(tier.kind);
      roleAvail.set(role, [...(roleAvail.get(role) ?? []), ev.availability]);
    }
    const service = ev?.serviceMs ?? 0;
    const u = ev?.queueing && tier ? Math.min(tier.utilisation, 0.985) : 0;
    const before = (parents.get(id) ?? []).filter((p) => sync.has(p));
    lat50.set(id, service + Math.max(0, ...before.map((p) => lat50.get(p) ?? 0)));
    lat99.set(id, service / (1 - u) + Math.max(0, ...before.map((p) => lat99.get(p) ?? 0)));
    if (tier) tier.waitMs = service / (1 - u) - service;
  }
  const p50 = NETWORK_MS + Math.max(0, ...lat50.values());
  const p99 = NETWORK_MS + Math.max(0, ...lat99.values());

  // Parallel components with the same role back each other up; the roles are in series.
  let availability = 1;
  let weakest: ModelResult["weakest"];
  for (const [role, parts] of roleAvail) {
    const roleUp = 1 - parts.reduce((all, a) => all * (1 - a), 1);
    availability *= roleUp;
    if (!weakest || roleUp < weakest.availability) weakest = { role, availability: roleUp };
  }

  // A placed database that requests cannot reach means nothing is served.
  let failure: string | undefined;
  const stores = board.nodes.filter((n) => roleOf(n.kind) === "database" || roleOf(n.kind) === "nosql");
  if (stores.length > 0 && !stores.some((n) => reachable.has(n.id))) {
    ceiling = 0;
    availability = 0;
    const blocker = board.nodes.find((n) => isDown(n) && board.edges.some((e) => e.from === n.id || e.to === n.id));
    failure = blocker
      ? `${COMPONENT_CATALOG[blocker.kind].label} is down: requests through it fail.`
      : "The database is not linked into the request path.";
  }

  if (!Number.isFinite(ceiling)) ceiling = 0;

  const pass = {
    rps: targets.rps == null ? true : ceiling >= targets.rps,
    p99: targets.p99Ms == null ? true : p99 <= targets.p99Ms,
    availability: targets.availability == null ? true : availability >= targets.availability,
    budget: targets.budgetPerHour == null ? true : cost <= targets.budgetPerHour,
  };

  return {
    capacityCeiling: Math.round(ceiling),
    p50Ms: Math.round(p50),
    p99Ms: Math.round(p99),
    availability,
    failure,
    edgeFlows,
    edgeParts,
    dropped,
    blocked,
    backlog,
    weakest,
    costPerHour: cost,
    tiers,
    pass,
    allPass: pass.rps && pass.p99 && pass.availability && pass.budget,
  };
}
