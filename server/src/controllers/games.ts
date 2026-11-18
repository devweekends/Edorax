import type { Request, Response } from "express";
import { ok } from "../utils/responses.js";
import { loadDailyGames, submitRound } from "../services/games/daily.js";

// GET /api/v1/games/daily
export async function daily(req: Request, res: Response) {
  ok(res, await loadDailyGames(req.user?.id ?? null));
}

// POST /api/v1/games/:game/rounds/:index/submit
export async function submit(req: Request, res: Response) {
  const { game, index } = req.params as { game: string; index: string };
  ok(res, await submitRound(req.user!.id, game, Number(index), (req.body as { submission: unknown }).submission));
}
