import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { SessionUser } from "../../types/auth.js";
import type { CourseUpdatePreview } from "../../shared/api/teach.js";
import { BadRequestError, ConflictError } from "../../utils/errors.js";
import { requireCourseById } from "./access.js";
import { parseCourseZip, type CourseZipSource, type ImportPlan } from "./course-import.js";
import { canonical, matchCourseUpdate, type UpdateMapping } from "./course-update-matching.js";
import { publishCourseRelease } from "./publish-course-release.js";
import { readReleaseContent, variantForRelease } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";

const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
type StoredPlan = { content: ImportPlan; mapping: UpdateMapping };

async function snapshot(db: Prisma.TransactionClient, courseId: string) {
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId }, include: {
    modules: { orderBy: { id: "asc" } },
    chapters: { orderBy: { id: "asc" }, include: { blocks: { orderBy: [{ order: "asc" }, { id: "asc" }] } } },
  } });
  if (!course.activeReleaseId) return { ...course, revision: null };
  const release = await db.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId } });
  const modules = readReleaseContent(release.content).variants[variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), null)] ?? [];
  const moduleById = new Map(course.modules.map(module => [module.id, module]));
  const chapterById = new Map(course.chapters.map(chapter => [chapter.id, chapter]));
  return { ...course, revision: release.id,
    modules: modules.map(module => ({ ...moduleById.get(module.id)!, contentKey: module.key, title: module.title, order: module.order })),
    chapters: modules.flatMap(module => module.chapters.map(chapter => ({ ...chapterById.get(chapter.id)!,
      moduleId: module.id, contentKey: chapter.key, slug: chapter.slug, title: chapter.title, order: chapter.order }))),
  };
}

export async function previewCourseZipUpdate(user: SessionUser, courseId: string, buffer: Buffer,
  source: CourseZipSource = "dashboard"): Promise<CourseUpdatePreview> {
  const course = await requireCourseById(user, courseId);
  const { slug, plan } = await parseCourseZip(buffer, source);
  if (plan.manifest.publication === "create") throw new BadRequestError("This package declares course creation. Use the new-course import instead.");
  if (slug !== course.slug) throw new BadRequestError(`The ZIP slug must be "${course.slug}" to update this course.`);
  const current = await snapshot(prisma, courseId);
  if ((current.modules.some(module => module.contentKey) || current.chapters.some(chapter => chapter.contentKey)) &&
      plan.modules.some(module => !module.key || module.lessons.some(lesson => !lesson.key))) {
    throw new BadRequestError("This course uses stable content keys. Include a key for every supplied module and lesson in the ZIP.");
  }
  const result = matchCourseUpdate(plan, current.modules, current.chapters);
  const activeRelease = current.revision ? await prisma.courseRelease.findUniqueOrThrow({ where: { id: current.revision } }) : null;
  const effective = (activeRelease ? readReleaseContent(activeRelease.content) : undefined);
  const variantSlugs = effective ? Object.keys(effective.variants) :
    resolveCourseFamily(current.familySlug, current.variantFamily)?.variants.map(variant => variant.slug) ?? ["default"];
  const learnerCounts = await prisma.enrollment.groupBy({ by: ["variantSlug"], where: { courseId, lifecycle: "ACTIVE" }, _count: { _all: true } });
  const variants = variantSlugs.map(slug => {
    const affected = new Set<string>();
    const existing = effective?.variants[slug]?.flatMap(module => module.chapters) ?? [];
    for (const [mi, module] of plan.modules.entries()) for (const [li, lesson] of module.lessons.entries()) {
      if (result.modules[mi]?.chapters[li]?.action === "unchanged") continue;
      const priorId = result.mapping[mi]?.chapters[li]?.chapterId;
      const variantChapter = existing.find(chapter => lesson.key ? chapter.key === lesson.key : chapter.id === priorId);
      if (!priorId || !variantChapter || variantChapter.id === priorId) affected.add(lesson.key ?? lesson.title);
    }
    for (const key of plan.remove?.lessonKeys ?? []) affected.add(key);
    const variantPlan = plan.variants?.find(variant => variant.slug === slug);
    for (const override of variantPlan?.overrides ?? []) affected.add(override.lessonKey);
    for (const key of variantPlan?.omitLessonKeys ?? []) affected.add(key);
    for (const module of variantPlan?.modules ?? []) for (const lesson of module.lessons) affected.add(lesson.key ?? lesson.title);
    if (variantPlan?.moduleOrder) affected.add("Module sequence");
    return { slug, affectedLessons: [...affected], activeLearners: learnerCounts.filter(row => (row.variantSlug ?? variantForRelease(resolveCourseFamily(current.familySlug, current.variantFamily), null)) === slug)
      .reduce((sum, row) => sum + row._count._all, 0) };
  });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const warnings = [
    "Only supplied keys change. Omitted content stays in the course; removals must be explicit.",
    "Shared edits reach inheriting variants. A variant override changes only that variant.",
    "Variant-only modules, omitted lessons, and module order change only their named variant.",
    "Learners who already started stay on their release. New learners receive the new release.",
    "Changed chapters and activities get new progress identities; old submissions and history remain.",
    "Course details, pricing, ownership, and publication status are unchanged.",
  ];
  await prisma.courseImportPreview.deleteMany({ where: { expiresAt: { lt: new Date() }, appliedAt: null } });
  await prisma.courseImportPreview.deleteMany({ where: { courseId, userId: user.id, appliedAt: null } });
  const preview = await prisma.courseImportPreview.create({ data: {
    courseId, userId: user.id, fingerprint: fingerprint(current), expiresAt,
    plan: { content: plan, mapping: result.mapping } as unknown as Prisma.InputJsonValue,
    diff: { modules: result.modules, variants, warnings } as unknown as Prisma.InputJsonValue,
  } });
  return { previewId: preview.id, expiresAt: expiresAt.toISOString(), modules: result.modules, variants, warnings };
}

export async function approveCourseZipUpdate(user: SessionUser, courseId: string, previewId: string,
  source: CourseZipSource = "dashboard") {
  await requireCourseById(user, courseId);
  try {
    return await prisma.$transaction(async tx => {
      const preview = await tx.courseImportPreview.findFirst({ where: { id: previewId, courseId, userId: user.id } });
      if (!preview || preview.appliedAt || preview.expiresAt <= new Date()) throw new ConflictError("This preview expired or was already applied. Upload the ZIP again.");
      const current = await snapshot(tx, courseId);
      if (fingerprint(current) !== preview.fingerprint) throw new ConflictError("Course content changed after this preview. Upload the ZIP again to review the latest changes.");
      const { content, mapping } = preview.plan as unknown as StoredPlan;
      await publishCourseRelease(tx, courseId, content, mapping);
      await tx.courseImportPreview.update({ where: { id: preview.id }, data: { appliedAt: new Date() } });
      return { courseSlug: current.slug };
    }, { isolationLevel: "Serializable", timeout: source === "repository" ? 300000 : 60000, maxWait: 10000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") throw new ConflictError("The course changed during approval. Upload the ZIP again.");
    throw error;
  }
}
