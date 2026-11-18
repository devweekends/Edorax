// The contract every daily game follows. A game is a pure, deterministic engine that runs in the
// browser (so the player gets instant feedback) and again on the server (which replays the
// submission before it gives XP). Nothing here may touch the DOM, the clock or Math.random.

export const GAME_IDS = ["sysdesign", "linux", "docker"] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

/** Rounds in one game on one day: easy, medium, hard. Round numbers start at 0. */
export const ROUNDS_PER_DAY = 3;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Stars = 0 | 1 | 2 | 3;

/** What every round needs so the shell can list and label it. A game adds its own fields. */
export type RoundBase = {
  /** Stable id of the scenario, for example "sd-bill-tripled". Never reused for another scenario. */
  id: string;
  difficulty: Difficulty;
  title: string;
  /** One or two plain sentences: what is wrong or what to do. */
  brief: string;
};

export type VerifyResult = {
  /** The round is solved. Only a solved round records progress and earns XP. */
  passed: boolean;
  /** 1 to 3 when passed, 0 when not. Better play (fewer commands, lower cost, no hints) earns more. */
  stars: Stars;
  /** A number the game shows, for example a cost or a command count. Higher is not always better. */
  score: number;
  /** One short sentence shown to the player: why it passed or what is still wrong. */
  message: string;
};

export interface GameEngine<R extends RoundBase, S> {
  id: GameId;
  title: string;
  tagline: string;
  /** Today's rounds in order easy, medium, hard. Same for everyone, from the day key only. */
  roundsFor(dayKey: string): R[];
  /** Narrow an unknown value from the network to a submission, or null when it is malformed. */
  parseSubmission(input: unknown): S | null;
  /** Replay a submission against a round. Pure and deterministic, and must never throw. */
  verify(round: R, submission: S): VerifyResult;
}

/** A loosely typed engine, for the registry and the API where the round type is not known. */
export type AnyGameEngine = GameEngine<RoundBase & Record<string, unknown>, unknown>;
