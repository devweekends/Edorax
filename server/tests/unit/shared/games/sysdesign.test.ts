import { describe, expect, it } from "vitest";
import { seededRandom } from "../../../../src/shared/games/daily.js";
import { MAX_EDGES, MAX_NODES, SYSDESIGN_POOL, sysdesignEngine, type SysdesignRound } from "../../../../src/shared/games/sysdesign/engine.js";
import { COMPONENT_CATALOG, canConnect } from "../../../../src/shared/lab/engine/catalog.js";
import { runChallenge } from "../../../../src/shared/lab/engine/challenge.js";
import type { Board } from "../../../../src/shared/lab/engine/hld-types.js";

const engine = sysdesignEngine;
const byId = (id: string) => SYSDESIGN_POOL.find((r) => r.id === id)!;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The reference board, edited. The lab sends every property of every part, so fill in the defaults. */
function design(round: SysdesignRound, edit: (board: Board) => void = () => undefined, from: "solution" | "start" = "solution"): { board: Board } {
  const board = clone(from === "solution" ? round.spec.solution!.board : round.spec.startingBoard!);
  edit(board);
  for (const node of board.nodes) {
    const props: Record<string, number | string> = {};
    for (const def of COMPONENT_CATALOG[node.kind].properties) props[def.id] = def.default;
    node.props = { ...props, ...(node.props ?? {}) };
  }
  return { board };
}
const node = (board: Board, id: string) => board.nodes.find((n) => n.id === id)!;

describe("sysdesign pool", () => {
  it("has six incidents, two for each difficulty, with unique ids, titles and slugs", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      expect(SYSDESIGN_POOL.filter((r) => r.difficulty === difficulty)).toHaveLength(2);
    }
    expect(SYSDESIGN_POOL).toHaveLength(6);
    expect(new Set(SYSDESIGN_POOL.map((r) => r.id)).size).toBe(6);
    expect(new Set(SYSDESIGN_POOL.map((r) => r.title)).size).toBe(6);
    expect(new Set(SYSDESIGN_POOL.map((r) => r.spec.slug)).size).toBe(6);
  });

  it("is plain data that survives JSON, in plain text with no long dashes", () => {
    for (const round of SYSDESIGN_POOL) {
      const copy = JSON.parse(JSON.stringify(round)) as SysdesignRound;
      expect(copy).toEqual(round);
      expect(JSON.stringify(round)).not.toMatch(/[\u2013\u2014]/);
      expect(engine.verify(copy, design(round)).stars).toBe(3);
    }
  });
});

describe.each(SYSDESIGN_POOL.map((r) => [r.id, r] as const))("incident %s", (_id, round) => {
  const spec = round.spec;
  const challenge = spec.challenge!;

  it("is a well formed AWS lab spec", () => {
    expect(spec.family).toBe("hld");
    expect(spec.limits.length).toBeGreaterThan(20);
    expect(spec.hints.length).toBeGreaterThanOrEqual(3);
    expect(spec.levels).toHaveLength(1);
    expect(spec.levels[0]!.load).toBe(challenge.peakLoad);
    expect(challenge.checks.some((c) => c.kind === "functional")).toBe(true);
    expect(challenge.checks.some((c) => c.kind === "non-functional")).toBe(true);
    expect(new Set(challenge.checks.map((c) => c.id)).size).toBe(challenge.checks.length);
    for (const kind of [...spec.startingBoard!.nodes, ...spec.solution!.board.nodes].map((n) => n.kind)) expect(spec.allowedComponents).toContain(kind);
    // Parts are real AWS parts, except the generic worker, which has no AWS twin.
    for (const kind of spec.allowedComponents) expect(["client", "worker"].includes(kind) || COMPONENT_CATALOG[kind].family === "aws").toBe(true);
    for (const board of [spec.startingBoard!, spec.solution!.board]) {
      const ids = new Set(board.nodes.map((n) => n.id));
      expect(ids.size).toBe(board.nodes.length);
      for (const e of board.edges) {
        expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
        expect(canConnect(board.nodes.find((n) => n.id === e.from)!.kind, board.nodes.find((n) => n.id === e.to)!.kind)).toBe(true);
      }
    }
  });

  it("tells the same numbers in its story as in its checks", () => {
    const budget = challenge.checks.find((c) => c.id === "cost" && c.type === "metric");
    expect(budget && budget.type === "metric" ? spec.scenario : "").toContain(`$${(budget as { value: number }).value.toFixed(2)} an hour`);
    expect(spec.scenario).toContain(`${challenge.peakLoad.toLocaleString("en-US")} requests a second`);
    expect(spec.levels[0]!.targets.budgetPerHour).toBe((budget as { value: number }).value);
  });

  it("explains every part of its reference solution, naming real checks", () => {
    const solution = spec.solution!;
    const checkIds = new Set(challenge.checks.map((c) => c.id));
    for (const n of solution.board.nodes) {
      if (n.kind === "client") continue;
      const part = solution.parts[n.id];
      expect(part, `part ${n.id}`).toBeTruthy();
      expect(part!.why.length).toBeGreaterThan(30);
      expect(part!.without.length).toBeGreaterThan(30);
      for (const c of part!.checks) expect(checkIds.has(c)).toBe(true);
    }
    for (const id of Object.keys(solution.parts)) expect(solution.board.nodes.some((n) => n.id === id)).toBe(true);
  });

  it("is really an incident: the starting board fails, and says what is wrong", () => {
    const start = design(round, () => undefined, "start");
    const report = runChallenge(spec, start.board, challenge.peakLoad);
    expect(report.allPass).toBe(false);
    expect(report.passed).toBeGreaterThanOrEqual(1);
    const result = engine.verify(round, start);
    expect(result.passed).toBe(false);
    expect(result.stars).toBe(0);
    expect(result.message).toMatch(/^Not yet: ".+" fails\. Found: .+\. Needed: .+\.$/);
  });

  it("is solved by its reference solution, which passes every check with three stars", () => {
    const report = runChallenge(spec, design(round).board, challenge.peakLoad);
    expect(report.checks.filter((c) => !c.pass)).toEqual([]);
    const result = engine.verify(round, design(round));
    expect(result.passed).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.message).toMatch(/^All \d+ checks pass at \$\d+\.\d\d an hour/);
  });

  it("does not solve it by doing nothing, or with an empty board", () => {
    expect(engine.verify(round, { board: { nodes: [], edges: [] } } as never).passed).toBe(false);
    expect(engine.verify(round, { board: { nodes: [{ id: "client", kind: "client", x: 0, y: 0, props: {} }], edges: [] } }).passed).toBe(false);
  });

  it("gives the same answer every time", () => {
    expect(engine.verify(round, design(round))).toEqual(engine.verify(round, design(round)));
  });
});

describe("the reasons are true", () => {
  it("easy A: two servers cannot lose one, and the bill needs both a smaller database and fewer servers", () => {
    const r = byId("sd-bill-tripled");
    expect(engine.verify(r, design(r, (b) => (node(b, "web").props!.count = 2))).message).toMatch(/one server dies/);
    expect(engine.verify(r, design(r, (b) => (node(b, "db").props!.multiAz = 0))).message).toMatch(/availability/i);
  });

  it("easy B: CloudFront fixes the speed but breaks the budget", () => {
    const r = byId("sd-launch-slow");
    const cdn = design(r, (b) => {
      b.nodes.push({ id: "cdn", kind: "aws-cloudfront", x: 0, y: 0 });
      b.edges = [{ from: "client", to: "cdn" }, { from: "cdn", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }];
      b.nodes = b.nodes.filter((n) => n.id !== "cache");
    });
    const result = engine.verify(r, cdn);
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/Cost per hour/);
  });

  it("medium A: a cache alone is not enough, the database needs read replicas for when it is flushed", () => {
    const r = byId("sd-flash-sale");
    const result = engine.verify(r, design(r, (b) => (node(b, "db").props!.replicas = 0)));
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/cache is flushed/i);
  });

  it("medium B: every layer needs two zones", () => {
    const r = byId("sd-lost-zone");
    for (const edit of [
      (b: Board) => (node(b, "web").props!.azs = 1),
      (b: Board) => (node(b, "cache").props = { ...node(b, "cache").props, azs: 1, replicasPerShard: 0 }),
      (b: Board) => (node(b, "db").props!.multiAz = 0),
    ]) {
      const result = engine.verify(r, design(r, edit));
      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/availability/i);
    }
  });

  it("hard A: the old oversized fleet blows the budget, and two replicas are not enough", () => {
    const r = byId("sd-peak-day");
    const fleet = engine.verify(r, design(r, (b) => Object.assign(node(b, "web").props!, { size: "c5.2xlarge", count: 6 })));
    expect(fleet.passed).toBe(false);
    expect(fleet.message).toMatch(/Cost per hour/);
    const replicas = engine.verify(r, design(r, (b) => (node(b, "db").props!.replicas = 2)));
    expect(replicas.passed).toBe(false);
    expect(replicas.message).toMatch(/zone is down/);
  });

  it("hard B: one worker cannot clear the pile in time, and no queue loses orders", () => {
    const r = byId("sd-orders-pile");
    const slowWorker = engine.verify(r, design(r, (b) => (node(b, "w").props!.count = 1)));
    expect(slowWorker.passed).toBe(false);
    expect(slowWorker.message).toMatch(/No order is lost/);
    const noQueue = engine.verify(r, design(r, (b) => {
      b.nodes = b.nodes.filter((n) => n.id !== "q" && n.id !== "w");
      b.edges = b.edges.filter((e) => ["client", "alb", "web", "db"].includes(e.from) && ["alb", "web", "db"].includes(e.to));
    }));
    expect(noQueue.passed).toBe(false);
    expect(noQueue.message).toMatch(/order is saved/i);
  });
});

describe("stars", () => {
  it("gives fewer stars to a design that costs more than the reference, and one star for a heavy one", () => {
    const bill = byId("sd-bill-tripled");
    const heavier = engine.verify(bill, design(bill, (b) => (node(b, "web").props!.size = "m5.xlarge")));
    expect(heavier.passed).toBe(true);
    expect(heavier.stars).toBe(2);
    expect(heavier.message).toMatch(/For 3 stars/);

    const launch = byId("sd-launch-slow");
    const heavy = engine.verify(launch, design(launch, (b) => (node(b, "db").props!.size = "db.r5.2xlarge")));
    expect(heavy.passed).toBe(true);
    expect(heavy.stars).toBe(1);
    expect(heavy.message).toMatch(/For 2 stars/);
  });

  it("gives three stars to a cheaper design that still passes, but not to one with extra parts", () => {
    const bill = byId("sd-bill-tripled");
    const cheaper = engine.verify(bill, design(bill, (b) => (node(b, "db").props!.size = "db.t3.medium")));
    expect(cheaper.stars).toBe(3);
    const bloated = engine.verify(bill, design(bill, (b) => {
      b.nodes.push({ id: "c1", kind: "aws-elasticache", x: 3, y: 3, props: { size: "cache.t3.small", replicasPerShard: 0 } });
      b.edges.push({ from: "web", to: "c1" });
      b.nodes.push({ id: "c2", kind: "aws-elasticache", x: 4, y: 3, props: { size: "cache.t3.small", replicasPerShard: 0 } });
      b.edges.push({ from: "web", to: "c2" });
    }));
    expect(bloated.passed).toBe(true);
    expect(bloated.stars).toBeLessThan(3);
  });
});

describe("a design that cheats is rejected", () => {
  const round = byId("sd-flash-sale");

  it("rejects typed-in miracle settings", () => {
    const hits = engine.verify(round, design(round, (b) => (node(b, "cache").props!.hitRate = 1)));
    expect(hits.passed).toBe(false);
    expect(hits.message).toMatch(/hit rate/i);
    const reads = engine.verify(round, design(round, (b) => {
      node(b, "db").props!.readRatio = 1;
      node(b, "db").props!.replicas = 0;
    }));
    expect(reads.passed).toBe(false);
    expect(reads.message).toMatch(/traffic/i);
  });

  it("rejects parts the round does not offer", () => {
    // CloudFront is a real part in other rounds, but not in this one.
    const cdn = engine.verify(round, design(round, (b) => {
      b.nodes.push({ id: "cdn", kind: "aws-cloudfront", x: 0, y: 0 });
      b.edges.push({ from: "client", to: "cdn" });
    }));
    expect(cdn.passed).toBe(false);
    expect(cdn.message).toMatch(/not one of the parts/);
    // DynamoDB and Lambda are not in any incident, so the board is not even read.
    for (const kind of ["aws-dynamodb", "aws-lambda", "k8s-deployment", "linux-nginx"]) {
      const result = engine.verify(round, design(round, (b) => b.nodes.push({ id: "x", kind: kind as never, x: 0, y: 0 })));
      expect(result.passed).toBe(false);
    }
  });

  it("rejects too many parts, too many links and too many of one kind", () => {
    const many = design(round, (b) => {
      for (let i = 0; i < MAX_NODES; i++) b.nodes.push({ id: `extra${i}`, kind: "aws-ec2-asg", x: 0, y: 0 });
    });
    expect(engine.parseSubmission(many)).toBeNull();
    expect(engine.verify(round, many).passed).toBe(false);
    const three = design(round, (b) => {
      for (let i = 0; i < 4; i++) {
        b.nodes.push({ id: `w${i}`, kind: "aws-ec2-asg", x: 0, y: 0, props: { size: "c5.large", count: 20 } });
        b.edges.push({ from: "alb", to: `w${i}` });
      }
    });
    expect(engine.verify(round, three).passed).toBe(false);
    const links = design(round, (b) => {
      for (let i = 0; i < MAX_EDGES + 1; i++) b.edges.push({ from: "client", to: "alb" });
    });
    expect(engine.parseSubmission(links)).toBeNull();
  });

  it("rejects a design with two clients, and a design with no client", () => {
    const two = design(round, (b) => b.nodes.push({ id: "client2", kind: "client", x: 0, y: 0 }));
    expect(engine.verify(round, two).passed).toBe(false);
    const none = design(round, (b) => {
      b.nodes = b.nodes.filter((n) => n.kind !== "client");
      b.edges = b.edges.filter((e) => e.from !== "client");
    });
    expect(engine.verify(round, none).passed).toBe(false);
  });

  it("does not let a huge fleet buy its way out: the budget check still fails", () => {
    const huge = engine.verify(round, design(round, (b) => Object.assign(node(b, "web").props!, { size: "c5.2xlarge", count: 200 })));
    expect(huge.passed).toBe(false);
    expect(huge.message).toMatch(/Cost per hour/);
  });
});

describe("parseSubmission", () => {
  const round = byId("sd-lost-zone");

  it("accepts every reference and starting board, and keeps the settings", () => {
    for (const r of SYSDESIGN_POOL) {
      for (const from of ["solution", "start"] as const) {
        const parsed = engine.parseSubmission(design(r, () => undefined, from));
        expect(parsed, `${r.id} ${from}`).not.toBeNull();
        expect(parsed!.board.nodes.length).toBe((from === "solution" ? r.spec.solution!.board : r.spec.startingBoard!).nodes.length);
      }
    }
  });

  it("fills in missing settings with the catalog defaults, drops link handles, and does not change the input", () => {
    const input = { board: { nodes: [{ id: "client", kind: "client" }, { id: "alb", kind: "aws-alb" }], edges: [{ from: "client", to: "alb", via: ["b", "t"] }] } };
    const before = JSON.stringify(input);
    const parsed = engine.parseSubmission(input)!;
    expect(parsed.board.nodes[1]!.props).toEqual({ azs: 2, crossZone: 1 });
    expect(parsed.board.edges).toEqual([{ from: "client", to: "alb" }]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("rejects junk", () => {
    const ok = design(round).board;
    const withNode = (patch: Record<string, unknown>) => ({ board: { ...clone(ok), nodes: [{ ...ok.nodes[1]!, ...patch }, ...ok.nodes.slice(2), ok.nodes[0]!] } });
    const junk: unknown[] = [
      null, undefined, 0, 1, "board", true, [], {}, { board: null }, { board: [] }, { board: {} }, { board: { nodes: [], edges: [] } },
      { board: { nodes: "x", edges: [] } }, { board: { nodes: [], edges: "x" } }, { ...design(round), extra: 1 }, { board: { ...ok, extra: 1 } },
      { board: { nodes: [{ id: "a", kind: "client" }], edges: [{ from: "a", to: "a" }] } },
      { board: { nodes: [{ id: "a", kind: "client" }], edges: [{ from: "a", to: "zzz" }] } },
      { board: { nodes: [{ id: "a", kind: "client" }, { id: "a", kind: "aws-alb" }], edges: [] } },
      { board: { nodes: [{ id: "a", kind: "client" }, { id: "b", kind: "aws-rds" }], edges: [{ from: "a", to: "b" }] } },
      { board: { nodes: [{ id: "a", kind: "client" }, { id: "b", kind: "aws-alb" }], edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }] } },
      withNode({ id: "" }), withNode({ id: "x".repeat(33) }), withNode({ id: "a b" }), withNode({ id: 5 }), withNode({ kind: "nope" }), withNode({ kind: 7 }),
      withNode({ x: "1" }), withNode({ x: Number.NaN }), withNode({ y: Infinity }), withNode({ x: 1e9 }), withNode({ extra: true }), withNode({ props: [] }), withNode({ props: "x" }),
      withNode({ props: { down: 1 } }), withNode({ props: { notAProp: 1 } }),
    ];
    for (const value of junk) expect(engine.parseSubmission(value), JSON.stringify(value)).toBeNull();
  });

  it("rejects settings outside what the catalog allows", () => {
    const bad = (id: string, props: Record<string, unknown>) => {
      const sub = design(round);
      Object.assign(node(sub.board, id).props!, props);
      return engine.parseSubmission(sub);
    };
    expect(bad("web", { count: 0 })).toBeNull();
    expect(bad("web", { count: 201 })).toBeNull();
    expect(bad("web", { count: 2.5 })).toBeNull();
    expect(bad("web", { count: "3" })).toBeNull();
    expect(bad("web", { count: Number.NaN })).toBeNull();
    expect(bad("web", { size: "m5.huge" })).toBeNull();
    expect(bad("web", { size: 3 })).toBeNull();
    expect(bad("web", { size: "db.r5.large" })).toBeNull();
    expect(bad("web", { azs: 4 })).toBeNull();
    expect(bad("web", { autoscale: 2 })).toBeNull();
    expect(bad("web", { targetUtil: 1.5 })).toBeNull();
    expect(bad("db", { replicas: 16 })).toBeNull();
    expect(bad("db", { replicas: -1 })).toBeNull();
    expect(bad("db", { multiAz: true })).toBeNull();
    expect(bad("db", { engine: "Oracle" })).toBeNull();
    expect(bad("cache", { hitRate: -0.1 })).toBeNull();
    expect(bad("web", { count: 4 })).not.toBeNull();
  });
});

describe("daily rotation", () => {
  it("gives easy, medium, hard, the same for everyone on a day", () => {
    const a = engine.roundsFor("2026-11-18");
    expect(a.map((r) => r.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(engine.roundsFor("2026-11-18").map((r) => r.id)).toEqual(a.map((r) => r.id));
  });

  it("changes from day to day and walks the whole pool", () => {
    const seen = new Set<string>();
    let previous = "";
    for (let d = 1; d <= 8; d++) {
      const day = `2026-12-0${d}`;
      const ids = engine.roundsFor(day).map((r) => r.id).join(",");
      expect(ids).not.toBe(previous);
      previous = ids;
      engine.roundsFor(day).forEach((r) => seen.add(r.id));
    }
    expect(seen.size).toBe(SYSDESIGN_POOL.length);
  });
});

describe("verify never throws", () => {
  it("copes with random and broken input", () => {
    const rand = seededRandom(7);
    const kinds = ["client", "aws-alb", "aws-ec2-asg", "aws-rds", "aws-elasticache", "aws-sqs", "worker", "aws-cloudfront", "nope", 3, null];
    for (const round of SYSDESIGN_POOL) {
      for (let i = 0; i < 40; i++) {
        const count = Math.floor(rand() * 8);
        const nodes = Array.from({ length: count }, (_, n) => ({ id: `n${n}`, kind: kinds[Math.floor(rand() * kinds.length)], x: 0, y: 0 }));
        const edges = Array.from({ length: Math.floor(rand() * 8) }, () => ({ from: `n${Math.floor(rand() * 8)}`, to: `n${Math.floor(rand() * 8)}` }));
        expect(() => engine.verify(round, { board: { nodes, edges } } as never)).not.toThrow();
        const result = engine.verify(round, { board: { nodes, edges } } as never);
        if (!result.passed) expect(result.stars).toBe(0);
      }
      for (const junk of [null, undefined, 0, "x", [], {}, { board: null }, { board: { nodes: null, edges: null } }, { board: { nodes: [null], edges: [] } }]) {
        expect(() => engine.verify(round, junk as never)).not.toThrow();
        expect(engine.verify(round, junk as never).passed).toBe(false);
      }
      expect(() => engine.verify({ ...round, spec: { ...round.spec, challenge: undefined } }, design(round))).not.toThrow();
      expect(() => engine.verify({ ...round, spec: null } as never, design(round))).not.toThrow();
    }
  });
});
