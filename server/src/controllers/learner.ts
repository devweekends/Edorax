import type { Request, Response } from "express";
import type { WeeklyGoalInput } from "../shared/api/learner.js";
import type { StreakMilestone } from "../shared/lib/streak.js";
import { BadRequestError } from "../utils/errors.js";
import { created, noContent, ok } from "../utils/responses.js";
import { shouldBypassProgressGating } from "../services/auth/seed-access.js";
import { loadLearnerWorkspace } from "../services/learner/workspace.js";
import { loadMenteeDashboard } from "../services/learner/load-mentee-dashboard.js";
import { loadLearnerHabit } from "../services/progress/learner-habit.js";
import { loadLearnerProgress } from "../services/learner/progress.js";
import * as weeklyGoal from "../services/learner/weekly-goal.js";
import { dismissStreakPopup, loadStreakPopup } from "../services/learner/streak-popup.js";
import { loadProfile, updateProfile } from "../services/learner/profile.js";
import { getPublicProfileSettings, loadOwnProfile, updatePublicProfileSettings } from "../services/profile/public-profile.js";
import { requestInstructorAccess } from "../services/instructor-access/request.js";
import type { ProfileUpdateInput } from "../shared/api/learner.js";
import type { GamificationPreferencesInput } from "../shared/api/gamification.js";
import { loadGamificationSummary, updateGamificationPreferences } from "../services/gamification/summary.js";
import { loadLeaderboard } from "../services/gamification/leaderboard.js";
import { loadLeaderboardHub } from "../services/gamification/leaderboard-categories.js";
import { listRewards, purchaseReward as purchaseRewardService, setActiveReward as setActiveRewardService, useReward as useRewardService } from "../services/gamification/rewards.js";
import { claimQuest as claimQuestService, loadWeeklyQuests } from "../services/gamification/quests.js";
import type { LeaderboardHubQuery } from "../validations/learner.js";

function displayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email.split("@")[0] || "there";
}

// GET /api/v1/learner/workspace
export async function workspace(req: Request, res: Response) {
  ok(res, await loadLearnerWorkspace(req.user!));
}

// GET /api/v1/learner/dashboard
export async function dashboard(req: Request, res: Response) {
  const user = req.user!;
  ok(
    res,
    await loadMenteeDashboard({
      learnerId: user.id,
      learnerName: displayName(user),
      bypassLocking: shouldBypassProgressGating(user),
    })
  );
}

// GET /api/v1/learner/progress
export async function habit(req: Request, res: Response) {
  ok(res, await loadLearnerHabit(req.user!.id, { applyFreezes: false }));
}

export async function progress(req: Request, res: Response) {
  const user = req.user!;
  const rawYear = req.query.year;
  const year = typeof rawYear === "string" && /^\d{4}$/.test(rawYear) ? Number(rawYear) : undefined;
  ok(res, await loadLearnerProgress({ userId: user.id, bypassLocking: shouldBypassProgressGating(user), year }));
}

// PUT /api/v1/learner/weekly-goal
export async function putWeeklyGoal(req: Request, res: Response) {
  await weeklyGoal.setWeeklyGoal(req.user!.id, req.body as WeeklyGoalInput);
  noContent(res);
}

// DELETE /api/v1/learner/weekly-goal
export async function deleteWeeklyGoal(req: Request, res: Response) {
  await weeklyGoal.clearWeeklyGoal(req.user!.id);
  noContent(res);
}

// POST /api/v1/learner/streak-milestones/:milestone/acknowledge
export async function acknowledgeStreakMilestone(req: Request, res: Response) {
  const { milestone } = req.params as unknown as { milestone: StreakMilestone };
  await weeklyGoal.acknowledgeStreakMilestone(req.user!.id, milestone);
  noContent(res);
}

// GET /api/v1/learner/streak-popup
export async function streakPopup(req: Request, res: Response) {
  ok(res, await loadStreakPopup(req.user!.id));
}

// POST /api/v1/learner/streak-popup/dismiss
export async function dismissStreakPopupHandler(req: Request, res: Response) {
  ok(res, await dismissStreakPopup(req.user!.id));
}

// GET /api/v1/learner/profile
export async function profile(req: Request, res: Response) {
  ok(res, await loadProfile(req.user!));
}

// PATCH /api/v1/learner/profile
export async function patchProfile(req: Request, res: Response) {
  await updateProfile(req.user!, req.body as ProfileUpdateInput);
  noContent(res);
}

// POST /api/v1/learner/instructor-access-requests
export async function requestInstructor(req: Request, res: Response) {
  const { message } = req.body as { message?: string };
  created(res, await requestInstructorAccess(req.user!, message));
}

// GET /api/v1/learner/gamification
export async function gamification(req: Request, res: Response) {
  ok(res, await loadGamificationSummary(req.user!.id));
}

// PATCH /api/v1/learner/gamification
export async function patchGamification(req: Request, res: Response) {
  await updateGamificationPreferences(req.user!.id, req.body as GamificationPreferencesInput);
  ok(res, await loadGamificationSummary(req.user!.id));
}

// GET /api/v1/learner/leaderboard?courseId=
export async function leaderboard(req: Request, res: Response) {
  const { courseId } = req.query as unknown as { courseId: string };
  ok(res, await loadLeaderboard(req.user!.id, courseId));
}

// GET /api/v1/learner/rewards
export async function rewards(req: Request, res: Response) {
  ok(res, await listRewards(req.user!.id));
}

// POST /api/v1/learner/rewards/:rewardId/purchase
export async function purchaseReward(req: Request, res: Response) {
  ok(res, await purchaseRewardService(req.user!.id, String(req.params.rewardId)));
}

// PATCH /api/v1/learner/rewards/active
export async function rewardsActive(req: Request, res: Response) {
  const rewardId = (req.body as { rewardId?: string | null }).rewardId ?? null;
  ok(res, await setActiveRewardService(req.user!.id, rewardId));
}

// POST /api/v1/learner/rewards/:rewardId/use
export async function rewardsUse(req: Request, res: Response) {
  ok(res, await useRewardService(req.user!.id, String(req.params.rewardId)));
}

// GET /api/v1/learner/quests
export async function quests(req: Request, res: Response) {
  ok(res, await loadWeeklyQuests(req.user!.id));
}

// POST /api/v1/learner/quests/:questId/claim
export async function questsClaim(req: Request, res: Response) {
  ok(res, await claimQuestService(req.user!.id, String(req.params.questId)));
}

// GET /api/v1/learner/public-profile
export async function publicProfileGet(req: Request, res: Response) {
  ok(res, await getPublicProfileSettings(req.user!.id));
}

// PATCH /api/v1/learner/public-profile
export async function publicProfilePatch(req: Request, res: Response) {
  ok(res, await updatePublicProfileSettings(req.user!.id, req.body));
}

// GET /api/v1/learner/my-profile
export async function myProfileGet(req: Request, res: Response) {
  ok(res, await loadOwnProfile(req.user!.id));
}

// GET /api/v1/learner/leaderboards?category=&scope=&courseId=
export async function leaderboards(req: Request, res: Response) {
  const { category, scope, courseId } = req.query as unknown as LeaderboardHubQuery;
  const effectiveScope = scope ?? "global";
  if (effectiveScope === "course" && category !== "weekly_xp") {
    throw new BadRequestError("Course boards are weekly XP only.");
  }
  if (effectiveScope === "course" && !courseId) {
    throw new BadRequestError("Course scope needs a courseId.");
  }
  ok(res, await loadLeaderboardHub(req.user!.id, { category, scope: effectiveScope, courseId: courseId ?? null }));
}
