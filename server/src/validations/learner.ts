import { z } from "zod";
import { STREAK_MILESTONES } from "../shared/lib/streak.js";
import { realNameSchema } from "../shared/lib/auth-validation.js";

export const weeklyGoalBody = z.object({
  period: z.enum(["DAILY", "WEEKLY"]).optional().default("WEEKLY"),
  kind: z.enum(["SESSIONS", "CHAPTERS", "MINUTES"]),
  // Daily minutes presets go up to 20; weekly chapter/session targets stay within 50.
  target: z.number().int().min(1).max(120),
  note: z.string().trim().max(240).optional(),
  dailyReminder: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.kind !== "MINUTES" && val.target > 50) {
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: "Weekly targets must be at most 50",
    });
  }
});

export const streakMilestoneParams = z.object({
  milestone: z.coerce
    .number()
    .refine((value): value is (typeof STREAK_MILESTONES)[number] => (STREAK_MILESTONES as readonly number[]).includes(value), {
      message: `Milestone must be one of ${STREAK_MILESTONES.join(", ")}`,
    }),
});

export const profileBody = z.object({
  name: realNameSchema,
  timezone: z.string().trim().min(1, "Timezone is required").max(64),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
});

export const instructorAccessRequestBody = z.object({ message: z.string().trim().max(500).optional() });

export const gamificationPreferencesBody = z
  .object({ hidden: z.boolean().optional(), leaderboardOptIn: z.boolean().optional() })
  .refine((body) => body.hidden !== undefined || body.leaderboardOptIn !== undefined, {
    message: "Set hidden or leaderboardOptIn",
  });

export const leaderboardQuery = z.object({ courseId: z.string().trim().min(1).max(64) });

export const publicProfileBody = z.object({
  profilePublic: z.boolean().optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  learningInPublic: z.boolean().optional(),
});

export const rewardsActiveBody = z.object({ rewardId: z.string().trim().min(1).max(64).nullable().optional() });

// The hub page sends all three params explicitly; the controller defaults the scope to global
// (the league board) and only needs courseId when scope=course.
export const leaderboardHubQuery = z.object({
  category: z.enum(["weekly_xp", "all_time_xp", "speed", "streak"]).optional().default("weekly_xp"),
  scope: z.enum(["course", "global"]).optional(),
  courseId: z.string().trim().min(1).max(64).optional(),
});

export type LeaderboardHubQuery = z.infer<typeof leaderboardHubQuery>;
