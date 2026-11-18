import { DIFFICULTIES, type Difficulty } from "./types.js";

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" day key. Pure, no time zone involved. */
export function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** A small stable hash, so two games do not rotate in step. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One scenario per difficulty for the day. The pool for a difficulty is walked in a fixed order,
 * so a scenario does not repeat until the whole pool has been shown, and a game with N scenarios
 * per difficulty shows each one every N days. The start offset differs per game and difficulty.
 */
export function pickDaily<T extends { difficulty: Difficulty }>(pool: readonly T[], dayKey: string, gameId: string): T[] {
  const day = dayNumber(dayKey);
  return DIFFICULTIES.map((difficulty) => {
    const tier = pool.filter((round) => round.difficulty === difficulty);
    if (tier.length === 0) throw new Error(`${gameId}: no ${difficulty} scenarios`);
    const offset = hashString(`${gameId}:${difficulty}`) % tier.length;
    return tier[(day + offset) % tier.length]!;
  });
}

/** Seeded pseudo random numbers (mulberry32), for engines that need repeatable noise. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
