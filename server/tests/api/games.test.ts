import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { GAME_ENGINES } from "../../src/shared/games/index.js";
import { XP_AMOUNTS } from "../../src/shared/gamification/xp.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;

beforeAll(async () => {
  fx = await createCourseFixture();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await prisma.gamePlay.deleteMany({ where: { userId: fx.learner.id } });
  await fx.cleanup();
});

const auth = () => ({ Authorization: `Bearer ${fx.learnerToken}` });
const submit = (game: string, index: number | string, submission: unknown = { any: true }) =>
  request(app).post(`/api/v1/games/${game}/rounds/${index}/submit`).set(auth()).send({ submission });

/** Replace one engine's rules, so these tests check the server, not any one game. */
function engineSays(game: "linux" | "docker" | "sysdesign", result: { passed: boolean; stars: 0 | 1 | 2 | 3 }) {
  vi.spyOn(GAME_ENGINES[game], "parseSubmission").mockReturnValue({ any: true });
  vi.spyOn(GAME_ENGINES[game], "verify").mockReturnValue({ ...result, score: 10, message: "checked" });
}
const xpTotal = async () => (await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id }, select: { xpTotal: true } })).xpTotal;

describe("GET /api/v1/games/daily", () => {
  it("shows today's three games to a visitor, with no progress", async () => {
    const res = await request(app).get("/api/v1/games/daily");
    expect(res.status).toBe(200);
    expect(res.body.data.signedIn).toBe(false);
    expect(res.body.data.games.map((g: { id: string }) => g.id)).toEqual(["sysdesign", "linux", "docker"]);
    for (const game of res.body.data.games) {
      expect(game.rounds).toHaveLength(3);
      expect(game.progress).toEqual([]);
    }
    expect(res.body.data.xpLeft).toBe(33);
  });
});

describe("POST /api/v1/games/:game/rounds/:index/submit", () => {
  it("needs a signed-in learner", async () => {
    const res = await request(app).post("/api/v1/games/linux/rounds/0/submit").send({ submission: {} });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown game, a bad round and a malformed submission", async () => {
    expect((await submit("chess", 0)).status).toBe(404);
    expect((await submit("linux", 3)).status).toBe(400);
    expect((await submit("linux", "x")).status).toBe(400);
    vi.spyOn(GAME_ENGINES.linux, "parseSubmission").mockReturnValue(null);
    expect((await submit("linux", 0)).status).toBe(400);
  });

  it("records nothing and pays nothing for a round that is not solved", async () => {
    engineSays("linux", { passed: false, stars: 0 });
    const res = await submit("linux", 0);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ passed: false, xpAwarded: 0, setBonus: 0 });
    expect(await prisma.gamePlay.count({ where: { userId: fx.learner.id } })).toBe(0);
  });

  it("pays a solved round once, keeps the best stars, and pays the set bonus once", async () => {
    const before = await xpTotal();
    engineSays("docker", { passed: true, stars: 1 });

    const first = await submit("docker", 0);
    expect(first.body.data).toMatchObject({ passed: true, alreadySolved: false, xpAwarded: XP_AMOUNTS.game_round, setBonus: 0 });

    // Solving it again the same day is practice: no XP, but better stars are kept.
    engineSays("docker", { passed: true, stars: 3 });
    const again = await submit("docker", 0);
    expect(again.body.data).toMatchObject({ alreadySolved: true, xpAwarded: 0 });
    const kept = await prisma.gamePlay.findFirstOrThrow({ where: { userId: fx.learner.id, game: "docker", roundIndex: 0 } });
    expect(kept.stars).toBe(3);

    await submit("docker", 1);
    const last = await submit("docker", 2);
    expect(last.body.data).toMatchObject({ xpAwarded: XP_AMOUNTS.game_round, setBonus: XP_AMOUNTS.game_set, setComplete: true });

    const repeat = await submit("docker", 2);
    expect(repeat.body.data).toMatchObject({ xpAwarded: 0, setBonus: 0 });
    expect(await xpTotal()).toBe(before + 3 * XP_AMOUNTS.game_round + XP_AMOUNTS.game_set);

    const daily = await request(app).get("/api/v1/games/daily").set(auth());
    const docker = daily.body.data.games.find((g: { id: string }) => g.id === "docker");
    expect(docker.setComplete).toBe(true);
    expect(docker.progress).toHaveLength(3);
    expect(daily.body.data.signedIn).toBe(true);
    expect(daily.body.data.xpToday).toBe(3 * XP_AMOUNTS.game_round + XP_AMOUNTS.game_set);
  });
});
