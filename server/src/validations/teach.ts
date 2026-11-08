import { z } from "zod";
import { COURSE_CATEGORIES } from "../shared/domain/enums.js";
import { isSafeAssetUrl } from "../shared/lib/asset-url.js";
import { VARIANT_ASSIGNMENTS } from "../shared/lib/course-tracks.js";
import { id, params } from "./common.js";

export const courseIdParams = params("courseId");
export const approveCourseZipUpdateBody = z.object({ previewId: id, confirm: z.literal(true) });
export const courseSlugParams = params("courseSlug");
export const courseCouponParams = z.object({ courseId: id, couponId: id });
export const createInstructorCouponBody = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).nullable().optional(),
  label: z.string().trim().min(1).max(80),
  percentOff: z.coerce.number().int().min(1).max(100),
  maxRedemptions: z.coerce.number().int().min(1).max(10000),
  expiresAt: z.string().datetime().nullable().optional(),
  autoApply: z.boolean().default(false),
}).refine((body) => body.code || body.autoApply, { message: "Enter a coupon code or enable automatic discount." });
export type CreateInstructorCouponBody = z.infer<typeof createInstructorCouponBody>;
export const instructorCouponActiveBody = z.object({ active: z.boolean() });
export const moduleIdParams = params("moduleId");
export const chapterIdParams = params("chapterId");
export const enrollmentIdParams = params("enrollmentId");
export const responseIdParams = params("responseId");
export const menteeParams = z.object({ courseSlug: id, enrollmentId: id });
export const inviteParams = z.object({ courseId: id, inviteId: id });
export const courseInstructorInviteParams = params("token");
export const courseInstructorMemberParams = z.object({ courseId: id, userId: id });
export const courseInstructorPendingInviteParams = z.object({ courseId: id, inviteId: id });
export const courseInstructorInviteBody = z.object({ email: z.string().trim().email().max(254), role: z.enum(["COURSE_CREATOR", "SUBMISSION_EVALUATOR"]) });

export const createCourseBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
});
export type CreateCourseBody = z.infer<typeof createCourseBody>;

export const unpublishCourseBody = z.object({ confirmedWithEnrollments: z.boolean().optional() });

export const deleteCourseBody = z.object({
  /** Deletion is always explicit — the UI collects a typed confirmation first. */
  confirm: z.literal(true),
  confirmedWithEnrollments: z.boolean().optional(),
});
export type DeleteCourseBody = z.infer<typeof deleteCourseBody>;

export const removeChapterBody = z.object({
  confirmedWithProgress: z.boolean().optional(),
});
export type RemoveChapterBody = z.infer<typeof removeChapterBody>;

// The settings form posts strings; the service turns "" into null and dollars into cents.
export const courseSettingsBody = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000),
  coverUrl: z.string().trim().max(2048).refine(value => !value || isSafeAssetUrl(value), "Use a same-origin image path or HTTPS URL."),
  projectGoal: z.string().trim().max(1000),
  // Beginner and Advanced match course.yaml; Easy and Hard stay valid for older courses.
  difficulty: z.enum(["", "Beginner", "Easy", "Medium", "Advanced", "Hard"]),
  estimatedHours: z.union([z.literal(""), z.coerce.number().int().min(1).max(1000)]),
  // Optional so older clients keep working; omitted means "leave the category as it is".
  category: z.enum(COURSE_CATEGORIES).optional(),
  subcategory: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  sequential: z.boolean(),
  /** Text open questions grade with the learner's OpenRouter key instead of the mentor queue. */
  autoGradeOpenQuestions: z.boolean(),
  // How learners get a variant in a course family. Optional; omitted leaves it as it is.
  variantAssignment: z.enum(VARIANT_ASSIGNMENTS).optional(),
  pricingType: z.enum(["FREE", "PAID"]),
  priceDollars: z.union([z.literal(""), z.coerce.number().min(0).max(99999)]),
  currency: z.string().trim().length(3),
});
export type CourseSettingsBody = z.infer<typeof courseSettingsBody>;

const moduleTitle = z.string().trim().min(1).max(120);
export const createModuleBody = z.object({ title: moduleTitle });
export const renameModuleBody = z.object({ title: moduleTitle });
export const moveBody = z.object({ direction: z.enum(["up", "down"]) });
export type MoveDirection = z.infer<typeof moveBody>["direction"];

export const createChapterBody = z.object({
  moduleId: id.optional(),
  title: z.string().trim().min(1).max(120),
});
export type CreateChapterBody = z.infer<typeof createChapterBody>;

export const chapterSettingsBody = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120),
  summary: z.string().trim().max(280).nullable(),
  estimatedMinutes: z.number().int().min(1).max(600).nullable(),
  readerMode: z.enum(["DEFAULT", "QUIZ"]),
  quizPassingScore: z.number().int().min(1).max(100).optional().default(70),
  isMilestone: z.boolean(),
});
export type ChapterSettingsBody = z.infer<typeof chapterSettingsBody>;

export const chapterDraftBody = z.object({ source: z.string().max(2_000_000) });

export const assignByEmailsBody = z.object({ emails: z.string().min(1).max(20_000) });

export const reportsQuery = z.object({ chapterId: z.string().optional() });

export const reviewQueueQuery = z.object({ courseId: z.string().optional() });
export const submitReviewBody = z.object({
  verdict: z.enum(["APPROVED", "NEEDS_REVISION"]),
  feedback: z.string().min(1, "Feedback is required — the mentee sees this verbatim.").max(5000),
  score: z.coerce.number().int().min(0).optional(),
});
export type SubmitReviewBody = z.infer<typeof submitReviewBody>;

export const helpInboxQuery = z.object({
  courseId: z.string().optional(),
  status: z.enum(["open", "resolved", "all"]).optional(),
  /** "reports" narrows the inbox to lesson reports; "questions" hides them. */
  kind: z.enum(["all", "questions", "reports"]).optional(),
});
export type HelpInboxQuery = z.infer<typeof helpInboxQuery>;

export const requestWithdrawalBody = z.object({
  note: z.string().trim().min(3).max(240),
});
export type RequestWithdrawalBody = z.infer<typeof requestWithdrawalBody>;

export const campaignIdParams = z.object({
  campaignId: z.string().min(1),
});
export type CampaignIdParams = z.infer<typeof campaignIdParams>;

export const participateCampaignBody = z.object({
  courseIds: z.array(z.string()).default([]),
});
export type ParticipateCampaignBody = z.infer<typeof participateCampaignBody>;
