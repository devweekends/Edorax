import { resolveCourseFamily, summarizeLearnerTrack } from "../../../shared/lib/course-tracks.js";
import { releaseForEnrollment, releaseModulesWithBlocks } from "../../courses/releases.js";
import { prisma } from "../../../db/prisma.js";
import { OpenQuestionConfigSchema, openQuestionUrlPresentation } from "../../../shared/blocks/open-question/schema.js";
import { submissionPreview } from "../../progress/submission-preview.js";
import { isCompletableBlock, flattenChapterIds, lockedChapterIds } from "../../progress/rules.js";
import { loadStudyWeek } from "../../progress/study-summary.js";
import { classifyProjectEvidence, evidenceUrlParts } from "./evidence.js";
import { isEnrollmentScopedToCourse, latestByBlock } from "./helpers.js";
import { parseLearningLog } from "../../../shared/lib/learning-log.js";
import type { EvaluationReflection } from "../../../shared/api/teach.js";
import type {
  EvaluationAttention,
  EvaluationModule,
  FeedbackEvent,
  MenteeEvaluation,
  ProjectEvidence,
} from "../../../shared/api/teach.js";
import { helpUiCopy as copy } from "../../../shared/lib/help-ui-copy.js";
import { isConfirmedEnrollment } from "../../enrollment/lifecycle.js";
import { loadIntegritySummaries } from "../../integrity/review.js";

const RESPONSE_LIMIT = 240;
const INACTIVE_DAYS = 7;

export async function loadMenteeEvaluation(args: {
  course: { id: string; slug: string; title: string };
  enrollmentId: string;
}): Promise<MenteeEvaluation | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: args.enrollmentId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      payment: { select: { status: true } },
    },
  });
  if (!enrollment || !isEnrollmentScopedToCourse(enrollment, args.course.id)) return null;
  if (!isConfirmedEnrollment(enrollment)) return null;
  if (!enrollment.userId || !enrollment.user) return null;

  const [courseStructure, progressRows, responseRows, helpRows, sessionRows, study, integrity] =
    await Promise.all([
      prisma.course.findUnique({
        where: { id: args.course.id },
        select: {
          sequential: true,
          familySlug: true,
          variantFamily: true,
          modules: {
            where: { archivedAt: null },
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              title: true,
              chapters: {
                where: { archivedAt: null },
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  order: true,
                  estimatedMinutes: true,
                  blocks: {
                    where: { archivedAt: null },
                    select: { id: true, type: true, required: true, archivedAt: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.chapterProgress.findMany({
        where: { enrollmentId: enrollment.id },
        select: {
          chapterId: true,
          status: true,
          blocksCompleted: true,
          blocksTotal: true,
          score: true,
          maxScore: true,
          timeSpentSeconds: true,
          startedAt: true,
          completedAt: true,
          learningLog: true,
        },
      }),
      prisma.response.findMany({
        where: { enrollmentId: enrollment.id, status: { not: "DRAFT" } },
        orderBy: { submittedAt: "desc" },
        take: RESPONSE_LIMIT,
        include: {
          review: { select: { verdict: true, feedback: true, score: true, createdAt: true } },
          block: {
            select: {
              id: true,
              type: true,
              config: true,
              chapterId: true,
              chapter: {
                select: {
                  title: true,
                  slug: true,
                  module: { select: { id: true, title: true, order: true } },
                },
              },
            },
          },
        },
      }),
      prisma.helpThread.findMany({
        where: { courseId: args.course.id, menteeId: enrollment.userId },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          chapter: { select: { title: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
        },
      }),
      prisma.studySession.findMany({
        where: { enrollmentId: enrollment.id },
        orderBy: { startedAt: "desc" },
        take: 12,
        include: { chapter: { select: { title: true } } },
      }),
      loadStudyWeek([enrollment.id]),
      loadIntegritySummaries(enrollment.id),
    ]);

  if (!courseStructure) return null;
  const selectedRelease = await releaseForEnrollment(args.course.id, enrollment, courseStructure.familySlug);
  if (selectedRelease) courseStructure.modules = await releaseModulesWithBlocks(selectedRelease.modules);

  const progressByChapter = new Map(progressRows.map((row) => [row.chapterId, row]));
  const attemptsByBlock = new Map<string, number>();
  for (const row of responseRows) {
    attemptsByBlock.set(row.blockId, (attemptsByBlock.get(row.blockId) ?? 0) + 1);
  }
  const latestResponses = latestByBlock(responseRows);
  const latestByChapter = new Map<string, typeof latestResponses>();
  for (const response of latestResponses) {
    const list = latestByChapter.get(response.block.chapterId) ?? [];
    list.push(response);
    latestByChapter.set(response.block.chapterId, list);
  }

  const orderedChapterIds = flattenChapterIds(courseStructure.modules);
  const statusByChapter = new Map(progressRows.map((row) => [row.chapterId, row.status]));
  const lockedIds = lockedChapterIds(
    orderedChapterIds,
    statusByChapter,
    courseStructure.sequential
  );
  const currentProgress =
    progressRows.find((row) => row.status === "IN_PROGRESS") ??
    [...progressRows].sort(
      (a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0)
    )[0] ??
    null;
  const currentChapterRow = courseStructure.modules
    .flatMap((module) => module.chapters.map((chapter) => ({ module, chapter })))
    .find(({ chapter }) => chapter.id === currentProgress?.chapterId);

  const pendingChapterIds = new Set(
    latestResponses
      .filter((response) => response.status === "PENDING_REVIEW")
      .map((response) => response.block.chapterId)
  );

  const modules: EvaluationModule[] = courseStructure.modules.map((module) => {
    const chapters = module.chapters.map((chapter) => {
      const progress = progressByChapter.get(chapter.id);
      const chapterResponses = latestByChapter.get(chapter.id) ?? [];
      const blockTotal = chapter.blocks.filter((block) => isCompletableBlock(block)).length;
      return {
        id: chapter.id,
        slug: chapter.slug,
        title: chapter.title,
        order: chapter.order,
        status: progress?.status ?? ("NOT_STARTED" as const),
        locked: lockedIds.has(chapter.id),
        blocksCompleted: progress?.blocksCompleted ?? 0,
        blocksTotal: progress?.blocksTotal ?? blockTotal,
        score: progress?.score ?? 0,
        maxScore: progress?.maxScore ?? 0,
        timeSpentSeconds: progress?.timeSpentSeconds ?? 0,
        startedAt: progress?.startedAt?.toISOString() ?? null,
        completedAt: progress?.completedAt?.toISOString() ?? null,
        requiresReview: chapter.blocks.some((block) => block.type === "OPEN_QUESTION"),
        pendingReviews: chapterResponses.filter((response) => response.status === "PENDING_REVIEW").length,
      };
    });
    return {
      id: module.id,
      order: module.order,
      title: module.title,
      completedCount: chapters.filter((chapter) => chapter.status === "COMPLETED").length,
      openByDefault:
        module.id === currentChapterRow?.module.id ||
        module.chapters.some((chapter) => pendingChapterIds.has(chapter.id)),
      chapters,
    };
  });

  const submissions = latestResponses.map((response) => {
    const preview = submissionPreview(
      response.block.type,
      response.block.config,
      response.payload
    );
    return {
      id: response.id,
      blockId: response.blockId,
      type: response.block.type,
      moduleTitle: response.block.chapter.module?.title ?? "Course",
      chapterTitle: response.block.chapter.title,
      prompt: preview.prompt,
      answer: preview.answer,
      status: response.status,
      isCorrect: response.isCorrect,
      score: response.score,
      maxScore: response.maxScore,
      attempt: response.attempt,
      submittedAt: response.submittedAt.toISOString(),
      feedback: response.review?.feedback?.trim() || null,
      reviewHref: response.block.type === "OPEN_QUESTION" ? `/review/${response.id}` : null,
      historyCount: attemptsByBlock.get(response.blockId) ?? 1,
    };
  });

  const evidence = latestResponses.flatMap<ProjectEvidence>((response) => {
    if (response.block.type !== "OPEN_QUESTION") return [];
    const config = OpenQuestionConfigSchema.safeParse(response.block.config);
    if (!config.success) return [];
    const payload = readOpenQuestionPayload(response.payload);
    if (!payload.url) return [];
    const url = evidenceUrlParts(payload.url);
    if (!url) return [];
    const presentation = openQuestionUrlPresentation(config.data);
    return [{
      id: response.id,
      type: classifyProjectEvidence({
        prompt: config.data.prompt,
        label: presentation.urlLabel,
        hint: presentation.urlHint,
        submissionMode: config.data.submissionMode,
        url: url.url,
      }),
      chapterTitle: response.block.chapter.title,
      prompt: config.data.prompt,
      label: presentation.urlLabel,
      url: url.url,
      hostname: url.hostname,
      displayPath: url.displayPath,
      explanation: payload.text || null,
      attempt: response.attempt,
      submittedAt: response.submittedAt.toISOString(),
      status: response.status,
      feedback: response.review?.feedback?.trim() || null,
      reviewHref: `/review/${response.id}`,
    }];
  });

  const help = helpRows.map((thread) => ({
    id: thread.id,
    chapterTitle: thread.chapter?.title ?? "General course question",
    preview: thread.messages[0]?.body ?? "No message yet",
    updatedAt: thread.updatedAt.toISOString(),
    status: thread.status,
    href: `/help/${thread.id}`,
  }));

  const attention = buildAttention({
    latestResponses,
    help,
    progressRows,
    courseStructure,
    lastActiveAt: enrollment.lastActiveAt,
  });

  const timeline = buildTimeline(responseRows);
  const totalSeconds = progressRows.reduce((sum, row) => sum + row.timeSpentSeconds, 0);
  const currentChapter = currentChapterRow?.chapter ?? null;
  const currentModule = currentChapterRow?.module ?? null;
  const lastActiveLabel = formatActivity(enrollment.lastActiveAt);
  const firstPending = latestResponses.find((response) => response.status === "PENDING_REVIEW");

  return {
    course: args.course,
    mentee: {
      id: enrollment.user.id,
      name: enrollment.user.name ?? enrollment.user.email ?? "Mentee",
      email: enrollment.user.email,
    },
    track: summarizeLearnerTrack(resolveCourseFamily(courseStructure?.familySlug, courseStructure?.variantFamily), enrollment),
    enrollment: {
      id: enrollment.id,
      status: enrollment.status,
      percentComplete: enrollment.percentComplete,
      chaptersCompleted: enrollment.chaptersCompleted,
      chapterCount: orderedChapterIds.length,
      totalScore: enrollment.totalScore,
      maxScore: enrollment.maxScore,
      pendingReviews: enrollment.pendingReviews,
      lastActiveAt: enrollment.lastActiveAt?.toISOString() ?? null,
      lastActiveLabel,
      currentChapter: currentChapter?.title ?? null,
      currentChapterDetail: currentChapter
        ? `${currentModule ? `Module ${String(currentModule.order).padStart(2, "0")} · ${currentModule.title}` : "Course"}`
        : null,
      studyWeekSeconds: study.weekSeconds,
      studyTotalSeconds: totalSeconds,
      openHelpCount: help.filter((item) => item.status === "OPEN").length,
    },
    reviewNextHref: firstPending ? `/review/${firstPending.id}` : null,
    attention,
    evidence,
    modules,
    submissions,
    timeline,
    help,
    sessions: sessionRows.map((session) => ({
      id: session.id,
      chapterTitle: session.chapter.title,
      status: session.status,
      activeSeconds: session.activeSeconds,
      startedAt: session.startedAt.toISOString(),
    })),
    reflections: buildReflections(progressRows, courseStructure),
    integrity,
  };
}

function buildReflections(
  progressRows: Array<{ chapterId: string; learningLog: unknown }>,
  courseStructure: {
    modules: Array<{ title: string; chapters: Array<{ id: string; title: string }> }>;
  } | null
): EvaluationReflection[] {
  const chapterMeta = new Map(
    (courseStructure?.modules ?? []).flatMap((module) =>
      module.chapters.map((chapter) => [chapter.id, { title: chapter.title, moduleTitle: module.title }] as const)
    )
  );
  return progressRows.flatMap((row) => {
    const log = parseLearningLog(row.learningLog);
    const checklist = Object.entries(log.checklist ?? {}).map(([id, entry]) => ({
      id,
      checked: entry.checked,
    }));
    const answers = Object.entries(log.answers)
      .map(([id, entry]) => ({ id, text: entry.text.trim() }))
      .filter((item) => item.text.length > 0);
    if (checklist.length === 0 && answers.length === 0) return [];
    const meta = chapterMeta.get(row.chapterId);
    return [{
      chapterId: row.chapterId,
      chapterTitle: meta?.title ?? "Chapter",
      moduleTitle: meta?.moduleTitle ?? "Course",
      checklist,
      answers,
    }];
  });
}

function readOpenQuestionPayload(payload: unknown): { text: string; url: string } {
  if (!payload || typeof payload !== "object") return { text: "", url: "" };
  const row = payload as Record<string, unknown>;
  return {
    text: typeof row.text === "string" ? row.text.trim() : "",
    url: typeof row.url === "string" ? row.url.trim() : "",
  };
}

function buildAttention(args: {
  latestResponses: Array<{
    id: string;
    status: string;
    isCorrect: boolean | null;
    block: { chapterId: string; chapter: { title: string } };
  }>;
  help: Array<{ id: string; status: string; chapterTitle: string; href: string }>;
  progressRows: Array<{
    chapterId: string;
    status: string;
    timeSpentSeconds: number;
    startedAt: Date | null;
  }>;
  courseStructure: {
    modules: Array<{ chapters: Array<{ id: string; title: string; estimatedMinutes: number | null }> }>;
  };
  lastActiveAt: Date | null;
}): EvaluationAttention[] {
  const items: EvaluationAttention[] = [];
  for (const response of args.latestResponses) {
    if (response.status === "PENDING_REVIEW") {
      items.push({ id: `review-${response.id}`, kind: "review", title: "Submission waiting for review", detail: response.block.chapter.title, href: `/review/${response.id}`, action: "Review" });
    } else if (response.status === "NEEDS_REVISION") {
      items.push({ id: `revision-${response.id}`, kind: "revision", title: "Revision requested; no newer attempt yet", detail: response.block.chapter.title, href: `/review/${response.id}`, action: "View feedback" });
    } else if (response.status === "AUTO_GRADED" && response.isCorrect === false) {
      items.push({ id: `incorrect-${response.id}`, kind: "incorrect", title: "Recent answer was incorrect", detail: response.block.chapter.title, href: "#submissions", action: "Inspect answer" });
    }
  }
  for (const thread of args.help.filter((item) => item.status === "OPEN")) {
    items.push({ id: `help-${thread.id}`, kind: "help", title: copy.evaluationOpenItem, detail: thread.chapterTitle, href: thread.href, action: "Reply" });
  }
  const chapterById = new Map(
    args.courseStructure.modules.flatMap((module) => module.chapters.map((chapter) => [chapter.id, chapter] as const))
  );
  for (const progress of args.progressRows) {
    const chapter = chapterById.get(progress.chapterId);
    const expected = (chapter?.estimatedMinutes ?? 0) * 60;
    if (progress.status === "IN_PROGRESS" && expected > 0 && progress.timeSpentSeconds > Math.max(7200, expected * 3)) {
      items.push({ id: `stalled-${progress.chapterId}`, kind: "stalled", title: "Chapter is taking longer than expected", detail: `${chapter?.title ?? "Chapter"} · recorded time is over 3× the estimate`, href: "#progress", action: "View progress" });
    }
  }
  if (args.lastActiveAt && Date.now() - args.lastActiveAt.getTime() > INACTIVE_DAYS * 86400000) {
    items.push({ id: "inactive", kind: "inactive", title: "No recent activity", detail: `Last active ${args.lastActiveAt.toLocaleDateString()}`, href: "#activity", action: "View activity" });
  }
  return items.slice(0, 20);
}

function buildTimeline(
  responses: Array<{
    id: string;
    attempt: number;
    submittedAt: Date;
    score: number | null;
    maxScore: number | null;
    block: { type: string; chapter: { title: string } };
    review: { verdict: string; feedback: string; score: number | null; createdAt: Date } | null;
  }>
): FeedbackEvent[] {
  return responses
    .flatMap<FeedbackEvent>((response) => {
      const events: FeedbackEvent[] = [{
        id: `submitted-${response.id}`,
        occurredAt: response.submittedAt.toISOString(),
        chapterTitle: response.block.chapter.title,
        attempt: response.attempt,
        kind: "submission",
        title: `${response.block.type.toLowerCase().replace(/_/g, " ")} submitted`,
        detail: null,
        verdict: null,
        score: response.maxScore ? `${response.score ?? 0}/${response.maxScore}` : null,
        href: `/review/${response.id}`,
      }];
      if (response.review) {
        events.push({
          id: `review-${response.id}`,
          occurredAt: response.review.createdAt.toISOString(),
          chapterTitle: response.block.chapter.title,
          attempt: response.attempt,
          kind: "review",
          title: response.review.verdict === "NEEDS_REVISION" ? "Revision requested" : "Submission approved",
          detail: response.review.feedback,
          verdict: response.review.verdict,
          score: response.review.score == null ? null : String(response.review.score),
          href: `/review/${response.id}`,
        });
      }
      return events;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 80);
}

function formatActivity(value: Date | null) {
  if (!value) return "Not started";
  const minutes = Math.round((Date.now() - value.getTime()) / 60000);
  if (minutes < 2) return "Active just now";
  if (minutes < 60) return `Active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Active ${hours} h ago`;
  return `Last active ${value.toLocaleDateString()}`;
}
