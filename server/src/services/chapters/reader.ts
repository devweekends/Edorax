import type { ChapterReaderView } from "../../shared/api/reader.js";
import { applyTokens, contentTokenValues } from "../../shared/lib/content-tokens.js";
import { buildCourseTrack } from "../../shared/lib/course-tracks.js";
import { learningLogToAnswers, learningLogToChecklist, parseLearningLog } from "../../shared/lib/learning-log.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { shouldBypassProgressGating } from "../auth/seed-access.js";
import { requireBlockSubmissionAccess } from "../enrollment/api-learn-access.js";
import { loadChapterThread } from "../help/threads.js";
import { serializeHelpThread } from "../help/serialize.js";
import { chapterChecksLine, chapterNextLine, chapterOpenLine, latestChapterResponses } from "../progress/chapter-recap.js";
import { ensureChapterStarted } from "../progress/compute.js";
import { syllabusForEnrollment } from "../progress/enrollment-syllabus.js";
import { loadCourseGate } from "../progress/gate.js";
import { loadLearnerHabit } from "../progress/learner-habit.js";
import { milestoneReflectionBlocked } from "../progress/reflection.js";
import { isCompletableBlock, previousChapterId } from "../progress/rules.js";
import { releaseForEnrollment, releaseModulesWithBlocks, upgradeEnrollmentToRelease, variantForRelease } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { findChapterIndex } from "./chapter-slug.js";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Everything the chapter reader shows for the signed-in learner. Opening an
 * unlocked chapter also starts it and marks pending review feedback as seen.
 */
export async function loadChapterReader(courseSlug: string, chapterSlug: string, user: SessionUser, retry = 0, forDownload = false): Promise<ChapterReaderView> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      projectGoal: true,
      sequential: true,
      familySlug: true,
      variantFamily: true,
      activeReleaseId: true,
      modules: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          chapters: {
            where: { archivedAt: null, publishedAt: { not: null } },
            orderBy: { order: "asc" },
            select: {
              id: true,
              slug: true,
              title: true,
              order: true,
              isMilestone: true,
              estimatedMinutes: true,
              readerMode: true,
              blocks: { where: { archivedAt: null }, select: { type: true, required: true, archivedAt: true } },
            },
          },
        },
      },
    },
  });
  if (!course) throw new NotFoundError("Course not found");

  const enrollment = await requireBlockSubmissionAccess(course.id, user);

  // If the requested chapter is from a newer release, upgrade in-progress learners seamlessly.
  const currentRelease = await releaseForEnrollment(course.id, enrollment, course.familySlug);
  const inCurrentRelease = !currentRelease || currentRelease.modules.some(m => m.chapters.some(c => c.slug === chapterSlug));

  if (!forDownload && !inCurrentRelease && course.activeReleaseId && enrollment.releaseId !== course.activeReleaseId && enrollment.status !== "COMPLETED") {
    const upgraded = await prisma.$transaction((tx) =>
      upgradeEnrollmentToRelease(tx, enrollment.id, course.activeReleaseId!), { timeout: 60_000 });
    if (upgraded) enrollment.releaseId = course.activeReleaseId;
  }

  const bypassLocking = shouldBypassProgressGating(user);
  const selectedRelease = await releaseForEnrollment(course.id, enrollment, course.familySlug);
  const courseModules = selectedRelease ? await releaseModulesWithBlocks(selectedRelease.modules) : course.modules;

  const flatChapters = courseModules.flatMap((mod) =>
    mod.chapters.map((ch) => ({
      ...ch,
      moduleTitle: mod.title,
      moduleOrder: mod.order,
      blockCount: ch.blocks.filter((block) => isCompletableBlock(block)).length,
    }))
  );
  const index = findChapterIndex(flatChapters, chapterSlug);
  if (index === -1) throw new NotFoundError("Chapter not found");

  const chapter = flatChapters[index]!;
  const prev = flatChapters[index - 1];
  const next = flatChapters[index + 1];
  const link = (c: typeof chapter | undefined) =>
    c ? { slug: c.slug, title: c.title, moduleOrder: c.moduleOrder, order: c.order } : null;

  const [gate, syllabus] = await Promise.all([
    loadCourseGate(course.id, enrollment.id, { bypassLocking }),
    syllabusForEnrollment({ ...course, modules: courseModules }, enrollment.id, bypassLocking),
  ]);
  const { modules } = syllabus;

  const base = {
    course: { id: course.id, slug: course.slug, title: course.title, projectGoal: course.projectGoal },
    chapter: {
      id: chapter.id,
      slug: chapter.slug,
      title: chapter.title,
      lessonLabel: `${pad(chapter.moduleOrder)}.${pad(chapter.order)}`,
      estimatedMinutes: chapter.estimatedMinutes,
      readerMode: chapter.readerMode,
      isMilestone: chapter.isMilestone,
      blockCount: chapter.blockCount,
    },
    prev: link(prev),
    next: link(next),
    modules,
    track: buildCourseTrack(course.variantFamily ? resolveCourseFamily(course.familySlug, course.variantFamily) : course.familySlug, enrollment),
  };

  const locked = !bypassLocking && (gate?.lockedIds.has(chapter.id) ?? false);
  if (locked) {
    const prevId = previousChapterId(gate?.orderedIds ?? [], chapter.id);
    const previous = (prevId ? flatChapters.find((c) => c.id === prevId) : prev) ?? null;
    return { ...base, locked: true, previous: previous ? { slug: previous.slug, title: previous.title } : null, content: null };
  }

  if (!forDownload) {
    try {
      await prisma.$transaction(async tx => { await ensureChapterStarted(tx, enrollment.id, chapter.id); });
    } catch (error) {
      if (error instanceof NotFoundError && retry === 0) return loadChapterReader(courseSlug, chapterSlug, user, 1);
      throw error;
    }
  }
  const startedEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  const expectedVariant = variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), enrollment.variantSlug);
  if (retry === 0 && (expectedVariant !== variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), startedEnrollment.variantSlug) ||
      (selectedRelease && selectedRelease.release.id !== startedEnrollment.releaseId))) {
    return loadChapterReader(courseSlug, chapterSlug, user, 1, forDownload);
  }

  const [content, currentProgress, helpThreadRow, habit, chapterResponses, predictBlocks, headingNotes, existingRating, highlights] = await Promise.all([
    prisma.chapter.findUnique({ where: { id: chapter.id }, select: { compiled: true, source: true } }),
    prisma.chapterProgress.findUnique({
      where: { enrollmentId_chapterId: { enrollmentId: enrollment.id, chapterId: chapter.id } },
      select: { learningLog: true, status: true, blocksCompleted: true, blocksTotal: true },
    }),
    loadChapterThread(user.id, chapter.id),
    loadLearnerHabit(user.id),
    prisma.response.findMany({
      where: { userId: user.id, enrollmentId: enrollment.id, status: { not: "DRAFT" }, block: { chapterId: chapter.id } },
      orderBy: { attempt: "desc" },
      select: { blockId: true, status: true, isCorrect: true },
    }),
    prisma.block.findMany({
      where: { chapterId: chapter.id, archivedAt: null, type: "PREDICT", required: true },
      select: { id: true },
    }),
    prisma.headingNote.findMany({ where: { userId: user.id, chapterId: chapter.id }, select: { headingId: true, body: true } }),
    prisma.courseRating.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: user.id } },
      select: { id: true },
    }),
    prisma.chapterHighlight.findMany({ where: { userId: user.id, chapterId: chapter.id }, select: { id: true, color: true, quote: true, prefix: true, suffix: true, occurrence: true, note: true } }),
  ]);
  if (!content) throw new NotFoundError("Chapter not found");

  if (!forDownload) await prisma.review.updateMany({
    where: { seenAt: null, response: { userId: user.id, block: { chapterId: chapter.id } } },
    data: { seenAt: new Date() },
  });
  if (!forDownload) {
    for (const mod of modules) {
      for (const ch of mod.chapters) {
        if (ch.id === chapter.id && ch.status === "NOT_STARTED") ch.status = "IN_PROGRESS";
      }
    }
  }

  // Placeholders resolve per learner at read time; the stored snapshot keeps them.
  const source = applyTokens(content.compiled ?? content.source, contentTokenValues(resolveCourseFamily(course.familySlug, course.variantFamily), startedEnrollment.variantSlug));
  const log = parseLearningLog(currentProgress?.learningLog);
  const chapterComplete = currentProgress?.status === "COMPLETED";
  const checkpointsCompleted = currentProgress?.blocksCompleted ?? 0;
  const checkpointsTotal = chapter.blockCount;
  const remaining = checkpointsTotal - checkpointsCompleted;
  const reflectionPending =
    chapter.isMilestone && !chapterComplete && remaining <= 0 && milestoneReflectionBlocked(source, currentProgress?.learningLog);
  const latest = latestChapterResponses(chapterResponses);
  const answeredIds = new Set(latest.map((response) => response.blockId));
  const predictGate = predictBlocks.length > 0;
  const moreThanHalfComplete =
    startedEnrollment.status === "COMPLETED" ||
    startedEnrollment.percentComplete > 50 ||
    (flatChapters.length > 0 && startedEnrollment.chaptersCompleted * 2 > flatChapters.length);
  const promptCourseRating =
    !forDownload &&
    moreThanHalfComplete &&
    !chapterComplete &&
    !existingRating &&
    !startedEnrollment.ratingDismissedAt;

  return {
    ...base,
    track: buildCourseTrack(course.variantFamily ? resolveCourseFamily(course.familySlug, course.variantFamily) : course.familySlug, startedEnrollment),
    locked: false,
    previous: null,
    content: {
      source,
      learningLogAnswers: learningLogToAnswers(log),
      checklistState: learningLogToChecklist(log),
      chapterComplete,
      canMarkComplete: !chapterComplete && remaining <= 0 && !reflectionPending,
      checkpointsCompleted,
      checkpointsTotal,
      nextLocked: !bypassLocking && course.sequential && !chapterComplete && Boolean(next),
      reflectionPending,
      recap: {
        checks: chapterChecksLine(checkpointsCompleted, checkpointsTotal),
        open: chapterOpenLine(latest),
        next: chapterNextLine(next?.title),
      },
      streakMilestone: habit.streakMilestone,
      headingNotes: Object.fromEntries(headingNotes.map((note) => [note.headingId, note.body])),
      highlights: highlights.map((h) => ({ id: h.id, color: h.color, quote: h.quote, prefix: h.prefix, suffix: h.suffix, occurrence: h.occurrence, note: h.note })),
      predictGate,
      predictRevealed: !predictGate || predictBlocks.every((block) => answeredIds.has(block.id)),
      helpThread: serializeHelpThread(helpThreadRow),
      promptCourseRating,
    },
  };
}
