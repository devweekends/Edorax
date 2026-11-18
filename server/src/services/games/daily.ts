import { prisma } from "../../db/prisma.js";
import { learnerTimeZone } from "../learner/time-zone.js";
import { awardXp } from "../gamification/xp.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { XP_AMOUNTS, xpKeys } from "../../shared/gamification/xp.js";
import { dayKeyToDate, localDayKey, shiftDayKey, startOfLocalDay } from "../../shared/lib/local-date.js";
import { GAME_IDS, ROUNDS_PER_DAY, engineFor, isGameId, type GameId } from "../../shared/games/index.js";
import type { DailyGameView, DailyGamesView, GameRoundProgress, SubmitRoundResult } from "../../shared/api/games.js";
import type { Stars } from "../../shared/games/types.js";

/** The most XP the games can give in one day: every round and every set bonus. */
export const GAMES_XP_PER_DAY = GAME_IDS.length * (ROUNDS_PER_DAY * XP_AMOUNTS.game_round + XP_AMOUNTS.game_set);

async function dayFor(userId: string | null, now: Date) {
  const timeZone = userId ? await learnerTimeZone(userId) : "UTC";
  const dayKey = localDayKey(now, timeZone);
  return { timeZone, dayKey, resetsAt: startOfLocalDay(shiftDayKey(dayKey, 1), timeZone) };
}

/** Today's games for a learner, or for a visitor with no progress. */
export async function loadDailyGames(userId: string | null, now = new Date()): Promise<DailyGamesView> {
  const { dayKey, resetsAt } = await dayFor(userId, now);
  const plays = userId
    ? await prisma.gamePlay.findMany({ where: { userId, dayKey: dayKeyToDate(dayKey) }, select: { game: true, roundIndex: true, stars: true, score: true, xpAwarded: true } })
    : [];
  const bonus = userId
    ? await prisma.xpEntry.findMany({ where: { userId, source: "game_set", dayKey: dayKeyToDate(dayKey) }, select: { amount: true } })
    : [];
  const xpToday = plays.reduce((sum, play) => sum + play.xpAwarded, 0) + bonus.reduce((sum, entry) => sum + entry.amount, 0);

  const games: DailyGameView[] = GAME_IDS.map((id) => {
    const engine = engineFor(id);
    const progress: GameRoundProgress[] = plays
      .filter((play) => play.game === id)
      .map((play) => ({ roundIndex: play.roundIndex, stars: play.stars as Stars, score: play.score }))
      .sort((a, b) => a.roundIndex - b.roundIndex);
    return { id, title: engine.title, tagline: engine.tagline, rounds: engine.roundsFor(dayKey), progress, setComplete: progress.length >= ROUNDS_PER_DAY };
  });
  return { dayKey, resetsAt: resetsAt.toISOString(), signedIn: Boolean(userId), xpToday, xpLeft: Math.max(0, GAMES_XP_PER_DAY - xpToday), games };
}

/**
 * Replay a submission against today's round. A passed round is stored once per day (the best stars
 * win) and earns XP once; the set bonus is paid when the third round of a game is solved.
 */
export async function submitRound(userId: string, gameParam: string, roundIndex: number, submissionInput: unknown, now = new Date()): Promise<SubmitRoundResult> {
  if (!isGameId(gameParam)) throw new NotFoundError("Unknown game");
  const game: GameId = gameParam;
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= ROUNDS_PER_DAY) throw new BadRequestError("Unknown round");

  const engine = engineFor(game);
  const { dayKey } = await dayFor(userId, now);
  const round = engine.roundsFor(dayKey)[roundIndex];
  if (!round) throw new BadRequestError("Unknown round");
  const submission = engine.parseSubmission(submissionInput);
  if (submission === null) throw new BadRequestError("That submission is not valid for this game");

  const result = engine.verify(round, submission);
  const base = { passed: result.passed, stars: result.stars, score: result.score, message: result.message };
  if (!result.passed) return { ...base, alreadySolved: false, xpAwarded: 0, setBonus: 0, setComplete: false };

  const day = dayKeyToDate(dayKey);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.gamePlay.findUnique({ where: { userId_game_dayKey_roundIndex: { userId, game, dayKey: day, roundIndex } } });
    const xpAwarded = await awardXp(tx, { userId, enrollmentId: null, courseId: null, source: "game_round", sourceKey: xpKeys.gameRound(dayKey, game, roundIndex), at: now });
    if (!existing) {
      await tx.gamePlay.create({ data: { userId, game, dayKey: day, roundIndex, stars: result.stars, score: result.score, xpAwarded } });
    } else if (result.stars > existing.stars) {
      await tx.gamePlay.update({ where: { id: existing.id }, data: { stars: result.stars, score: result.score } });
    }
    const solved = await tx.gamePlay.count({ where: { userId, game, dayKey: day } });
    const setComplete = solved >= ROUNDS_PER_DAY;
    const setBonus = setComplete ? await awardXp(tx, { userId, enrollmentId: null, courseId: null, source: "game_set", sourceKey: xpKeys.gameSet(dayKey, game), at: now }) : 0;
    return { ...base, alreadySolved: Boolean(existing), xpAwarded, setBonus, setComplete };
  });
}
