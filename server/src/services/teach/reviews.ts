import type { AiReviewDraftResult, ReviewDetailView, ReviewQueueView } from "../../shared/api/teach.js";
import { loadIntegritySummaries } from "../integrity/review.js";
import { TEACH_ERROR_CODES } from "../../shared/api/teach.js";
import { OpenQuestionConfigSchema, OpenQuestionPayloadSchema } from "../../shared/blocks/open-question/schema.js";
import { parseSafeSubmissionUrl } from "../../shared/lib/safe-submission-url.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { notifyMenteeReviewFeedback } from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { adjustEnrollmentPendingReviews, recomputeChapterProgress, resolvePendingBlockReview } from "../progress/compute.js";
import { awardXp } from "../gamification/xp.js";
import { xpKeys } from "../../shared/gamification/xp.js";
import type { SubmitReviewBody } from "../../validations/teach.js";
import { mentoredCoursesWhere, requireCourseById } from "./access.js";
import { generateReviewDraft } from "./ai/review-draft.js";
import { loadAiKeyForUse } from "../ai/credentials.js";
import { AiError } from "../ai/openrouter.js";
import { CapstoneCheckConfigSchema } from "../../shared/blocks/capstone-check/schema.js";
import { toMentorView } from "../capstone/service.js";

// Mentor review of human-graded submissions (docs/05-review-queue.mdx).
// Completion tracks submission and review tracks quality, so a needs-revision
// verdict never reverts chapter completion; the only progress write is a
// recompute that folds the awarded score into the rollups.

/** Open answers across the caller's courses. Resubmissions jump the queue, then oldest first. */
export async function loadReviewQueue(user: SessionUser, courseFilter?: string): Promise<ReviewQueueView> {
  const courses = await prisma.course.findMany({
    where: mentoredCoursesWhere(user, "SUBMISSION_EVALUATOR"),
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const courseIds = courses.map((course) => course.id);
  const scope = courseFilter && courseIds.includes(courseFilter) ? courseFilter : { in: courseIds };

  const pending =
    courseIds.length === 0
      ? []
      : await prisma.response.findMany({
          where: { status: "PENDING_REVIEW", block: { chapter: { courseId: scope } } },
          orderBy: { submittedAt: "asc" },
          include: {
            user: { select: { name: true, email: true } },
            block: { select: { chapter: { select: { title: true, course: { select: { title: true } } } } } },
          },
        });

  pending.sort((a, b) => {
    const aResub = a.attempt > 1 ? 0 : 1;
    const bResub = b.attempt > 1 ? 0 : 1;
    if (aResub !== bResub) return aResub - bResub;
    return a.submittedAt.getTime() - b.submittedAt.getTime();
  });

  return {
    courses,
    items: pending.map((response) => ({
      id: response.id,
      attempt: response.attempt,
      submittedAt: response.submittedAt.toISOString(),
      learnerLabel: response.user.name ?? response.user.email,
      courseTitle: response.block.chapter.course.title,
      chapterTitle: response.block.chapter.title,
    })),
  };
}

async function requireReviewableResponse(user: SessionUser, responseId: string) {
  const response = await prisma.response.findUnique({
    where: { id: responseId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      block: {
        include: { chapter: { select: { id: true, title: true, course: { select: { id: true, slug: true, title: true } } } } },
      },
      review: { select: { score: true, verdict: true } },
    },
  });
  if (!response) throw new NotFoundError("Submission not found");
  await requireCourseById(user, response.block.chapter.course.id, "SUBMISSION_EVALUATOR");
  return response;
}

/** One submission with the mentor-only question config and the learner's previous exchanges. */
export async function loadReviewDetail(user: SessionUser, responseId: string): Promise<ReviewDetailView> {
  const response = await requireReviewableResponse(user, responseId);

  const [history, integrity] = await Promise.all([
    prisma.response.findMany({
      where: { blockId: response.blockId, userId: response.userId, review: { isNot: null } },
      orderBy: { attempt: "asc" },
      select: { id: true, attempt: true, review: { select: { verdict: true, feedback: true, reviewer: { select: { name: true } } } } },
    }),
    loadIntegritySummaries(response.enrollmentId, response.block.chapter.id),
  ]);

  const config = OpenQuestionConfigSchema.safeParse(response.block.config);
  const capstone = response.block.type === "CAPSTONE_CHECK" ? await loadCapstoneReview(response.blockId, response.userId, response.id, response.block.config) : null;
  const payload = response.payload as { text?: string; url?: string } | null;
  const rawUrl = typeof payload?.url === "string" ? payload.url : null;
  const answerText =
    typeof payload?.text === "string" && payload.text.trim()
      ? payload.text
      : rawUrl
        ? `(Link submission)\n${rawUrl}`
        : JSON.stringify(response.payload, null, 2);

  return {
    id: response.id,
    status: response.status,
    attempt: response.attempt,
    submittedAt: response.submittedAt.toISOString(),
    learner: response.user,
    course: response.block.chapter.course,
    chapterTitle: response.block.chapter.title,
    block: { id: response.block.id, type: response.block.type, points: response.block.points },
    question: config.success
      ? {
          prompt: config.data.prompt,
          minWords: config.data.minWords,
          maxWords: config.data.maxWords ?? null,
          rubric: config.data.rubric ?? null,
          sampleAnswer: config.data.sampleAnswer ?? null,
        }
      : null,
    answerText,
    answerUrl: rawUrl ? (parseSafeSubmissionUrl(rawUrl)?.toString() ?? null) : null,
    review: response.review,
    history: history.flatMap((item) =>
      item.review
        ? [{ id: item.id, attempt: item.attempt, verdict: item.review.verdict, feedback: item.review.feedback, reviewerName: item.review.reviewer.name }]
        : []
    ),
    integrity,
    capstone,
  };
}

/** The check this Response carries plus the learner's other checks, with cost and model for the mentor. */
async function loadCapstoneReview(blockId: string, userId: string, responseId: string, rawConfig: unknown): Promise<ReviewDetailView["capstone"]> {
  const config = CapstoneCheckConfigSchema.safeParse(rawConfig);
  const checks = await prisma.capstoneCheck.findMany({ where: { blockId, userId }, orderBy: { createdAt: "desc" }, take: 20 });
  const current = checks.find((check) => check.responseId === responseId) ?? null;
  return {
    title: config.success ? (config.data.title ?? config.data.rubric.title) : "Capstone",
    current: current ? toMentorView(current) : null,
    history: checks.filter((check) => check.id !== current?.id).map(toMentorView),
  };
}

export async function submitReview(user: SessionUser, responseId: string, input: SubmitReviewBody): Promise<void> {
  const response = await requireReviewableResponse(user, responseId);
  if (response.status !== "PENDING_REVIEW") {
    throw new ConflictError("This submission has already been reviewed.", TEACH_ERROR_CODES.ALREADY_REVIEWED);
  }

  const maxScore = response.block.points;
  const score = input.score !== undefined ? Math.min(input.score, maxScore) : null;

  await prisma.$transaction(async (tx) => {
    await tx.response.update({
      where: { id: response.id },
      data: { status: input.verdict === "APPROVED" ? "REVIEWED" : "NEEDS_REVISION", score, maxScore },
    });
    await tx.review.create({
      data: { responseId: response.id, reviewerId: user.id, feedback: input.feedback, verdict: input.verdict, score },
    });
    await resolvePendingBlockReview(tx, response.blockId);
    await adjustEnrollmentPendingReviews(tx, response.enrollmentId, -1);
    await recomputeChapterProgress(tx, response.enrollmentId, response.block.chapter.id);
    if (input.verdict === "APPROVED") {
      // Once per question: a later approved resubmission of the same block earns nothing more.
      await awardXp(tx, {
        userId: response.userId,
        enrollmentId: response.enrollmentId,
        courseId: response.block.chapter.course.id,
        source: "answer_approved",
        sourceKey: xpKeys.answerApproved(response.blockId),
      });
    }
  });

  await dispatchNotification(() => notifyMenteeReviewFeedback({ responseId: response.id, verdict: input.verdict, feedbackPreview: input.feedback }));
}

/** Advisory AI draft for an open-question answer; the mentor edits and submits it. */
export async function generateAiReviewDraft(user: SessionUser, responseId: string): Promise<AiReviewDraftResult> {
  const response = await requireReviewableResponse(user, responseId);
  if (response.status !== "PENDING_REVIEW") {
    throw new ConflictError("This submission has already been reviewed.", TEACH_ERROR_CODES.ALREADY_REVIEWED);
  }
  if (response.block.type !== "OPEN_QUESTION") {
    throw new UnprocessableError("AI drafting currently supports open-question responses.", TEACH_ERROR_CODES.AI_DRAFT_UNSUPPORTED);
  }

  const config = OpenQuestionConfigSchema.safeParse(response.block.config);
  const payload = OpenQuestionPayloadSchema.safeParse(response.payload);
  if (!config.success || !payload.success) {
    throw new UnprocessableError("This submission could not be prepared for AI review.", TEACH_ERROR_CODES.AI_DRAFT_UNSUPPORTED);
  }

  // The reviewing instructor's own OpenRouter key pays for the draft.
  let instructorKey: { provider: string; apiKey: string; model: string };
  try {
    instructorKey = await loadAiKeyForUse(user.id);
  } catch (error) {
    if (error instanceof AiError && error.code === "AI_KEY_REQUIRED") {
      throw new UnprocessableError("Add your OpenRouter key in Settings to use AI drafting.", TEACH_ERROR_CODES.AI_DRAFT_UNAVAILABLE);
    }
    if (error instanceof AiError && error.code === "AI_KEY_INVALID") {
      throw new UnprocessableError(error.message, TEACH_ERROR_CODES.AI_DRAFT_UNAVAILABLE);
    }
    throw new UnprocessableError("AI drafting is temporarily unavailable. Try again in a moment.", TEACH_ERROR_CODES.AI_DRAFT_UNAVAILABLE);
  }
  if (instructorKey.provider !== "OPENROUTER") {
    throw new UnprocessableError("AI drafting needs an OpenRouter key. Switch your key in Settings.", TEACH_ERROR_CODES.AI_DRAFT_UNSUPPORTED);
  }

  const priorResponses = await prisma.response.findMany({
    where: { blockId: response.blockId, userId: response.userId, id: { not: response.id }, review: { isNot: null } },
    orderBy: { attempt: "desc" },
    take: 3,
    select: { review: { select: { feedback: true } } },
  });

  const answerParts = [payload.data.text.trim()];
  if (payload.data.url?.trim()) answerParts.push(`Submitted URL (not fetched): ${payload.data.url.trim()}`);

  try {
    const result = await generateReviewDraft({
      courseTitle: response.block.chapter.course.title,
      chapterTitle: response.block.chapter.title,
      prompt: config.data.prompt,
      rubric: config.data.rubric,
      sampleAnswer: config.data.sampleAnswer,
      answer: answerParts.filter(Boolean).join("\n\n"),
      previousFeedback: priorResponses.flatMap((item) => (item.review?.feedback ? [item.review.feedback] : [])),
      maxScore: response.block.points,
    }, { apiKey: instructorKey.apiKey, model: instructorKey.model });
    return {
      model: result.model,
      draft: { ...result.draft, suggestedScore: Math.min(result.draft.suggestedScore, response.block.points) },
    };
  } catch (error) {
    // Configuration and upstream failures are safe to show; anything else stays generic.
    const message = error instanceof Error ? error.message : "";
    const safeMessage =
      message.includes("Add your OpenRouter key") || message.startsWith("OpenRouter could not generate") || message.startsWith("OpenRouter returned an unreadable")
        ? message
        : "AI drafting is temporarily unavailable. Try again in a moment.";
    throw new UnprocessableError(safeMessage, TEACH_ERROR_CODES.AI_DRAFT_UNAVAILABLE);
  }
}
