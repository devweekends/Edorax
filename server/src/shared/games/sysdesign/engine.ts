// System Design Runner: each round is a production incident on a small AWS system, played on the
// platform's own lab board. The player changes the design and runs the lab's tests; this engine
// replays the submitted board through the same challenge (runChallenge), so the browser and the
// server always agree. A design passes only when every check of the lab passes.
import { COMPONENT_CATALOG, canConnect, isComponentKind, sizesFor, type ComponentKind } from "../../lab/engine/catalog.js";
import { runChallenge, runModel } from "../../lab/engine/challenge.js";
import type { Board, BoardEdge, BoardNode, HldLabSpec } from "../../lab/engine/hld-types.js";
import { pickDaily } from "../daily.js";
import type { GameEngine, Stars, VerifyResult } from "../types.js";
import { SYSDESIGN_POOL } from "./incidents.js";
import type { SysdesignRound, SysdesignSubmission } from "./types.js";

export type { SysdesignRound, SysdesignSubmission } from "./types.js";
export { SYSDESIGN_POOL } from "./incidents.js";

/** Hard limits on a submitted board, whatever the round allows. The biggest reference has 6 parts. */
export const MAX_NODES = 14;
export const MAX_EDGES = 30;
/** Most parts of one kind. A board has exactly one client. */
export const MAX_PER_KIND = 3;
/** In this game a cache or a CDN counts only up to this hit rate, so nobody wins by typing 100%. */
export const MAX_HIT_RATE = 0.9;
/** Settings that describe the traffic, not the design. They must keep the value the incident gives them. */
const WORKLOAD_PROPS = ["readRatio", "load", "blockRate", "ttl"] as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((k) => allowed.includes(k));
const ID = /^[A-Za-z0-9_-]{1,32}$/;
const HANDLES = ["t", "r", "b", "l"];
const COORD = 100_000;

/** Every part any incident allows. A board with another kind is not read at all. */
const KINDS_IN_GAME: ReadonlySet<string> = new Set(SYSDESIGN_POOL.flatMap((r) => r.spec.allowedComponents));

function parseProps(kind: ComponentKind, raw: unknown): Record<string, number | string> | null {
  if (raw !== undefined && !isObject(raw)) return null;
  const given = raw ?? {};
  const props: Record<string, number | string> = {};
  const defs = COMPONENT_CATALOG[kind].properties;
  if (!onlyKeys(given, defs.map((d) => d.id))) return null;
  for (const def of defs) {
    const value = given[def.id] ?? def.default;
    if (def.type === "size") {
      if (typeof value !== "string" || !sizesFor(def.sizeSet!).some((t) => t.id === value)) return null;
    } else if (def.type === "enum") {
      if (typeof value !== "string" || !(def.options ?? []).includes(value)) return null;
    } else if (def.type === "toggle") {
      if (value !== 0 && value !== 1) return null;
    } else {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      if (value < (def.min ?? -Infinity) || value > (def.max ?? Infinity)) return null;
      if (def.type === "count" && !Number.isInteger(value)) return null;
    }
    props[def.id] = value;
  }
  return props;
}

function parseBoard(raw: unknown): Board | null {
  if (!isObject(raw) || !onlyKeys(raw, ["nodes", "edges"])) return null;
  const { nodes: rawNodes, edges: rawEdges } = raw;
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) return null;
  if (rawNodes.length === 0 || rawNodes.length > MAX_NODES || rawEdges.length > MAX_EDGES) return null;

  const nodes: BoardNode[] = [];
  const byId = new Map<string, BoardNode>();
  for (const entry of rawNodes) {
    if (!isObject(entry) || !onlyKeys(entry, ["id", "kind", "x", "y", "props"])) return null;
    const { id, kind, x = 0, y = 0 } = entry;
    if (typeof id !== "string" || !ID.test(id) || byId.has(id)) return null;
    if (typeof kind !== "string" || !isComponentKind(kind) || !KINDS_IN_GAME.has(kind)) return null;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > COORD || Math.abs(y) > COORD) return null;
    const props = parseProps(kind, entry.props);
    if (props === null) return null;
    const node: BoardNode = { id, kind, x, y, props };
    nodes.push(node);
    byId.set(id, node);
  }

  const edges: BoardEdge[] = [];
  const seen = new Set<string>();
  for (const entry of rawEdges) {
    if (!isObject(entry) || !onlyKeys(entry, ["from", "to", "via"])) return null;
    const { from, to, via } = entry;
    if (typeof from !== "string" || typeof to !== "string" || from === to) return null;
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b || !canConnect(a.kind, b.kind)) return null;
    if (via !== undefined && !(Array.isArray(via) && via.length === 2 && via.every((h) => typeof h === "string" && HANDLES.includes(h)))) return null;
    const key = `${from}>${to}`;
    if (seen.has(key)) return null;
    seen.add(key);
    edges.push({ from, to });
  }
  return { nodes, edges };
}

const fail = (message: string): VerifyResult => ({ passed: false, stars: 0, score: 0, message });
const usd = (n: number) => `$${n.toFixed(2)}`;

/** The value a workload setting must keep: the one the incident's starting board gives that kind, else the default. */
function workloadValue(spec: HldLabSpec, kind: ComponentKind, key: string): number | string | undefined {
  const start = spec.startingBoard?.nodes.find((n) => n.kind === kind);
  return start?.props?.[key] ?? COMPONENT_CATALOG[kind].properties.find((p) => p.id === key)?.default;
}

/**
 * The rules about what a board may contain for this incident, in one plain sentence when broken.
 * The lab itself lets you type any number; the game does not accept a design that cheats.
 */
export function boardProblem(spec: HldLabSpec, board: Board): string | null {
  const counts = new Map<ComponentKind, number>();
  for (const node of board.nodes) {
    if (!spec.allowedComponents.includes(node.kind)) return `${COMPONENT_CATALOG[node.kind].label} is not one of the parts you can use in this round.`;
    counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  }
  if ((counts.get("client") ?? 0) !== 1) return "The design needs exactly one client.";
  for (const [kind, n] of counts) {
    if (n > MAX_PER_KIND && kind !== "client") return `A design can have at most ${MAX_PER_KIND} ${COMPONENT_CATALOG[kind].label} parts.`;
  }
  for (const node of board.nodes) {
    const role = COMPONENT_CATALOG[node.kind].role;
    const hit = node.props?.hitRate;
    if ((role === "cache" || role === "cdn") && typeof hit === "number" && hit > MAX_HIT_RATE) {
      return `A hit rate above ${Math.round(MAX_HIT_RATE * 100)}% is not realistic. Set the ${COMPONENT_CATALOG[node.kind].label} hit rate to ${Math.round(MAX_HIT_RATE * 100)}% or less.`;
    }
    for (const key of WORKLOAD_PROPS) {
      const value = node.props?.[key];
      if (value !== undefined && value !== workloadValue(spec, node.kind, key)) {
        const label = COMPONENT_CATALOG[node.kind].properties.find((p) => p.id === key)?.label ?? key;
        return `"${label}" describes the traffic, not the design. Keep it at ${String(workloadValue(spec, node.kind, key))}.`;
      }
    }
  }
  return null;
}

const partsOf = (board: Board) => board.nodes.filter((n) => n.kind !== "client").length;

export const sysdesignEngine: GameEngine<SysdesignRound, SysdesignSubmission> = {
  id: "sysdesign",
  title: "System Design Runner",
  tagline: "A real AWS system is breaking. Fix the design on the lab board until every check passes.",
  roundsFor: (dayKey) => pickDaily(SYSDESIGN_POOL, dayKey, "sysdesign"),

  parseSubmission(input) {
    if (!isObject(input) || !onlyKeys(input, ["board"])) return null;
    const board = parseBoard(input.board);
    return board === null ? null : { board };
  },

  verify(round, submission) {
    try {
      const spec = round.spec;
      const challenge = spec.challenge;
      const solution = spec.solution;
      if (!challenge || !solution) return fail("This round is not set up correctly.");
      const parsed = sysdesignEngine.parseSubmission(submission);
      if (parsed === null) return fail("That design could not be read. Build it on the board and press Run tests.");
      const board = parsed.board;
      const problem = boardProblem(spec, board);
      if (problem) return fail(problem);

      const report = runChallenge(spec, board, challenge.peakLoad);
      const first = report.checks.find((c) => !c.pass);
      if (first) {
        return fail(`Not yet: "${first.label}" fails. Found: ${first.measured}. Needed: ${first.target}.`);
      }

      const spend = runModel(spec, board, challenge.peakLoad).costPerHour;
      const reference = runModel(spec, solution.board, challenge.peakLoad).costPerHour;
      const refParts = partsOf(solution.board);
      const lean = spend <= reference * 1.1 && partsOf(board) <= refParts + 1;
      const near = spend <= reference * 1.4;
      const stars: Stars = lean ? 3 : near ? 2 : 1;
      const message =
        stars === 3
          ? `All ${report.total} checks pass at ${usd(spend)} an hour with ${partsOf(board)} parts, within 10% of the reference cost.`
          : stars === 2
            ? `All ${report.total} checks pass at ${usd(spend)} an hour. For 3 stars, get the cost to ${usd(reference * 1.1)} or less with at most ${refParts + 1} parts.`
            : `All ${report.total} checks pass at ${usd(spend)} an hour. For 2 stars, get the cost to ${usd(reference * 1.4)} or less.`;
      return { passed: true, stars, score: Math.round(spend * 100) / 100, message };
    } catch {
      return fail("That design could not be checked. Try again.");
    }
  },
};
