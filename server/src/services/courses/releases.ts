import { ulid } from "ulid";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { resolveCourseFamily, type CourseFamily } from "../../shared/lib/course-tracks.js";
import { NotFoundError } from "../../utils/errors.js";
import { cleanChapterSlug } from "../chapters/chapter-slug.js";
import { recomputeEnrollmentRollup } from "../progress/compute.js";
import { canonical } from "../teach/course-update-matching.js";

export { cleanChapterSlug } from "../chapters/chapter-slug.js";

export type ReleaseChapter = {
  id: string; key: string | null; slug: string; title: string; order: number;
  estimatedMinutes: number | null; readerMode: "DEFAULT" | "QUIZ"; isMilestone: boolean;
  quizPassingScore: number;
};
export type ReleaseModule = { id: string; key: string | null; title: string; order: number; chapters: ReleaseChapter[] };
export type ReleaseContent = { variants: Record<string, ReleaseModule[]> };

export function variantForRelease(familySlug: string | CourseFamily | null, variantSlug: string | null): string {
  return variantSlug ?? (typeof familySlug === "object" && familySlug ? familySlug : resolveCourseFamily(familySlug))?.defaultVariantSlug ?? "default";
}

export async function snapshotLiveCourse(tx: Prisma.TransactionClient, courseId: string, familySlug: string | null): Promise<ReleaseContent> {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { status: true, variantFamily: true } });
  const modules = await tx.module.findMany({
    where: { courseId, archivedAt: null }, orderBy: { order: "asc" },
    include: { chapters: { where: { archivedAt: null, ...(course.status === "DRAFT" ? {} : { publishedAt: { not: null } }) }, orderBy: { order: "asc" } } },
  });
  const contentModules: ReleaseModule[] = modules.map(module => ({
    id: module.id, key: module.contentKey, title: module.title, order: module.order,
    chapters: module.chapters.map(chapter => ({ id: chapter.id, key: chapter.contentKey, slug: chapter.slug,
      title: chapter.title, order: chapter.order, estimatedMinutes: chapter.estimatedMinutes,
      readerMode: chapter.readerMode, quizPassingScore: chapter.quizPassingScore, isMilestone: chapter.isMilestone })),
  }));
  const variants = resolveCourseFamily(familySlug, course.variantFamily)?.variants.map(variant => variant.slug) ?? ["default"];
  return { variants: Object.fromEntries(variants.map(slug => [slug, contentModules])) };
}

/** Called inside a publish transaction, before any live-row edits. */
export async function ensureBaselineRelease(tx: Prisma.TransactionClient, courseId: string) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
  if (course.activeReleaseId) return tx.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const content = await snapshotLiveCourse(tx, courseId, course.familySlug);
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: 1, content: content as unknown as Prisma.InputJsonValue } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  // Existing learners who have begun work keep this baseline after publication.
  await tx.enrollment.updateMany({ where: { courseId, releaseId: null,
    OR: [{ startedAt: { not: null } }, { variantLockedAt: { not: null } }, { chapterProgress: { some: {} } }] },
    data: { releaseId: release.id } });
  const family = resolveCourseFamily(course.familySlug, course.variantFamily);
  if (family) {
    const begun = { OR: [{ startedAt: { not: null } }, { chapterProgress: { some: {} } }] };
    await tx.enrollment.updateMany({ where: { courseId, variantSlug: null, ...begun },
      data: { variantSlug: family.defaultVariantSlug, variantChosenAt: new Date() } });
    await tx.enrollment.updateMany({ where: { courseId, variantLockedAt: null, ...begun },
      data: { variantLockedAt: new Date() } });
  }
  return release;
}

/** Prefer the learner's variant; fall back when a release dropped it or they hold a retired slug. */
export function resolveVariantInRelease(
  content: ReleaseContent,
  family: CourseFamily | null,
  variantSlug: string | null
): string {
  const requested = variantForRelease(family, variantSlug);
  const fallback = family?.defaultVariantSlug ?? "default";
  const variant = content.variants[requested] ? requested
    : content.variants[fallback] ? fallback
    : Object.keys(content.variants)[0];
  if (!variant || !content.variants[variant]) throw new NotFoundError("Course variant not found in this release.");
  return variant;
}

export async function releaseForEnrollment(courseId: string, enrollment: { releaseId: string | null; variantSlug: string | null }, familySlug: string | null) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, variantFamily: true } });
  const releaseId = enrollment.releaseId ?? course.activeReleaseId;
  if (!releaseId) return null;
  const release = await prisma.courseRelease.findFirst({ where: { id: releaseId, courseId } });
  if (!release) throw new NotFoundError("Course release not found.");
  const content = release.content as unknown as ReleaseContent;
  const family = resolveCourseFamily(familySlug, course.variantFamily);
  const variant = resolveVariantInRelease(content, family, enrollment.variantSlug);
  return { release, variant, modules: content.variants[variant]! };
}

/** Build the existing syllabus shape from a pinned release. Chapter and block rows are immutable once referenced. */
export async function releaseModulesWithBlocks(modules: ReleaseModule[]) {
  const ids = modules.flatMap(module => module.chapters.map(chapter => chapter.id));
  const rows = await prisma.chapter.findMany({ where: { id: { in: ids } }, select: {
    id: true, blocks: { where: { archivedAt: null }, select: { id: true, type: true, required: true, archivedAt: true } },
  } });
  const byId = new Map(rows.map(row => [row.id, row.blocks]));
  return modules.map(module => ({ ...module, chapters: module.chapters.map(chapter => ({ ...chapter, blocks: byId.get(chapter.id) ?? [] })) }));
}

export async function releaseContainsChapter(courseId: string, enrollment: { releaseId: string | null; variantSlug: string | null }, familySlug: string | null, chapterId: string) {
  const selected = await releaseForEnrollment(courseId, enrollment, familySlug);
  return !selected || selected.modules.some(module => module.chapters.some(chapter => chapter.id === chapterId));
}

export async function assertEnrollmentChapter(tx: Prisma.TransactionClient, enrollmentId: string, chapterId: string) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId },
    select: { courseId: true, releaseId: true, variantSlug: true, course: { select: { activeReleaseId: true, familySlug: true, variantFamily: true } } } });
  const id = enrollment.releaseId ?? enrollment.course.activeReleaseId;
  if (!id) return;
  const release = await tx.courseRelease.findFirstOrThrow({ where: { id, courseId: enrollment.courseId } });
  const content = release.content as unknown as ReleaseContent;
  const family = resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily);
  // Same fallback as releaseForEnrollment so overview/reader and chapter-start never disagree.
  const variant = resolveVariantInRelease(content, family, enrollment.variantSlug);
  const modules = content.variants[variant]!;
  if (!modules.some(module => module.chapters.some(chapter => chapter.id === chapterId))) throw new NotFoundError("Chapter is not in this learner's course release.");
}

/**
 * Forward-migrates an enrollment's progress and submitted responses from their current release
 * into a target release, preserving completed chapters, scores, learning logs, and question answers.
 */
export async function upgradeEnrollmentToRelease(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  targetReleaseId: string,
  options?: { repair?: boolean }
) {
  // Serialize concurrent overview/reader requests before checking the pinned release.
  await tx.$queryRaw`SELECT "id" FROM "Enrollment" WHERE "id" = ${enrollmentId} FOR UPDATE`;
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: {
      course: { select: { id: true, slug: true, familySlug: true, variantFamily: true, activeReleaseId: true } },
      chapterProgress: { include: { chapter: true } },
    },
  });

  if (enrollment.releaseId === targetReleaseId && !options?.repair) {
    return true;
  }

  const targetRelease = await tx.courseRelease.findUniqueOrThrow({
    where: { id: targetReleaseId, courseId: enrollment.courseId },
  });

  const content = targetRelease.content as unknown as ReleaseContent;
  const family = resolveCourseFamily(enrollment.course.familySlug, enrollment.course.variantFamily);
  const variant = resolveVariantInRelease(content, family, enrollment.variantSlug);
  const modules = content.variants[variant]!;
  const targetChapters: ReleaseChapter[] = modules.flatMap((m) => m.chapters);

  const targetById = new Map(targetChapters.map((c) => [c.id, c]));
  const targetBySlug = new Map(targetChapters.map((c) => [cleanChapterSlug(c.slug), c]));
  const targetByKey = new Map(targetChapters.filter((c) => c.key).map((c) => [c.key!, c]));

  const counterpart = (chapter: { contentKey: string | null; slug: string }) =>
    (chapter.contentKey ? targetByKey.get(chapter.contentKey) : null) ?? targetBySlug.get(cleanChapterSlug(chapter.slug));

  // A removed/renamed completed lesson cannot be represented in the target
  // syllabus. Leave the learner on the working release instead of showing 0%.
  if (enrollment.chapterProgress.some((progress) =>
    progress.status === "COMPLETED" && !targetById.has(progress.chapterId) && !counterpart(progress.chapter)
  )) return false;

  // 1. Forward-migrate ChapterProgress rows
  for (const cp of enrollment.chapterProgress) {
    if (targetById.has(cp.chapterId)) continue;

    const targetChapter = counterpart(cp.chapter);

    if (!targetChapter) continue;

    const existingTarget = await tx.chapterProgress.findUnique({
      where: { enrollmentId_chapterId: { enrollmentId, chapterId: targetChapter.id } },
    });

    if (existingTarget) {
      const isCompleted = cp.status === "COMPLETED" || existingTarget.status === "COMPLETED";
      const newStatus = isCompleted
        ? "COMPLETED"
        : cp.status === "IN_PROGRESS" || existingTarget.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED";

      await tx.chapterProgress.update({
        where: { id: existingTarget.id },
        data: {
          status: newStatus,
          blocksCompleted: Math.max(cp.blocksCompleted, existingTarget.blocksCompleted),
          blocksTotal: Math.max(cp.blocksTotal, existingTarget.blocksTotal),
          score: Math.max(cp.score, existingTarget.score),
          maxScore: Math.max(cp.maxScore, existingTarget.maxScore),
          timeSpentSeconds: Math.max(cp.timeSpentSeconds, existingTarget.timeSpentSeconds),
          startedAt: existingTarget.startedAt ?? cp.startedAt,
          completedAt: existingTarget.completedAt ?? cp.completedAt,
          learningLog: existingTarget.learningLog ?? cp.learningLog ?? undefined,
        },
      });
    } else {
      await tx.chapterProgress.create({
        data: {
          enrollmentId,
          chapterId: targetChapter.id,
          status: cp.status,
          blocksCompleted: cp.blocksCompleted,
          blocksTotal: cp.blocksTotal,
          score: cp.score,
          maxScore: cp.maxScore,
          timeSpentSeconds: cp.timeSpentSeconds,
          startedAt: cp.startedAt,
          completedAt: cp.completedAt,
          learningLog: cp.learningLog ?? undefined,
        },
      });
    }
  }

  // 2. Copy answers for unchanged blocks; original submissions remain in the old release.
  const responses = await tx.response.findMany({
    where: { enrollmentId },
    include: { block: { include: { chapter: true } }, review: true },
    orderBy: { submittedAt: "asc" },
  });

  type ChapterWithBlocks = Awaited<ReturnType<typeof tx.chapter.findUnique<{ where: { id: string }, include: { blocks: { where: { archivedAt: null }, orderBy: { order: "asc" } } } }>>>;
  const chapterCache = new Map<string, ChapterWithBlocks>();
  const getChapterWithBlocks = async (chapterId: string) => {
    if (chapterCache.has(chapterId)) return chapterCache.get(chapterId);
    const ch = await tx.chapter.findUnique({
      where: { id: chapterId },
      include: { blocks: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
    });
    chapterCache.set(chapterId, ch);
    return ch;
  };

  for (const resp of responses) {
    if (targetById.has(resp.block.chapterId)) continue;

    const oldChapter = resp.block.chapter;
    const targetChapterMeta = counterpart(oldChapter);

    if (!targetChapterMeta) continue;

    const targetChapterWithBlocks = await getChapterWithBlocks(targetChapterMeta.id);
    if (!targetChapterWithBlocks) continue;

    const oldBlock = resp.block;
    // A changed question must never inherit an answer from a different question.
    const targetBlock = targetChapterWithBlocks.blocks.find((block) =>
      block.type === oldBlock.type && block.order === oldBlock.order &&
      canonical(block.config) === canonical(oldBlock.config)
    );

    if (!targetBlock) continue;

    const existingTargetResp = await tx.response.findFirst({
      where: {
        blockId: targetBlock.id,
        userId: resp.userId,
        enrollmentId,
        attempt: resp.attempt,
      },
    });

    if (!existingTargetResp) {
      await tx.response.create({
        data: {
          blockId: targetBlock.id, userId: resp.userId, enrollmentId,
          attempt: resp.attempt, status: resp.status, payload: resp.payload as Prisma.InputJsonValue,
          score: resp.score, maxScore: resp.maxScore, isCorrect: resp.isCorrect,
          durationMs: resp.durationMs, startedAt: resp.startedAt, submittedAt: resp.submittedAt,
          ...(resp.review ? { review: { create: {
            reviewerId: resp.review.reviewerId, score: resp.review.score,
            feedback: resp.review.feedback, verdict: resp.review.verdict,
            seenAt: resp.review.seenAt, createdAt: resp.review.createdAt,
          } } } : {}),
        },
      });
    }
  }

  // 3. Update releaseId and recalculate rollup metrics
  await tx.enrollment.update({
    where: { id: enrollmentId },
    data: { releaseId: targetReleaseId },
  });

  await recomputeEnrollmentRollup(tx, enrollmentId, { preserveActivity: true });
  return true;
}
