import type { GameSounds } from "@/lib/games/audio";

/**
 * What the game shell hands to each game's play component. The component draws the board or the
 * terminal and lets the player act; it calls `onFinish` when the player says they are done. The
 * shell then replays the submission with the shared engine, shows the result and the celebration,
 * and (for a signed-in learner) records it on the server.
 */
export type GamePlayProps<Round, Submission> = {
  round: Round;
  /** 0 easy, 1 medium, 2 hard. */
  roundIndex: number;
  /** Changes when the player retries, so the component starts the round from scratch. */
  attempt: number;
  /** True while the shell is checking a submission: ignore input. */
  locked: boolean;
  sounds: GameSounds;
  onFinish: (submission: Submission) => void;
};
