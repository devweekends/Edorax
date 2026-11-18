import { apiFetch } from "@/lib/api-client";
import type { DailyGamesView, SubmitRoundResult } from "@/shared/api/games";
import type { GameId } from "@/shared/games/types";

/** Today's games. Open to visitors; a signed-in learner also gets their progress. */
export function fetchDailyGames(): Promise<DailyGamesView> {
  return apiFetch<DailyGamesView>("/api/v1/games/daily");
}

/** Send a finished round to be replayed on the server. Needs a signed-in learner. */
export function submitGameRound(game: GameId, roundIndex: number, submission: unknown): Promise<SubmitRoundResult> {
  return apiFetch<SubmitRoundResult>(`/api/v1/games/${game}/rounds/${roundIndex}/submit`, { method: "POST", json: { submission } });
}
