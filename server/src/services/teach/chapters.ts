import type { Prisma } from "../../generated/prisma/index.js";
import { isDeepStrictEqual } from "node:util";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import type { ChapterEditorView, ChapterIdResult, SavedAtResult } from "../../shared/api/teach.js";
import { TEACH_ERROR_CODES } from "../../shared/api/teach.js";
import { blockDefinitions, isRegisteredBlockType } from "../../shared/blocks/definitions.js";
import { normalizeQuizConfig } from "../../shared/blocks/quiz/schema.js";
import { collectContentTokenProblems, tokenInFieldProblem } from "../../shared/lib/content-tokens.js";
import { slugify } from "../../shared/lib/mdx-headings.js";
import { mdxComponentAllowlist } from "../../shared/mdx/component-allowlist.js";
import { collectUnknownComponents, diffBlocks } from "../../shared/mdx/extract.js";
import { collectCanvasProblems } from "../../shared/mdx/canvas-tags.js";
import { collectDiagramProblems } from "../../shared/mdx/diagram-fences.js";
import { collectLabProblems } from "../../shared/mdx/lab-tags.js";
import { blockConfigFromSource, isActivityOnlySource } from "../../shared/mdx/extract-block-config.js";
import { remarkChecklist } from "../../shared/mdx/remark-checklist.js";
import { remarkLearningLog } from "../../shared/mdx/remark-learning-log.js";
import { restoreInteractiveBlockTags } from "../../shared/mdx/restore-block-tags.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { secretFieldsWithTokens } from "../../utils/sanitize-block-config.js";
import type { SessionUser } from "../../types/auth.js";
import type { ChapterSettingsBody, CreateChapterBody, MoveDirection } from "../../validations/teach.js";
import { requireCourseById } from "./access.js";
import { applyBlockSyncPlans, planChapterBlockSync, prepareChapterBlockSync, syncChapterBlocksFromSource, type ExistingSyncBlock } from "./sync-blocks.js";
import { ensureBaselineRelease, readReleaseContent, variantForRelease } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { publishDashboardChapterRelease, publishDashboardNewChapterRelease, removeChapterFromRelease } from "./publish-course-release.js";

// Mentor-facing chapter mutations. Published edits use CourseChapterDraft;
// learners read the chapter pinned in their release until a new one is approved.

async function requireChapter(user: SessionUser, chapterId: string) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId, archivedAt: null } });
  if (!chapter) throw new NotFoundError("Chapter not found");
  const course = await requireCourseById(user, chapter.courseId);
  if ((course.status === "PUBLISHED" || course.status === "ARCHIVED") && chapter.publishedAt) {
    const active = await prisma.course.findUniqueOrThrow({ where: { id: chapter.courseId }, select: { activeReleaseId: true } });
    if (active.activeReleaseId) {
      const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: active.activeReleaseId } });
      const family = await prisma.course.findUniqueOrThrow({ where: { id: chapter.courseId },
        select: { familySlug: true, variantFamily: true } });
      const defaultSlug = variantForRelease(resolveCourseFamily(family.familySlug, family.variantFamily), null);
      const visible = (readReleaseContent(release.content).variants[defaultSlug] ?? [])
        .some(module => module.chapters.some(item => item.id === chapter.id));
      if (!visible) throw new NotFoundError("Chapter not found");
    }
  }
  return { chapter, course };
}

async function releasedChapterDraft(chapter: { id: string; courseId: string; title: string; summary: string | null;
  estimatedMinutes: number | null; readerMode: "DEFAULT" | "QUIZ"; quizPassingScore: number; isMilestone: boolean; source: string; compiled: string | null },
  status: string) {
  if (status !== "PUBLISHED" && status !== "ARCHIVED") return null;
  const release = await prisma.$transaction(tx => ensureBaselineRelease(tx, chapter.courseId));
  const course = await prisma.course.findUniqueOrThrow({ where: { id: chapter.courseId }, select: { familySlug: true, variantFamily: true } });
  const shared = readReleaseContent(release.content).variants[variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), null)] ?? [];
  if (!shared.some(module => module.chapters.some(item => item.id === chapter.id))) return null;
  return prisma.courseChapterDraft.upsert({ where: { chapterId: chapter.id },
    create: { chapterId: chapter.id, courseId: chapter.courseId, baseReleaseId: release.id,
      title: chapter.title, summary: chapter.summary, estimatedMinutes: chapter.estimatedMinutes,
      readerMode: chapter.readerMode, quizPassingScore: chapter.quizPassingScore, isMilestone: chapter.isMilestone, source: chapter.compiled ?? chapter.source },
    update: {} });
}

/** Titles and summaries show in navigation, the catalogue and emails, where placeholders never resolve. */
function rejectTokensInChapterFields(fields: { title: string; summary?: string | null }) {
  const problems = [tokenInFieldProblem("chapter title", fields.title), tokenInFieldProblem("chapter summary", fields.summary)].filter((p): p is string => p !== null);
  if (problems.length) throw new UnprocessableError(problems[0]!, undefined, problems);
}

export async function createChapter(user: SessionUser, courseId: string, input: CreateChapterBody): Promise<ChapterIdResult> {
  const owned = await requireCourseById(user, courseId);
  if (owned.status === "PUBLISHED" || owned.status === "ARCHIVED") await prisma.$transaction(tx => ensureBaselineRelease(tx, courseId));
  rejectTokensInChapterFields(input);
  const moduleId = input.moduleId ?? null;
  if (moduleId) {
    const owner = await prisma.module.findFirst({ where: { id: moduleId, courseId, archivedAt: null }, select: { id: true } });
    if (!owner) throw new NotFoundError("Module not found");
  }

  const slug = await uniqueChapterSlug(courseId, slugify(input.title));
  const last = await prisma.chapter.findFirst({ where: { courseId, moduleId, archivedAt: null }, orderBy: { order: "desc" }, select: { order: true } });
  const chapter = await prisma.chapter.create({
    data: { courseId, moduleId, title: input.title, slug, order: (last?.order ?? 0) + 1, source: `# ${input.title}\n` },
    select: { id: true },
  });
  return { chapterId: chapter.id };
}

async function uniqueChapterSlug(courseId: string, base: string): Promise<string> {
  let slug = base;
  for (let suffix = 2; ; suffix += 1) {
    const taken = await prisma.chapter.findUnique({ where: { courseId_slug: { courseId, slug } }, select: { id: true } });
    if (!taken) return slug;
    slug = `${base}-${suffix}`;
  }
}

/** Swaps the chapter with its neighbour inside the same module; 409 at the edge. */
export async function moveChapter(user: SessionUser, chapterId: string, direction: MoveDirection): Promise<void> {
  const { chapter, course } = await requireChapter(user, chapterId);
  let activeIds: string[] | null = null;
  if (course.status === "PUBLISHED" || course.status === "ARCHIVED") {
    const current = await prisma.course.findUniqueOrThrow({ where: { id: course.id },
      select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
    if (current.activeReleaseId) {
      const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: current.activeReleaseId } });
      const defaultSlug = variantForRelease(resolveCourseFamily(current.familySlug, current.variantFamily), null);
      activeIds = (readReleaseContent(release.content).variants[defaultSlug] ?? [])
        .flatMap(module => module.chapters.map(item => item.id));
    }
  }
  const neighbor = await prisma.chapter.findFirst({
    where: {
      courseId: chapter.courseId,
      moduleId: chapter.moduleId,
      archivedAt: null,
      ...(activeIds ? { OR: [{ id: { in: activeIds } }, { publishedAt: null }] } : {}),
      order: direction === "up" ? { lt: chapter.order } : { gt: chapter.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) throw new ConflictError("Chapter is already at the edge.", TEACH_ERROR_CODES.ALREADY_AT_EDGE);

  await prisma.$transaction([
    prisma.chapter.update({ where: { id: chapter.id }, data: { order: neighbor.order } }),
    prisma.chapter.update({ where: { id: neighbor.id }, data: { order: chapter.order } }),
  ]);
}

/** The editor's initial state. Escaped block placeholders are restored so the editor sees real JSX. */
export async function loadChapterEditor(user: SessionUser, chapterId: string): Promise<ChapterEditorView> {
  const { chapter, course } = await requireChapter(user, chapterId);
  const draft = await prisma.courseChapterDraft.findUnique({ where: { chapterId: chapter.id } });
  const blocks = await prisma.block.findMany({ where: { chapterId: chapter.id, archivedAt: null }, select: { id: true, config: true } });
  return {
    chapterId: chapter.id,
    courseId: course.id,
    courseSlug: course.slug,
    title: draft?.title ?? chapter.title,
    summary: draft?.summary ?? chapter.summary,
    estimatedMinutes: draft?.estimatedMinutes ?? chapter.estimatedMinutes,
    readerMode: draft?.readerMode ?? chapter.readerMode,
    quizPassingScore: draft?.quizPassingScore ?? chapter.quizPassingScore,
    isMilestone: draft?.isMilestone ?? chapter.isMilestone,
    publishedAt: chapter.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: Boolean(draft) || (chapter.publishedAt !== null && chapter.compiled !== chapter.source),
    source: restoreInteractiveBlockTags(draft?.source ?? chapter.source),
    lastPublishedSource: chapter.compiled,
    blockConfigs: Object.fromEntries(blocks.map((block) => [block.id, block.config])),
  };
}

export async function updateChapterSettings(user: SessionUser, chapterId: string, input: ChapterSettingsBody): Promise<SavedAtResult> {
  const { chapter, course } = await requireChapter(user, chapterId);
  rejectTokensInChapterFields(input);
  const draft = await releasedChapterDraft(chapter, course.status);
  if (draft) await prisma.courseChapterDraft.update({ where: { chapterId: chapter.id }, data: {
    title: input.title, summary: input.summary || null, estimatedMinutes: input.estimatedMinutes,
    readerMode: input.readerMode, quizPassingScore: input.quizPassingScore, isMilestone: input.isMilestone,
  } });
  else await prisma.chapter.update({
    where: { id: chapter.id },
    data: {
      title: input.title,
      summary: input.summary || null,
      estimatedMinutes: input.estimatedMinutes,
      readerMode: input.readerMode,
      quizPassingScore: input.quizPassingScore,
      isMilestone: input.isMilestone,
    },
  });
  return { savedAt: new Date().toISOString() };
}

export async function saveChapterDraft(user: SessionUser, chapterId: string, source: string): Promise<SavedAtResult> {
  const { chapter, course } = await requireChapter(user, chapterId);
  const draft = await releasedChapterDraft(chapter, course.status);
  if (draft) await prisma.courseChapterDraft.update({ where: { chapterId: chapter.id }, data: { source } });
  else {
    await prisma.chapter.update({ where: { id: chapter.id }, data: { source } });
    await syncChapterBlocksFromSource(chapter.id, source);
  }
  return { savedAt: new Date().toISOString() };
}

/**
 * Publish = validate + block sync + snapshot. Compilation happens once here,
 * never on read: the reader renders the Chapter.compiled snapshot.
 */
export async function publishChapter(user: SessionUser, chapterId: string): Promise<void> {
  const { chapter, course } = await requireChapter(user, chapterId);
  let draft = await prisma.courseChapterDraft.findUnique({ where: { chapterId } });
  if (!draft && (course.status === "PUBLISHED" || course.status === "ARCHIVED")) {
    const release = await prisma.$transaction(tx => ensureBaselineRelease(tx, course.id));
    const familyCourse = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { familySlug: true, variantFamily: true } });
    const shared = readReleaseContent(release.content).variants[variantForRelease(resolveCourseFamily(familyCourse.familySlug, familyCourse.variantFamily), null)] ?? [];
    if (shared.some(module => module.chapters.some(item => item.id === chapterId))) {
      if (chapter.source === chapter.compiled) return;
      draft = await releasedChapterDraft(chapter, course.status);
      if (draft) draft = await prisma.courseChapterDraft.update({ where: { chapterId }, data: { source: chapter.source } });
    }
  }
  if (draft) {
    const renderable = restoreInteractiveBlockTags(draft.source);
    const reasons = await collectPublishProblems({ id: chapter.id, title: draft.title, summary: draft.summary, readerMode: draft.readerMode }, renderable);
    if (reasons.length) throw new UnprocessableError("The chapter cannot be published yet.", TEACH_ERROR_CODES.CHAPTER_NOT_PUBLISHABLE, reasons);
    const prepared = prepareChapterBlockSync(renderable);
    const oldBlocks = await prisma.block.findMany({ where: { chapterId, archivedAt: null } });
    const oldById = new Map(oldBlocks.map(block => [block.id, block]));
    const blocks = prepared.extracted.map(block => ({ id: block.id,
      type: (block.blockType ?? "QUIZ") as Prisma.BlockCreateManyInput["type"],
      config: (blockConfigFromSource(block, prepared.configs) ?? oldById.get(block.id)?.config ?? {}) as Prisma.InputJsonValue,
      required: oldById.get(block.id)?.required ?? true }));
    await prisma.$transaction(async tx => {
      const current = await tx.courseChapterDraft.findUniqueOrThrow({ where: { chapterId } });
      if (!isDeepStrictEqual(current, draft)) throw new ConflictError("Chapter draft changed during publishing. Review and try again.");
      await publishDashboardChapterRelease(tx, chapter.courseId, chapter.id, draft.baseReleaseId, {
        key: chapter.contentKey ?? undefined, lessonNum: chapter.order, slugPart: chapter.slug,
        title: draft.title, summary: draft.summary, estimatedMinutes: draft.estimatedMinutes,
        readerMode: draft.readerMode, quizPassingScore: draft.quizPassingScore, isMilestone: draft.isMilestone, source: draft.source, blocks,
      });
      await tx.courseChapterDraft.delete({ where: { chapterId } });
    }, { isolationLevel: "Serializable", timeout: 60000 });
    return;
  }
  const renderable = restoreInteractiveBlockTags(chapter.source);
  const reasons = await collectPublishProblems(chapter, renderable);
  if (reasons.length > 0) {
    throw new UnprocessableError("The chapter cannot be published yet.", TEACH_ERROR_CODES.CHAPTER_NOT_PUBLISHABLE, reasons);
  }

  await syncChapterBlocksFromSource(chapter.id, renderable);
  const quizzes = await prisma.block.findMany({ where: { chapterId: chapter.id, type: "QUIZ", archivedAt: null }, select: { id: true, config: true } });
  for (const quiz of quizzes) {
    const normalized = normalizeQuizConfig(quiz.config);
    if (!isDeepStrictEqual(normalized, quiz.config)) await prisma.block.update({ where: { id: quiz.id }, data: { config: normalized as Prisma.InputJsonValue } });
  }
  await prisma.chapter.update({
    where: { id: chapter.id },
    data: { compiled: chapter.source, publishedAt: new Date() },
  });
  if (course.status === "PUBLISHED" || course.status === "ARCHIVED") await prisma.$transaction(async tx => {
    await ensureBaselineRelease(tx, course.id);
    await publishDashboardNewChapterRelease(tx, course.id, chapter.id);
  });
}

/** Remove a published chapter from future releases, or delete an unpublished draft. */
export async function removeChapter(
  user: SessionUser,
  chapterId: string,
  options: { confirmedWithProgress?: boolean }
): Promise<void> {
  const { chapter, course } = await requireChapter(user, chapterId);
  if (course.status === "PUBLISHED" || course.status === "ARCHIVED") await prisma.$transaction(tx => ensureBaselineRelease(tx, course.id));

  const [progress, responses] = await Promise.all([
    prisma.chapterProgress.count({ where: { chapterId: chapter.id } }),
    prisma.response.count({ where: { block: { chapterId: chapter.id } } }),
  ]);
  if ((progress > 0 || responses > 0) && !options.confirmedWithProgress) {
    throw new ConflictError(
      (course.status === "PUBLISHED" || course.status === "ARCHIVED")
        ? "This chapter has learner work. Confirm removal from future releases; current learners keep their progress."
        : "This draft chapter has learner work. Confirm deletion of its history.",
      TEACH_ERROR_CODES.CHAPTER_PROGRESS_CONFIRMATION_REQUIRED
    );
  }

  if (course.status === "PUBLISHED" || course.status === "ARCHIVED") {
    const removed = await prisma.$transaction(tx => removeChapterFromRelease(tx, course.id, chapter.id), { isolationLevel: "Serializable" });
    if (removed) return;
  }
  await prisma.chapter.delete({ where: { id: chapter.id } });
}

type PublishableChapter = { id: string; title: string; summary: string | null; readerMode: string };

/** Everything that would break the reader: MDX syntax, unknown components, block configs, misplaced placeholders. */
async function collectPublishProblems(
  chapter: PublishableChapter,
  renderable: string,
  db: Prisma.TransactionClient = prisma,
  loaded?: ReturnType<typeof prepareChapterBlockSync> & { existing: ExistingSyncBlock[] },
): Promise<string[]> {
  const { id: chapterId, readerMode } = chapter;
  const problems: string[] = [];

  for (const problem of [tokenInFieldProblem("chapter title", chapter.title), tokenInFieldProblem("chapter summary", chapter.summary)]) {
    if (problem) problems.push(problem);
  }

  try {
    await compile(renderable, { remarkPlugins: [remarkGfm, remarkChecklist, remarkLearningLog], outputFormat: "function-body" });
  } catch (error) {
    problems.push(`MDX failed to compile: ${error instanceof Error ? error.message : String(error)}`);
    return problems;
  }

  for (const name of collectUnknownComponents(renderable, mdxComponentAllowlist)) {
    problems.push(`Unknown component <${name}> is not in the allowed component map.`);
  }

  problems.push(...collectCanvasProblems(renderable));
  problems.push(...collectDiagramProblems(renderable));
  problems.push(...collectLabProblems(renderable));
  problems.push(...collectContentTokenProblems(renderable));

  if (readerMode === "QUIZ" && !isActivityOnlySource(renderable)) {
    problems.push("Quiz flow supports activities only: Quiz, Open Question, Predict, and Code Exercise. Move lesson text and visual blocks to a standard lesson.");
  }

  const { extracted, configs } = loaded ?? prepareChapterBlockSync(renderable);
  const existing = loaded?.existing ?? await db.block.findMany({
    where: { chapterId, archivedAt: null },
    select: { id: true, type: true, config: true, sourceHash: true },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const created = new Set(diffBlocks(extracted, existing).create.map((row) => row.id));

  for (const block of extracted) {
    if (!block.blockType || !isRegisteredBlockType(block.blockType)) continue;
    const schema = blockDefinitions[block.blockType].schema;
    const inlineConfig = blockConfigFromSource(block, configs);

    if (created.has(block.id)) {
      for (const field of secretFieldsWithTokens(inlineConfig ?? {})) {
        problems.push(`${block.tagName} block "${block.id}" uses a placeholder in "${field}". Answer keys, rubrics, tests and solutions must be the same for every learner.`);
      }
      if (!schema.safeParse(inlineConfig ?? {}).success) {
        problems.push(`Block "${block.id}" (<${block.tagName}>) is missing valid content — edit it in the rich UI or source before publishing.`);
      }
      continue;
    }

    const persisted = existingById.get(block.id);
    const config = inlineConfig ?? persisted?.config;
    if (!config) {
      if (persisted) problems.push(`${block.tagName} block "${block.id}" has no configuration yet. Publish blocked.`);
      continue;
    }
    for (const field of secretFieldsWithTokens(config)) {
      problems.push(`${block.tagName} block "${block.id}" uses a placeholder in "${field}". Answer keys, rubrics, tests and solutions must be the same for every learner.`);
    }
    const result = schema.safeParse(config);
    if (!result.success) {
      const details = result.error.issues.map((issue) => issue.path.join(".") || "configuration").join(", ");
      problems.push(`${block.tagName} block "${block.id}" has invalid configuration: ${details}. Publish blocked.`);
    }
  }

  return problems;
}


/** Validate the complete selection before atomically syncing and publishing its drafts. */
export async function publishChapters(user: SessionUser, scope: { courseId: string } | { moduleId: string }): Promise<void> {
  let courseId: string;
  let moduleId: string | undefined;
  if ("moduleId" in scope) {
    const module = await prisma.module.findUnique({ where: { id: scope.moduleId, archivedAt: null }, select: { courseId: true } });
    if (!module) throw new NotFoundError("Module not found");
    courseId = module.courseId;
    moduleId = scope.moduleId;
  } else courseId = scope.courseId;
  const owned = await requireCourseById(user, courseId);
  if (owned.status === "PUBLISHED" || owned.status === "ARCHIVED") {
    const baseline = await prisma.$transaction(tx => ensureBaselineRelease(tx, courseId));
    const drafts = await prisma.courseChapterDraft.findMany({ where: { courseId,
      ...(moduleId ? { chapter: { moduleId } } : {}) }, orderBy: { updatedAt: "asc" }, select: { chapterId: true, baseReleaseId: true } });
    for (const [index, draft] of drafts.entries()) {
      if (index > 0 && draft.baseReleaseId === baseline.id) {
        const active = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true } });
        await prisma.courseChapterDraft.updateMany({ where: { chapterId: draft.chapterId, baseReleaseId: baseline.id }, data: { baseReleaseId: active.activeReleaseId! } });
      }
      await publishChapter(user, draft.chapterId);
    }
    const unpublished = await prisma.chapter.findMany({ where: { courseId, archivedAt: null, publishedAt: null,
      ...(moduleId ? { moduleId } : {}) }, select: { id: true } });
    for (const chapter of unpublished) await publishChapter(user, chapter.id);
    return;
  }

  const selection = {
    where: { courseId, archivedAt: null, ...(moduleId ? { moduleId } : {}) },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { blocks: { orderBy: { id: "asc" } } },
  } satisfies Prisma.ChapterFindManyArgs;
  const chapters = await prisma.chapter.findMany(selection);
  if (!chapters.length) throw new UnprocessableError("There are no chapters to publish.", TEACH_ERROR_CODES.CHAPTER_NOT_PUBLISHABLE);
  const pending = chapters.filter(chapter => !chapter.publishedAt || chapter.compiled !== chapter.source);
  if (!pending.length) return;
  // MDX compilation and AST extraction can take longer than an interactive transaction's lifetime.
  // Complete this work without holding a connection, then recheck the exact content before writing.
  const prepared = new Map<string, ReturnType<typeof prepareChapterBlockSync> & { existing: ExistingSyncBlock[] }>();
  const problems: string[] = [];
  for (const chapter of pending) {
    try {
      prepared.set(chapter.id, { ...prepareChapterBlockSync(chapter.source), existing: chapter.blocks.filter(block => !block.archivedAt) });
    } catch (error) {
      problems.push(`${chapter.title}: MDX failed to compile: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const reasons = await collectPublishProblems(chapter, restoreInteractiveBlockTags(chapter.source), prisma, prepared.get(chapter.id)!);
    problems.push(...reasons.map(reason => `${chapter.title}: ${reason}`));
  }
  if (problems.length) throw new UnprocessableError("Some chapters cannot be published yet. No chapters were published.", TEACH_ERROR_CODES.CHAPTER_NOT_PUBLISHABLE, problems);
  const blockPlans = pending.map(chapter => {
    const content = prepared.get(chapter.id)!;
    return planChapterBlockSync(chapter.id, content, content.existing);
  });
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.chapter.findMany(selection);
      if (!isDeepStrictEqual(current, chapters)) throw new ConflictError("Course content changed during validation. Please publish again.");
      await applyBlockSyncPlans(tx, blockPlans);
      const publishedAt = new Date();
      for (const chapter of pending) {
        const updated = await tx.chapter.updateMany({
          where: { id: chapter.id, source: chapter.source, readerMode: chapter.readerMode, compiled: chapter.compiled, publishedAt: chapter.publishedAt },
          data: { compiled: chapter.source, publishedAt },
        });
        if (updated.count !== 1) throw new ConflictError("A chapter changed during publishing. Please try again.");
      }
    }, { timeout: 60000, isolationLevel: "Serializable" });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") throw new ConflictError("Course content changed during publishing. Please publish again.");
    throw error;
  }
}
