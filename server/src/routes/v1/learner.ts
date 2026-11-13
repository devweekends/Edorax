import { Router } from "express";
import * as learner from "../../controllers/learner.js";
import * as aiCredential from "../../controllers/ai-credential.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { userRateLimit } from "../../middlewares/rate-limit.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.js";
import { aiCredentialModelBody, aiCredentialSaveBody } from "../../validations/ai.js";
import {
  gamificationPreferencesBody,
  instructorAccessRequestBody,
  leaderboardHubQuery,
  leaderboardQuery,
  profileBody,
  publicProfileBody,
  rewardsActiveBody,
  streakMilestoneParams,
  weeklyGoalBody,
} from "../../validations/learner.js";

// Everything the signed-in learner sees about themselves.
const router = Router();

router.use(authenticate, requireVerified);

router.get("/workspace", learner.workspace);
router.get("/dashboard", learner.dashboard);
router.get("/habit", learner.habit);
router.get("/progress", learner.progress);
router.put("/weekly-goal", validateBody(weeklyGoalBody), learner.putWeeklyGoal);
router.delete("/weekly-goal", learner.deleteWeeklyGoal);
router.post("/streak-milestones/:milestone/acknowledge", validateParams(streakMilestoneParams), learner.acknowledgeStreakMilestone);
router.get("/streak-popup", learner.streakPopup);
router.post("/streak-popup/dismiss", learner.dismissStreakPopupHandler);
router.get("/gamification", learner.gamification);
router.patch("/gamification", validateBody(gamificationPreferencesBody), learner.patchGamification);
router.get("/leaderboard", validateQuery(leaderboardQuery), learner.leaderboard);
router.get("/leaderboards", validateQuery(leaderboardHubQuery), learner.leaderboards);
router.get("/rewards", learner.rewards);
router.post("/rewards/:rewardId/purchase", learner.purchaseReward);
router.post("/rewards/:rewardId/use", learner.rewardsUse);
router.get("/quests", learner.quests);
router.post("/quests/:questId/claim", learner.questsClaim);
router.patch("/rewards/active", validateBody(rewardsActiveBody), learner.rewardsActive);
router.get("/profile", learner.profile);
router.get("/public-profile", learner.publicProfileGet);
router.patch("/public-profile", validateBody(publicProfileBody), learner.publicProfilePatch);
router.get("/my-profile", learner.myProfileGet);
router.patch("/profile", validateBody(profileBody), learner.patchProfile);
router.post("/instructor-access-requests", validateBody(instructorAccessRequestBody), learner.requestInstructor);

// The learner's own OpenRouter key for AI interviews. Saving and testing each
// make one request to OpenRouter, so both share a per-user limit.
const aiKeyCheckLimit = userRateLimit({
  scope: "ai-key-check",
  max: 6,
  windowMs: 10 * 60_000,
  message: "Too many key checks. Wait a few minutes and try again.",
});
router.get("/ai-credential", aiCredential.status);
router.put("/ai-credential", aiKeyCheckLimit, validateBody(aiCredentialSaveBody), aiCredential.save);
router.patch("/ai-credential", validateBody(aiCredentialModelBody), aiCredential.updateModel);
router.post("/ai-credential/test", aiKeyCheckLimit, aiCredential.test);
router.delete("/ai-credential", aiCredential.remove);

export default router;
