import { Router } from "express";
import * as games from "../../controllers/games.js";
import { authenticate, optionalAuth } from "../../middlewares/authenticate.js";
import { userRateLimit } from "../../middlewares/rate-limit.js";
import { validate } from "../../middlewares/validate.js";
import { submitRoundBody, submitRoundParams } from "../../validations/games.js";

// Daily games (docs/17-daily-games.mdx). Reading today's set is open to visitors, so they can play
// without signing in; only a signed-in learner records progress and earns XP.
const router = Router();

router.get("/daily", optionalAuth, games.daily);
router.post(
  "/:game/rounds/:index/submit",
  authenticate,
  userRateLimit({ scope: "game-submit", max: 40 }),
  validate({ params: submitRoundParams, body: submitRoundBody }),
  games.submit,
);

export default router;
