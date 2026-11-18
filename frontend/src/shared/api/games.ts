// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Wire types for the daily games (docs/17-daily-games.mdx).
import type { GameId, RoundBase, Stars } from "../games/types";

/** What one solved round left behind. */
export type GameRoundProgress = { roundIndex: number; stars: Stars; score: number };

export type DailyGameView = {
  id: GameId;
  title: string;
  tagline: string;
  /** Today's three rounds. The game component knows its own round shape. */
  rounds: Array<RoundBase & Record<string, unknown>>;
  /** Solved rounds only, for a signed-in learner. */
  progress: GameRoundProgress[];
  /** All three rounds solved today. */
  setComplete: boolean;
};

export type DailyGamesView = {
  /** The learner's local day (UTC for a visitor who is not signed in). */
  dayKey: string;
  /** When the next set opens, as an ISO time. */
  resetsAt: string;
  signedIn: boolean;
  /** XP earned from the games today. */
  xpToday: number;
  /** XP a learner can still earn from the games today. */
  xpLeft: number;
  games: DailyGameView[];
};

export type SubmitRoundBody = { submission: unknown };

export type SubmitRoundResult = {
  passed: boolean;
  stars: Stars;
  score: number;
  message: string;
  /** This round was already solved today; nothing new was recorded for XP. */
  alreadySolved: boolean;
  xpAwarded: number;
  /** Extra XP for finishing all three rounds of the game today. */
  setBonus: number;
  setComplete: boolean;
};
