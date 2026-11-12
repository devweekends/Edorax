import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { Prisma } from "../../generated/prisma/index.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { ensureBaselineRelease, readReleaseContent, type ReleaseChapter, type ReleaseContent, type ReleaseModule } from "../courses/releases.js";
import { BadRequestError } from "../../utils/errors.js";
import { notify } from "../notifications/service.js";
import type { ImportPlan } from "./course-import.js";
import { canonical, type UpdateMapping } from "./course-update-matching.js";

type Lesson = ImportPlan["modules"][number]["lessons"][number];

function plainSource(source: string, ids: string[]) {
  let result = source;
  for (const id of ids) result = result.replaceAll(id, "activity");
  return result.replace(/\r\n/g, "\n").trim();
}

async function equivalent(tx: Prisma.TransactionClient, chapter: ReleaseChapter | undefined, lesson: Lesson): Promise<boolean> {
  if (!chapter || chapter.title !== lesson.title || chapter.estimatedMinutes !== lesson.estimatedMinutes ||
      chapter.readerMode !== lesson.readerMode || chapter.quizPassingScore !== (lesson.quizPassingScore ?? 70) || chapter.isMilestone !== lesson.isMilestone) return false;
  const old = await tx.chapter.findUnique({ where: { id: chapter.id }, include: { blocks: { where: { archivedAt: null }, orderBy: { order: "asc" } } } });
  if (!old || old.summary !== lesson.summary || old.blocks.length !== lesson.blocks.length) return false;
  if (plainSource(old.source, old.blocks.map(block => block.id)) !== plainSource(lesson.source, lesson.blocks.map(block => block.id))) return false;
  return old.blocks.every((block, index) => block.type === lesson.blocks[index].type && block.required === lesson.blocks[index].required &&
    canonical(block.config) === canonical(lesson.blocks[index].config));
}

export async function createReleaseChapter(tx: Prisma.TransactionClient, courseId: string, moduleId: string, logicalSlug: string, lesson: Lesson): Promise<ReleaseChapter> {
  const id = ulid();
  let source = lesson.source;
  const blocks = lesson.blocks.map((block, index) => {
    const newId = ulid();
    source = source.replaceAll(block.id, newId);
    return { ...block, id: newId, chapterId: id, order: index + 1, blocking: false, points: 1, tags: [] };
  });
  // DB slugs and content keys are unique across releases. The release keeps the stable public slug/key.
  await tx.chapter.create({ data: { id, courseId, moduleId, slug: `${logicalSlug}--${id.toLowerCase()}`,
    title: lesson.title, summary: lesson.summary, source, compiled: source, publishedAt: new Date(),
    order: lesson.lessonNum, estimatedMinutes: lesson.estimatedMinutes, readerMode: lesson.readerMode, quizPassingScore: lesson.quizPassingScore ?? 70,
    isMilestone: lesson.isMilestone } });
  if (blocks.length) await tx.block.createMany({ data: blocks });
  return { id, key: lesson.key ?? null, slug: logicalSlug, title: lesson.title, order: lesson.lessonNum,
    estimatedMinutes: lesson.estimatedMinutes, readerMode: lesson.readerMode, quizPassingScore: lesson.quizPassingScore ?? 70, isMilestone: lesson.isMilestone };
}

function locate(modules: ReleaseModule[], key: string | null, id: string | null) {
  for (const module of modules) {
    const index = module.chapters.findIndex(chapter => key ? chapter.key === key : chapter.id === id);
    if (index >= 0) return { module, index, chapter: module.chapters[index] };
  }
  // First keyed import of a legacy course: use the reviewed content match once.
  if (key && id) return locate(modules, null, id);
  return null;
}

/** The chapter that already holds this public slug, unless another incoming lesson was matched to it. */
function locateSlug(modules: ReleaseModule[], slug: string, matchedIds: Set<string>) {
  for (const module of modules) {
    const index = module.chapters.findIndex(chapter => chapter.slug === slug && !matchedIds.has(chapter.id));
    if (index >= 0) return { module, index, chapter: module.chapters[index] };
  }
  return null;
}

/**
 * When a new release is approved and published:
 * 1. Active/in-progress learners are automatically upgraded on course overview or reader open
 *    with safe progress rollup recomputation (preserving completed work).
 * 2. Notify completed learners that new material has been published for their course.
 */
export async function onNewCourseReleasePublished(tx: Prisma.TransactionClient, courseId: string, releaseId: string) {
  const completedLearners = await tx.enrollment.findMany({
    where: {
      courseId,
      status: "COMPLETED",
      userId: { not: null },
    },
    select: {
      userId: true,
      course: { select: { title: true, slug: true } },
    },
  });

  if (completedLearners.length > 0) {
    const courseTitle = completedLearners[0].course.title;
    const courseSlug = completedLearners[0].course.slug;
    const recipients = completedLearners
      .filter((e): e is typeof e & { userId: string } => Boolean(e.userId))
      .map((e) => ({ userId: e.userId }));

    await notify(
      {
        type: "course.curriculum_updated",
        recipients,
        dedupeKey: `curriculum_update_${courseId}_${releaseId}`,
        title: "New Chapters Available!",
        body: `New content has been published for ${courseTitle}. Check it out!`,
        url: `/courses/${courseSlug}`,
        courseId,
        email: ({ name }) => ({
          subject: `New chapters added to ${courseTitle}`,
          text: `Hi ${name || "there"},\n\nNew chapters have been published for ${courseTitle}. Jump back in to explore the latest curriculum:\n\n${courseTitle}\n`,
          html: `<p>Hi ${name || "there"},</p><p>New chapters have been published for <strong>${courseTitle}</strong>. Jump back in to explore the latest curriculum.</p>`,
        }),
      },
      { tx }
    );
  }
}

/** Publish a patch against the current release. Nothing absent from the package is removed. */
export async function publishCourseRelease(tx: Prisma.TransactionClient, courseId: string, plan: ImportPlan, mapping: UpdateMapping) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { familySlug: true, variantFamily: true } });
  if (plan.manifest.family && plan.manifest.family !== course.familySlug) throw new BadRequestError("Changing a published course's variant family requires a separate migration.");
  if (plan.manifest.variantFamily && canonical(plan.manifest.variantFamily) !== canonical(course.variantFamily)) {
    throw new BadRequestError("Changing variant definitions requires a separate migration.");
  }
  const baseline = await ensureBaselineRelease(tx, courseId);
  const previous = readReleaseContent(baseline.content);
  const next: ReleaseContent = structuredClone(previous);
  const defaultSlug = resolveCourseFamily(course.familySlug, course.variantFamily)?.defaultVariantSlug ?? "default";
  const shared = next.variants[defaultSlug];
  if (!shared) throw new BadRequestError("The current course release has no shared curriculum.");
  const variantSlugs = Object.keys(next.variants);
  const maxOrder = await tx.module.aggregate({ where: { courseId }, _max: { order: true } });
  let storageOrder = maxOrder._max.order ?? 0;
  const matchedIds = new Set(mapping.flatMap(module => module.chapters.flatMap(chapter => chapter.chapterId ? [chapter.chapterId] : [])));

  for (const [mi, incomingModule] of plan.modules.entries()) {
    if (!incomingModule.key && shared.some(module => module.key)) throw new BadRequestError("Module keys are required for a keyed course.");
    const old = shared.find(module => incomingModule.key ? module.key === incomingModule.key : module.id === mapping[mi]?.moduleId)
      ?? shared.find(module => module.id === mapping[mi]?.moduleId);
    const restored = !old && incomingModule.key ? await tx.module.findUnique({ where: { courseId_contentKey: { courseId, contentKey: incomingModule.key } } }) : null;
    const moduleId = old?.id ?? restored?.id ?? ulid();
    if (!old && !restored) await tx.module.create({ data: { id: moduleId, courseId, contentKey: incomingModule.key, title: incomingModule.title, order: ++storageOrder } });
    else if (old && incomingModule.key && !old.key) await tx.module.update({ where: { id: moduleId }, data: { contentKey: incomingModule.key } });
    for (const slug of variantSlugs) {
      const modules = next.variants[slug];
      const target = modules.find(module => module.id === moduleId);
      if (target) { target.title = incomingModule.title; target.key = incomingModule.key ?? null;
        if (incomingModule.order !== undefined) target.order = incomingModule.order; }
      else if (!old || slug === defaultSlug) modules.push({ id: moduleId, key: incomingModule.key ?? null,
        title: incomingModule.title, order: incomingModule.order ?? mi + 1, chapters: [] });
    }
    for (const [li, lesson] of incomingModule.lessons.entries()) {
      if (!lesson.key && shared.some(module => module.chapters.some(chapter => chapter.key))) throw new BadRequestError("Lesson keys are required for a keyed course.");
      const ownSlug = `${mi + 1}-${lesson.lessonNum}-${lesson.slugPart}`;
      // A lesson that changed too much to be matched by content still replaces the chapter at its
      // own address. Left as "new", the release would hold two chapters at one slug: the reader
      // would open the old one and list both. A chapter another lesson was matched to stays its own.
      const prior = locate(shared, lesson.key ?? null, mapping[mi]?.chapters[li]?.chapterId ?? null)
        ?? locateSlug(shared, ownSlug, matchedIds);
      const logicalSlug = prior?.chapter.slug ?? ownSlug;
      const changed = !(await equivalent(tx, prior?.chapter, lesson));
      const replacement = changed ? await createReleaseChapter(tx, courseId, moduleId, logicalSlug, lesson) : prior!.chapter;
      replacement.key = lesson.key ?? replacement.key;
      replacement.order = lesson.lessonNum;
      for (const slug of variantSlugs) {
        const modules = next.variants[slug];
        const destination = modules.find(module => module.id === moduleId);
        if (!destination) continue; // This variant omitted the shared module.
        const existing = locate(modules, lesson.key ?? null, prior?.chapter.id ?? null);
        const inherits = !existing || !prior || existing.chapter.id === prior.chapter.id;
        if (existing && (slug === defaultSlug || inherits)) existing.module.chapters.splice(existing.index, 1);
        if (slug === defaultSlug || inherits) destination.chapters.push({ ...replacement });
        else if (existing && existing.module.id !== destination.id) {
          existing.module.chapters.splice(existing.index, 1);
          destination.chapters.push({ ...existing.chapter, order: lesson.lessonNum });
        }
        else if (existing) existing.chapter.order = lesson.lessonNum;
      }
    }
  }

  for (const key of plan.remove?.lessonKeys ?? []) {
    if (!locate(shared, key, null)) throw new BadRequestError(`Cannot remove unknown lesson key ${key}.`);
    for (const slug of variantSlugs) {
      const found = locate(next.variants[slug], key, null);
      if (found) found.module.chapters.splice(found.index, 1);
    }
  }
  for (const key of plan.remove?.moduleKeys ?? []) {
    if (!shared.some(module => module.key === key)) throw new BadRequestError(`Cannot remove unknown module key ${key}.`);
    for (const slug of variantSlugs) next.variants[slug] = next.variants[slug].filter(module => module.key !== key);
  }

  for (const variant of plan.variants ?? []) {
    const modules = next.variants[variant.slug];
    if (!modules) throw new BadRequestError(`Unknown variant ${variant.slug}.`);
    for (const override of variant.overrides) {
      const target = locate(modules, override.lessonKey, null);
      if (!target) throw new BadRequestError(`Variant ${variant.slug} targets unknown lesson ${override.lessonKey}.`);
      if (await equivalent(tx, target.chapter, override.lesson)) continue;
      const chapter = await createReleaseChapter(tx, courseId, target.module.id, target.chapter.slug,
        { ...override.lesson, key: override.lessonKey, lessonNum: target.chapter.order });
      target.module.chapters[target.index] = chapter;
    }
    for (const key of variant.omitLessonKeys ?? []) {
      const target = locate(modules, key, null);
      if (target) target.module.chapters.splice(target.index, 1);
    }
    for (const incoming of variant.modules ?? []) {
      if (!incoming.key) throw new BadRequestError(`Variant ${variant.slug} module needs a stable key.`);
      const old = modules.find(module => module.key === incoming.key);
      const restored = !old ? await tx.module.findUnique({ where: { courseId_contentKey: { courseId, contentKey: incoming.key } } }) : null;
      const moduleId = old?.id ?? restored?.id ?? ulid();
      if (!old && !restored) await tx.module.create({ data: { id: moduleId, courseId,
        contentKey: incoming.key, title: incoming.title, order: ++storageOrder } });
      const destination = old ?? { id: moduleId, key: incoming.key, title: incoming.title,
        order: incoming.order ?? ++storageOrder, chapters: [] };
      destination.title = incoming.title;
      destination.key = incoming.key;
      if (!old) modules.push(destination);
      for (const lesson of incoming.lessons) {
        if (!lesson.key) throw new BadRequestError(`Variant ${variant.slug} lesson needs a stable key.`);
        const prior = locate(modules, lesson.key, null);
        const logicalSlug = prior?.chapter.slug ?? `${variant.slug}-${lesson.key}`;
        const replacement = await equivalent(tx, prior?.chapter, lesson)
          ? prior!.chapter
          : await createReleaseChapter(tx, courseId, moduleId, logicalSlug, lesson);
        if (prior) prior.module.chapters.splice(prior.index, 1);
        destination.chapters.push({ ...replacement, key: lesson.key, order: lesson.lessonNum });
      }
    }
    if (variant.moduleOrder) {
      const byKey = new Map(modules.filter(module => module.key).map(module => [module.key!, module]));
      next.variants[variant.slug] = variant.moduleOrder.map((key, index) => {
        const module = byKey.get(key);
        if (!module) throw new BadRequestError(`Variant ${variant.slug} module order references missing ${key}.`);
        return { ...module, order: index + 1 };
      });
    }
  }
  for (const modules of Object.values(next.variants)) {
    modules.sort((a, b) => a.order - b.order);
    for (const module of modules) module.chapters.sort((a, b) => a.order - b.order);
  }
  // Tutor settings are not release content: they follow the manifest even when no chapter changed.
  const assistant = plan.manifest.assistant ? (plan.manifest.assistant as Prisma.InputJsonValue) : Prisma.DbNull;
  // Certificate settings are course settings too; issued certificates keep their own snapshot.
  const certificate = plan.manifest.certificate ? (plan.manifest.certificate as Prisma.InputJsonValue) : Prisma.DbNull;
  if (canonical(next) === canonical(previous)) {
    await tx.course.update({ where: { id: courseId }, data: { assistant, certificate,
      ...(plan.manifest.availableVariantSlugs ? { availableVariantSlugs: plan.manifest.availableVariantSlugs } : {}) } });
    return baseline;
  }
  const sourceHash = createHash("sha256").update(canonical({ base: baseline.id, plan })).digest("hex");
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: baseline.number + 1,
    content: next as unknown as Prisma.InputJsonValue, sourceHash } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id, assistant, certificate,
    ...(plan.manifest.availableVariantSlugs ? { availableVariantSlugs: plan.manifest.availableVariantSlugs } : {}) } });
  await onNewCourseReleasePublished(tx, courseId, release.id);
  return release;
}

/** Publish one approved dashboard chapter draft through the same immutable release boundary. */
export async function publishDashboardChapterRelease(tx: Prisma.TransactionClient, courseId: string, chapterId: string,
  baseReleaseId: string, lesson: Lesson) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
  if (course.activeReleaseId !== baseReleaseId) throw new BadRequestError("Course changed since this draft was created. Review the latest course before publishing.");
  const previous = await tx.courseRelease.findUniqueOrThrow({ where: { id: baseReleaseId } });
  const next = structuredClone(readReleaseContent(previous.content));
  const defaultSlug = variantForDefault(course.familySlug, course.variantFamily);
  const original = next.variants[defaultSlug]?.flatMap(module => module.chapters).find(chapter => chapter.id === chapterId);
  if (!original) throw new BadRequestError("Chapter is not in the current shared course release.");
  const parent = next.variants[defaultSlug].find(module => module.chapters.some(chapter => chapter.id === chapterId))!;
  const replacement = await createReleaseChapter(tx, courseId, parent.id, original.slug, lesson);
  replacement.key = original.key;
  for (const modules of Object.values(next.variants)) for (const module of modules) {
    const index = module.chapters.findIndex(chapter => chapter.id === chapterId);
    if (index >= 0) module.chapters[index] = { ...replacement };
  }
  const sourceHash = createHash("sha256").update(canonical({ baseReleaseId, chapterId, lesson })).digest("hex");
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: previous.number + 1,
    content: next as unknown as Prisma.InputJsonValue, sourceHash } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  return release;
}

function variantForDefault(familySlug: string | null, definition?: unknown) { return resolveCourseFamily(familySlug, definition)?.defaultVariantSlug ?? "default"; }

export async function publishDashboardNewChapterRelease(tx: Prisma.TransactionClient, courseId: string, chapterId: string) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
  if (!course.activeReleaseId) return;
  const previous = await tx.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const chapter = await tx.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  if (!chapter.moduleId || !chapter.publishedAt) throw new BadRequestError("Publish a chapter inside a module.");
  const next = structuredClone(readReleaseContent(previous.content));
  for (const modules of Object.values(next.variants)) {
    let module = modules.find(item => item.id === chapter.moduleId);
    if (!module) {
      const row = await tx.module.findUniqueOrThrow({ where: { id: chapter.moduleId } });
      module = { id: row.id, key: row.contentKey, title: row.title, order: row.order, chapters: [] };
      modules.push(module);
    }
    if (module.chapters.some(item => item.id === chapterId)) continue;
    module.chapters.push({ id: chapter.id, key: chapter.contentKey, slug: chapter.slug, title: chapter.title,
      order: chapter.order, estimatedMinutes: chapter.estimatedMinutes, readerMode: chapter.readerMode, quizPassingScore: chapter.quizPassingScore,
      isMilestone: chapter.isMilestone });
    module.chapters.sort((a, b) => a.order - b.order);
    modules.sort((a, b) => a.order - b.order);
  }
  const sourceHash = createHash("sha256").update(canonical({ base: previous.id, chapterId, action: "add" })).digest("hex");
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: previous.number + 1,
    content: next as unknown as Prisma.InputJsonValue, sourceHash } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  await onNewCourseReleasePublished(tx, courseId, release.id);
}

export async function removeChapterFromRelease(tx: Prisma.TransactionClient, courseId: string, chapterId: string) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true } });
  if (!course.activeReleaseId) return false;
  const previous = await tx.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const next = structuredClone(readReleaseContent(previous.content));
  const target = Object.values(next.variants).flatMap(modules => modules.flatMap(module => module.chapters)).find(chapter => chapter.id === chapterId);
  const logicalKey = target?.key;
  let found = false;
  for (const modules of Object.values(next.variants)) for (const module of modules) {
    const before = module.chapters.length;
    module.chapters = module.chapters.filter(chapter => logicalKey ? chapter.key !== logicalKey : chapter.id !== chapterId);
    if (module.chapters.length < before) found = true;
  }
  if (!found) return false;
  const sourceHash = createHash("sha256").update(canonical({ base: previous.id, chapterId, action: "remove" })).digest("hex");
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: previous.number + 1,
    content: next as unknown as Prisma.InputJsonValue, sourceHash } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  await onNewCourseReleasePublished(tx, courseId, release.id);
  return true;
}

/** Apply dashboard module names/order and chapter moves after creator presses Publish course. */
export async function publishDashboardStructureRelease(tx: Prisma.TransactionClient, courseId: string) {
  const course = await tx.course.findUniqueOrThrow({ where: { id: courseId }, select: { activeReleaseId: true, familySlug: true, variantFamily: true } });
  if (!course.activeReleaseId) return;
  const previous = await tx.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const next = structuredClone(readReleaseContent(previous.content));
  const moduleRows = await tx.module.findMany({ where: { courseId, archivedAt: null } });
  const byModule = new Map(moduleRows.map(module => [module.id, module]));
  const shared = next.variants[variantForDefault(course.familySlug, course.variantFamily)] ?? [];
  const chapterRows = await tx.chapter.findMany({ where: { id: { in: shared.flatMap(module => module.chapters.map(chapter => chapter.id)) } },
    select: { id: true, moduleId: true, order: true } });
  const byChapter = new Map(chapterRows.map(chapter => [chapter.id, chapter]));
  const destinations = new Map<string, string>();
  for (const module of shared) for (const chapter of module.chapters) {
    const row = byChapter.get(chapter.id);
    if (row?.moduleId && row.moduleId !== module.id) destinations.set(chapter.key ?? chapter.id, row.moduleId);
  }
  for (const modules of Object.values(next.variants)) {
    for (const destinationId of destinations.values()) if (!modules.some(module => module.id === destinationId)) {
      const row = byModule.get(destinationId);
      if (row) modules.push({ id: row.id, key: row.contentKey, title: row.title, order: row.order, chapters: [] });
    }
    for (const module of modules) {
      const row = byModule.get(module.id);
      if (row) { module.title = row.title; module.order = row.order; }
    }
    for (const module of [...modules]) for (const chapter of [...module.chapters]) {
      const destinationId = destinations.get(chapter.key ?? chapter.id);
      if (!destinationId || destinationId === module.id) continue;
      const destination = modules.find(item => item.id === destinationId);
      if (!destination) continue;
      module.chapters.splice(module.chapters.indexOf(chapter), 1);
      destination.chapters.push(chapter);
    }
    modules.sort((a, b) => a.order - b.order);
    for (const module of modules) module.chapters.sort((a, b) => a.order - b.order);
  }
  if (canonical(next) === canonical(previous.content)) return;
  const sourceHash = createHash("sha256").update(canonical({ base: previous.id, action: "structure", content: next })).digest("hex");
  const release = await tx.courseRelease.create({ data: { id: ulid(), courseId, number: previous.number + 1,
    content: next as unknown as Prisma.InputJsonValue, sourceHash } });
  await tx.course.update({ where: { id: courseId }, data: { activeReleaseId: release.id } });
  await onNewCourseReleasePublished(tx, courseId, release.id);
}
