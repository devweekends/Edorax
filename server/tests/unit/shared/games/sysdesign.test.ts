import { describe, expect, it } from "vitest";
import { seededRandom } from "../../../../src/shared/games/daily.js";
import { sysdesignEngine, simulate, STEPS, SYSDESIGN_POOL, type SysdesignRound } from "../../../../src/shared/games/sysdesign/engine.js";

const engine = sysdesignEngine;
const verify = (round: SysdesignRound, changes: string[]) => engine.verify(round, { changes });

function subsets(ids: string[], max: number): string[][] {
  const out: string[][] = [[]];
  const walk = (start: number, current: string[]) => {
    if (current.length >= max) return;
    for (let i = start; i < ids.length; i++) {
      const next = [...current, ids[i]!];
      out.push(next);
      walk(i + 1, next);
    }
  };
  walk(0, []);
  return out;
}

describe("sysdesign pool", () => {
  it("has at least four scenarios per difficulty and twelve in total, with unique ids", () => {
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      expect(SYSDESIGN_POOL.filter((r) => r.difficulty === difficulty).length).toBeGreaterThanOrEqual(4);
    }
    expect(SYSDESIGN_POOL.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SYSDESIGN_POOL.map((r) => r.id)).size).toBe(SYSDESIGN_POOL.length);
    expect(new Set(SYSDESIGN_POOL.map((r) => r.title)).size).toBe(SYSDESIGN_POOL.length);
  });

  it("has well formed data and plain text (no long dashes)", () => {
    for (const r of SYSDESIGN_POOL) {
      expect(r.traffic).toHaveLength(STEPS);
      expect(r.traffic.every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
      expect(new Set(r.changes.map((c) => c.id)).size).toBe(r.changes.length);
      expect(r.hints.length).toBeGreaterThanOrEqual(3);
      expect(r.maxChanges).toBeGreaterThanOrEqual(r.solution.length);
      expect(r.maxChanges).toBeLessThanOrEqual(5);
      expect(JSON.stringify(r)).not.toMatch(/[–—]/);
    }
  });

  it("round data survives JSON, because rounds travel as JSON", () => {
    for (const r of SYSDESIGN_POOL) {
      const copy = JSON.parse(JSON.stringify(r)) as SysdesignRound;
      expect(verify(copy, r.solution)).toEqual(verify(r, r.solution));
    }
  });
});

describe.each(SYSDESIGN_POOL.map((r) => [r.id, r] as const))("scenario %s", (_id, round) => {
  it("is really an incident: doing nothing fails", () => {
    const result = verify(round, []);
    expect(result.passed).toBe(false);
    expect(result.stars).toBe(0);
    expect(result.message.length).toBeGreaterThan(10);
  });

  it("is solved by its stated solution, with three stars", () => {
    expect(round.solution.every((id) => round.changes.some((c) => c.id === id))).toBe(true);
    const result = verify(round, round.solution);
    expect(result.passed).toBe(true);
    expect(result.stars).toBe(3);
    expect(result.message).toMatch(/goals met/i);
  });

  it("does not give three stars to a single change when the solution needs several", () => {
    if (round.solution.length < 2) return;
    for (const change of round.changes) expect(verify(round, [change.id]).stars).toBeLessThan(3);
  });

  it("has a real trap that does not fix the incident and makes something worse", () => {
    expect(round.trap).toBeTruthy();
    expect(round.changes.some((c) => c.id === round.trap)).toBe(true);
    expect(round.solution).not.toContain(round.trap);
    expect(verify(round, [round.trap!]).passed).toBe(false);
    const base = simulate(round, []);
    const trapped = simulate(round, [round.trap!]);
    const worse = trapped.costUsd > base.costUsd || trapped.p95Ms > base.p95Ms || trapped.availability < base.availability;
    expect(worse).toBe(true);
    // Using the trap never earns three stars, even with the solution.
    if (round.solution.length < round.maxChanges) {
      expect(verify(round, [...round.solution, round.trap!]).stars).toBeLessThan(3);
    }
  });

  it("explains which goal failed in one plain sentence", () => {
    const result = verify(round, []);
    expect(result.message).toMatch(/^Goal missed: .+ is .+, the goal is .+\.$/);
  });

  it("gives finite numbers and never throws for every allowed set of changes", () => {
    for (const ids of subsets(round.changes.map((c) => c.id), round.maxChanges)) {
      const sim = simulate(round, ids);
      expect(sim.steps).toHaveLength(STEPS);
      for (const n of [sim.p95Ms, sim.availability, sim.costUsd, sim.peakAppUtil, sim.peakDbUtil]) expect(Number.isFinite(n)).toBe(true);
      expect(sim.availability).toBeGreaterThanOrEqual(0);
      expect(sim.availability).toBeLessThanOrEqual(100);
      expect(sim.steps.at(-1)!.costToDate).toBe(sim.costUsd);
      const result = verify(round, ids);
      if (!result.passed) expect(result.stars).toBe(0);
    }
  });

  it("is deterministic and does not depend on a previous run", () => {
    expect(simulate(round, round.solution)).toEqual(simulate(round, round.solution));
  });

  it("rejects too many changes, repeated changes and unknown changes", () => {
    const ids = round.changes.map((c) => c.id);
    expect(verify(round, ids.slice(0, round.maxChanges + 1)).passed).toBe(false);
    expect(verify(round, [...round.solution, round.solution[0]!]).passed).toBe(false);
    expect(verify(round, ["not-a-real-change"]).passed).toBe(false);
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
    let sameAsPrevious = 0;
    let previous = "";
    for (let d = 1; d <= 8; d++) {
      const day = `2026-12-0${d}`;
      const ids = engine.roundsFor(day).map((r) => r.id).join(",");
      if (ids === previous) sameAsPrevious++;
      previous = ids;
      engine.roundsFor(day).forEach((r) => seen.add(r.id));
    }
    expect(sameAsPrevious).toBe(0);
    expect(seen.size).toBe(SYSDESIGN_POOL.length);
  });
});

describe("parseSubmission", () => {
  it("accepts a list of unique change ids", () => {
    expect(engine.parseSubmission({ changes: [] })).toEqual({ changes: [] });
    expect(engine.parseSubmission({ changes: ["a", "b"] })).toEqual({ changes: ["a", "b"] });
  });

  it("rejects junk", () => {
    const junk: unknown[] = [
      null, undefined, 0, 1, "changes", true, [], ["a"], {}, { changes: "a" }, { changes: null }, { changes: [1] },
      { changes: [null] }, { changes: [""] }, { changes: ["a", "a"] }, { changes: ["x".repeat(65)] }, { changes: Array.from({ length: 9 }, (_, i) => `c${i}`) },
      { changes: ["a"], extra: 1 }, { done: true }, { changes: { 0: "a", length: 1 } }, { changes: [["a"]] }, { changes: [{ id: "a" }] },
    ];
    for (const value of junk) expect(engine.parseSubmission(value)).toBeNull();
  });
});

describe("verify never throws", () => {
  it("copes with random and broken parsed input", () => {
    const rand = seededRandom(7);
    for (const round of SYSDESIGN_POOL) {
      const ids = [...round.changes.map((c) => c.id), "zzz", "", "__proto__", "constructor"];
      for (let i = 0; i < 40; i++) {
        const count = Math.floor(rand() * 7);
        const changes = Array.from({ length: count }, () => ids[Math.floor(rand() * ids.length)]!);
        expect(() => engine.verify(round, { changes })).not.toThrow();
      }
      expect(() => engine.verify(round, { changes: [1, null, {}] as unknown as string[] })).not.toThrow();
      expect(() => engine.verify(round, {} as never)).not.toThrow();
      expect(() => engine.verify(round, null as never)).not.toThrow();
    }
  });
});

describe("stars", () => {
  it("gives one star for meeting the goals only, and more for the tighter target and fewer changes", () => {
    const logs = SYSDESIGN_POOL.find((r) => r.id === "sd-logs-forever")!;
    expect(verify(logs, ["glacier-lifecycle"]).stars).toBe(1);
    expect(verify(logs, ["glacier-lifecycle", "compress-logs"]).stars).toBe(3);
    const bill = SYSDESIGN_POOL.find((r) => r.id === "sd-bill-tripled")!;
    expect(verify(bill, ["rightsize-app", "rightsize-db"]).stars).toBe(1);
    expect(verify(bill, bill.solution).stars).toBe(3);
    const outage = SYSDESIGN_POOL.find((r) => r.id === "sd-az-outage")!;
    // The autoscaling group is extra, so it earns two stars (a fourth change), not three.
    expect(verify(outage, [...outage.solution, "autoscaling"]).stars).toBeLessThan(3);
  });
});
