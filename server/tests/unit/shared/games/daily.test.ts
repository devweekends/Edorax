import { describe, expect, it } from "vitest";
import { dayNumber, hashString, pickDaily, seededRandom } from "../../../../src/shared/games/daily.js";
import { DIFFICULTIES, GAME_IDS, ROUNDS_PER_DAY, isGameId } from "../../../../src/shared/games/types.js";
import { GAME_ENGINES } from "../../../../src/shared/games/index.js";
import { XP_AMOUNTS, XP_DAILY_CAPS, xpKeys } from "../../../../src/shared/gamification/xp.js";

const pool = DIFFICULTIES.flatMap((difficulty) =>
  [1, 2, 3, 4].map((n) => ({ id: `${difficulty}-${n}`, difficulty })),
);

describe("daily rotation", () => {
  it("counts days since 1970 without a time zone", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(dayNumber("2026-11-18") - dayNumber("2026-11-17")).toBe(1);
  });

  it("picks one scenario per difficulty, in order", () => {
    const day = pickDaily(pool, "2026-11-18", "demo");
    expect(day).toHaveLength(ROUNDS_PER_DAY);
    expect(day.map((round) => round.difficulty)).toEqual([...DIFFICULTIES]);
  });

  it("is the same for everyone on one day and varies from day to day", () => {
    expect(pickDaily(pool, "2026-11-18", "demo")).toEqual(pickDaily(pool, "2026-11-18", "demo"));
    expect(pickDaily(pool, "2026-11-18", "demo")).not.toEqual(pickDaily(pool, "2026-11-19", "demo"));
  });

  it("shows every scenario of a tier before it repeats", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 4; d++) seen.add(pickDaily(pool, `2026-11-${10 + d}`, "demo")[0]!.id);
    expect(seen.size).toBe(4);
  });

  it("does not rotate two games in step", () => {
    expect(hashString("sysdesign:easy")).not.toBe(hashString("linux:easy"));
  });

  it("refuses a pool with a missing difficulty", () => {
    expect(() => pickDaily(pool.filter((round) => round.difficulty !== "hard"), "2026-11-18", "demo")).toThrow(/hard/);
  });

  it("gives repeatable noise from a seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("game registry and XP", () => {
  it("has an engine for every game id, and only those ids", () => {
    expect(Object.keys(GAME_ENGINES).sort()).toEqual([...GAME_IDS].sort());
    expect(isGameId("linux")).toBe(true);
    expect(isGameId("chess")).toBe(false);
    for (const id of GAME_IDS) expect(GAME_ENGINES[id].id).toBe(id);
  });

  it("serves three rounds, one per difficulty, from every engine", () => {
    for (const id of GAME_IDS) {
      const rounds = GAME_ENGINES[id].roundsFor("2026-11-18");
      expect(rounds).toHaveLength(ROUNDS_PER_DAY);
      expect(rounds.map((round) => round.difficulty)).toEqual([...DIFFICULTIES]);
    }
  });

  it("keeps game XP small and keyed once per round and per set", () => {
    expect(XP_AMOUNTS.game_round).toBe(3);
    expect(XP_AMOUNTS.game_set).toBe(2);
    expect(XP_DAILY_CAPS.game_round).toBe(GAME_IDS.length * ROUNDS_PER_DAY);
    expect(XP_DAILY_CAPS.game_set).toBe(GAME_IDS.length);
    expect(xpKeys.gameRound("2026-11-18", "linux", 1)).toBe("game_round:2026-11-18:linux:1");
    expect(xpKeys.gameSet("2026-11-18", "linux")).toBe("game_set:2026-11-18:linux");
  });
});
