import { logger } from "../../utils/logger.js";
import {
  prepareChapterBlockSync,
  syncChapterBlocksFromSource,
} from "../teach/sync-blocks.js";
import { cameraPhotosAvailable } from "../integrity/snapshot-store.js";
import type { QuizChapterState } from "../../shared/api/blocks.js";
import { QuizConfigSchema } from "../../shared/blocks/quiz/schema.js";
import {
  applyTokens,
  contentTokenValues,
  hasContentTokens,
} from "../../shared/lib/content-tokens.js";
import { prisma } from "../../db/prisma.js";
import { releaseContainsChapter } from "../courses/releases.js";
import { NotFoundError } from "../../utils/errors.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { calculateQuizAssessment } from "../progress/quiz-assessment.js";
import { visibleExplanation } from "../../shared/lib/quiz-feedback.js";

const QUIZ_STEP_TYPES = ["QUIZ", "OPEN_QUESTION", "PREDICT", "CODE"] as const;

function findQuizBlocks(chapterId: string) {
  return prisma.block.findMany({
    where: { chapterId, archivedAt: null, type: { in: [...QUIZ_STEP_TYPES] } },
    orderBy: { order: "asc" },
    select: { id: true, type: true, config: true },
  });
}

/** Writes block rows from the draft text of a chapter whose course was never published. Never touches a published course. */
async function syncUnpublishedQuiz(
  chapterId: string,
  courseId: string,
  source: string,
): Promise<boolean> {
  if (!source.trim()) return false;
  const release = await prisma.courseRelease.findFirst({
    where: { courseId },
    select: { id: true },
  });
  if (release) return false;
  try {
    await syncChapterBlocksFromSource(chapterId, source);
    return true;
  } catch (error) {
    logger.warn(
      { err: error, chapterId },
      "[quiz] could not write the question blocks from the chapter text",
    );
    return false;
  }
}

/**
 * Why a quiz chapter has no questions, with the facts behind it. A learner is pinned to the course
 * release they started on, so questions added later can be missing from their copy even though the
 * mentor sees them in the builder.
 */
async function explainEmptyQuiz(
  chapterId: string,
  courseId: string,
  releaseId: string | null,
  chapter: { title: string; source: string; courseSlug: string },
): Promise<string> {
  const [byType, archived, current, latest] = await Promise.all([
    prisma.block.groupBy({
      by: ["type"],
      where: { chapterId, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.block.count({ where: { chapterId, archivedAt: { not: null } } }),
    releaseId
      ? prisma.courseRelease.findUnique({
          where: { id: releaseId },
          select: { number: true },
        })
      : Promise.resolve(null),
    prisma.courseRelease.findFirst({
      where: { courseId },
      orderBy: { number: "desc" },
      select: { number: true },
    }),
  ]);
  const active = byType.reduce((sum, row) => sum + row._count._all, 0);
  let inText = 0;
  try {
    inText = prepareChapterBlockSync(chapter.source).extracted.length;
  } catch {
    inText = 0;
  }
  const builder = `/courses/${chapter.courseSlug}/chapters/${chapterId}/edit`;
  let reason: string;
  if (current && latest && current.number < latest.number)
    reason = `Your copy of this course is release ${current.number} and the newest is release ${latest.number}. Questions added after release ${current.number} are not in your copy.`;
  else if (active > 0)
    reason = `This chapter has ${active} activities but none of them is a quiz question.`;
  else if (archived > 0)
    reason = `All ${archived} questions in this chapter were archived.`;
  else if (inText > 0)
    reason = `The text of this chapter has ${inText} question blocks but they could not be saved as questions. See the server log.`;
  else
    reason = `The text of the chapter "${chapter.title}" has no question blocks. The questions may be in a different chapter. Open this one in the builder: ${builder}`;
  const blocks =
    byType.map((row) => `${row.type} ${row._count._all}`).join(", ") || "none";
  return `${reason} Facts: chapter id ${chapterId}, blocks ${blocks}, archived ${archived}, question blocks in the text ${inText}, your release ${current?.number ?? "none"}, newest release ${latest?.number ?? "none"}.`;
}

function explainNoCamera(snapshotsOn: boolean): string | undefined {
  if (!snapshotsOn)
    return "Camera photos are turned off in this course's settings.";
  if (!cameraPhotosAvailable())
    return "Camera photos are on for this course, but this server cannot store or sign them. In production it needs photo storage and INTEGRITY_MEDIA_SECRET.";
  return undefined;
}

/** Initial state for a quiz-mode chapter's wizard: last answers, grades and the score once every question is attempted. */
export async function loadQuizChapterState(
  chapterId: string,
  userId: string,
): Promise<QuizChapterState> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      courseId: true,
      quizPassingScore: true,
      title: true,
      source: true,
      course: {
        select: {
          slug: true,
          familySlug: true,
          variantFamily: true,
          integrityMode: true,
          integritySnapshots: true,
        },
      },
    },
  });

  if (!chapter) throw new NotFoundError("Chapter not found");
  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: chapter.courseId, userId } },
    select: { id: true, releaseId: true, variantSlug: true },
  });
  if (
    enrollment &&
    !(await releaseContainsChapter(
      chapter.courseId,
      enrollment,
      chapter.course.familySlug,
      chapterId,
    ))
  )
    throw new NotFoundError("Chapter not found");
  let blocks = await findQuizBlocks(chapterId);
  // A chapter of a course that was never published takes its questions from its draft text. If the text
  // has question blocks but their rows were never written, write them with the same sync a save runs.
  if (
    blocks.length === 0 &&
    (await syncUnpublishedQuiz(chapterId, chapter.courseId, chapter.source))
  )
    blocks = await findQuizBlocks(chapterId);
  const emptyReason =
    blocks.length === 0
      ? await explainEmptyQuiz(
          chapterId,
          chapter.courseId,
          enrollment?.releaseId ?? null,
          {
            title: chapter.title,
            source: chapter.source,
            courseSlug: chapter.course.slug,
          },
        )
      : undefined;
  // Learners only get a short, friendly message. The full explanation goes to the server log,
  // so mentors and developers can still see exactly why the quiz is empty.
  if (emptyReason)
    logger.warn(
      { chapterId, emptyReason },
      "[quiz] this chapter has no questions to show",
    );
  const steps: QuizChapterState["steps"] = blocks.map((block) => ({
    id: block.id,
    type: block.type as QuizChapterState["steps"][number]["type"],
  }));
  const quizBlocks = blocks.filter((block) => block.type === "QUIZ");
  const blockIds = quizBlocks.map((block) => block.id);
  const responses = await prisma.response.findMany({
    where: {
      blockId: { in: blocks.map((block) => block.id) },
      userId,
      status: { not: "DRAFT" },
    },
    orderBy: { attempt: "desc" },
  });
  const latestByBlock = new Map<string, (typeof responses)[number]>();
  for (const response of responses) {
    if (!latestByBlock.has(response.blockId))
      latestByBlock.set(response.blockId, response);
  }
  const selectedFor = (blockId: string) => {
    const payload = latestByBlock.get(blockId)?.payload as
      | { selected?: unknown }
      | undefined;
    return Array.isArray(payload?.selected)
      ? payload.selected.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
  };

  const tokens = quizBlocks.some((block) =>
    hasContentTokens(JSON.stringify(block.config)),
  )
    ? await learnerTokenValues(chapterId, userId)
    : null;
  const chapterComplete = enrollment
    ? (
        await prisma.chapterProgress.findUnique({
          where: {
            enrollmentId_chapterId: { enrollmentId: enrollment.id, chapterId },
          },
          select: { status: true },
        })
      )?.status === "COMPLETED"
    : false;
  const assessment = calculateQuizAssessment({
    blocks,
    responses: [...latestByBlock.values()].map((response) => ({
      blockId: response.blockId,
      status: response.status,
      score: response.score,
      maxScore: response.maxScore,
    })),
    passingScore: chapter.quizPassingScore,
  });
  // A finished submission may show every option's explanation and the right answer.
  const revealAll = chapterComplete || assessment?.passed === true;

  const initialBlockGrades: QuizChapterState["initialBlockGrades"] = {};
  for (const block of quizBlocks) {
    const response = latestByBlock.get(block.id);
    if (!response) continue;
    const parsed = QuizConfigSchema.safeParse(block.config);
    const selected = selectedFor(block.id);
    const reveal =
      revealAll ||
      response.isCorrect === true ||
      (parsed.success && parsed.data.allowRetry === false);
    // Same rule as single quiz blocks: a wrong answer only reveals the lines about what was picked.
    const explanation = parsed.success
      ? visibleExplanation({
          explanation: parsed.data.explanation,
          options: parsed.data.options,
          selected,
          isCorrect: response.isCorrect,
          allowRetry: reveal ? false : parsed.data.allowRetry,
        })
      : undefined;
    initialBlockGrades[block.id] = {
      selected,
      isCorrect: response.isCorrect,
      explanation:
        explanation && tokens ? applyTokens(explanation, tokens) : explanation,
      ...(reveal && parsed.success
        ? { correctOptionIds: parsed.data.correctOptionIds }
        : {}),
    };
  }

  const allAttempted = blockIds.every((blockId) => latestByBlock.has(blockId));
  return {
    steps,
    blockIds,
    initialAnswers: Object.fromEntries(
      blockIds.map((blockId) => [blockId, selectedFor(blockId)]),
    ),
    initialBlockGrades,
    integrityMode: chapter.course.integrityMode,
    integrityCamera:
      chapter.course.integritySnapshots && cameraPhotosAvailable(),
    integrityCameraReason: explainNoCamera(chapter.course.integritySnapshots),
    emptyReason,
    initialScoreSummary:
      blockIds.length > 0 && allAttempted
        ? {
            score: blockIds.reduce(
              (total, id) => total + (latestByBlock.get(id)?.score ?? 0),
              0,
            ),
            maxScore: blockIds.reduce(
              (total, id) => total + (latestByBlock.get(id)?.maxScore ?? 0),
              0,
            ),
            questions: blockIds.length,
          }
        : null,
    assessment,
  };
}

/** The learner's placeholder values, looked up only when a quiz actually uses a placeholder. */
async function learnerTokenValues(chapterId: string, userId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, archivedAt: null },
    select: {
      courseId: true,
      course: { select: { familySlug: true, variantFamily: true } },
    },
  });
  const enrollment = chapter?.course.familySlug
    ? await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: chapter.courseId, userId } },
        select: { variantSlug: true },
      })
    : null;
  return contentTokenValues(
    resolveCourseFamily(
      chapter?.course.familySlug,
      chapter?.course.variantFamily,
    ),
    enrollment?.variantSlug,
  );
}
