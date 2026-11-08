import type { CourseBuilderChapter, CourseBuilderView, CourseDraftPreview, CourseSettingsView, CourseSlugResult } from "../../shared/api/teach.js";
import { TEACH_ERROR_CODES } from "../../shared/api/teach.js";
import { validateCoursePublish } from "../../shared/lib/course-publish-rules.js";
import { slugify } from "../../shared/lib/mdx-headings.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, UnprocessableError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import type { CourseSettingsBody, CreateCourseBody } from "../../validations/teach.js";
import { requireCourseById, requireCourseBySlug } from "./access.js";
import { publishChapters } from "./chapters.js";
import { ensureBaselineRelease } from "../courses/releases.js";
import { type ReleaseContent, variantForRelease } from "../courses/releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";
import { publishDashboardStructureRelease } from "./publish-course-release.js";

// Course lifecycle: DRAFT → PUBLISHED → (ARCHIVED when learners exist | DRAFT when none).
// Publishing is the only transition with rules; see shared/lib/course-publish-rules.

const builderChapterSelect = {
  id: true,
  title: true,
  slug: true,
  order: true,
  publishedAt: true,
  estimatedMinutes: true,
  isMilestone: true,
  readerMode: true,
  blocks: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: { type: true } },
} as const;

type BuilderChapterRow = { publishedAt: Date | null } & Omit<CourseBuilderChapter, "publishedAt">;

function toBuilderChapter(row: BuilderChapterRow): CourseBuilderChapter {
  return { ...row, publishedAt: row.publishedAt?.toISOString() ?? null };
}

/**
 * Creates a DRAFT course owned by the caller with a default first module, so
 * chapters always have a home (the reader walks modules → chapters).
 */
export async function createCourse(user: SessionUser, input: CreateCourseBody): Promise<CourseSlugResult> {
  const slug = await uniqueCourseSlug(slugify(input.title));
  const course = await prisma.course.create({
    data: {
      slug,
      title: input.title,
      description: input.description || null,
      mentorId: user.id,
      modules: { create: { title: "Part 1", order: 0 } },
    },
    select: { slug: true },
  });
  return { courseSlug: course.slug };
}

async function uniqueCourseSlug(base: string): Promise<string> {
  let slug = base;
  for (let suffix = 2; ; suffix += 1) {
    const taken = await prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
    slug = `${base}-${suffix}`;
  }
}

/** Everything the course edit page shows: settings, modules with chapters, and loose chapters. */
export async function loadCourseBuilder(user: SessionUser, courseSlug: string): Promise<CourseBuilderView> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const [course, looseChapters] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id: owned.id },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverUrl: true,
        projectGoal: true,
        difficulty: true,
        estimatedHours: true,
        category: true,
        subcategory: true,
        tags: true,
        sequential: true,
        status: true,
        pricingType: true,
        priceCents: true,
        currency: true,
        familySlug: true,
        variantFamily: true,
        activeReleaseId: true,
        _count: { select: { enrollments: { where: CONFIRMED_ENROLLMENT_WHERE } } },
        modules: {
          where: { archivedAt: null },
          orderBy: { order: "asc" },
          select: { id: true, title: true, order: true, chapters: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: builderChapterSelect } },
        },
      },
    }),
    prisma.chapter.findMany({
      where: { courseId: owned.id, moduleId: null, archivedAt: null },
      orderBy: { order: "asc" },
      select: builderChapterSelect,
    }),
  ]);

  const { _count, modules, familySlug, variantFamily, activeReleaseId, ...settings } = course;
  let builderModules = modules.map((module) => ({ ...module, chapters: module.chapters.map(toBuilderChapter) }));
  if (activeReleaseId) {
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: activeReleaseId } });
    const shared = (release.content as unknown as ReleaseContent).variants[variantForRelease(resolveCourseFamily(familySlug, variantFamily), null)] ?? [];
    const rows = new Map(modules.flatMap(module => module.chapters.map(chapter => [chapter.id, chapter] as const)));
    const moduleRows = new Map(modules.map(module => [module.id, module]));
    const activeIds = new Set(shared.flatMap(module => module.chapters.map(chapter => chapter.id)));
    builderModules = shared.map(module => ({ id: module.id, title: moduleRows.get(module.id)?.title ?? module.title,
      order: moduleRows.get(module.id)?.order ?? module.order,
      chapters: module.chapters.map(chapter => {
        const row = rows.get(chapter.id);
        if (!row) throw new ConflictError("Course release refers to a missing chapter.");
        return toBuilderChapter({ ...row, title: chapter.title, slug: chapter.slug, order: chapter.order,
          estimatedMinutes: chapter.estimatedMinutes, readerMode: chapter.readerMode, isMilestone: chapter.isMilestone });
      }).concat((moduleRows.get(module.id)?.chapters ?? []).filter(chapter => !activeIds.has(chapter.id) && !chapter.publishedAt).map(toBuilderChapter)),
    }));
    for (const module of modules) if (!builderModules.some(item => item.id === module.id) && module.chapters.some(chapter => !chapter.publishedAt)) {
      builderModules.push({ id: module.id, title: module.title, order: module.order,
        chapters: module.chapters.filter(chapter => !chapter.publishedAt).map(toBuilderChapter) });
    }
    builderModules.sort((a, b) => a.order - b.order);
  }
  return {
    course: {
      ...settings,
      enrollmentCount: _count.enrollments,
      modules: builderModules,
    },
    looseChapters: looseChapters.filter(chapter => !activeReleaseId || !chapter.publishedAt).map(toBuilderChapter),
  };
}

/** Course settings without the full curriculum payload. */
export async function loadCourseSettings(user: SessionUser, courseSlug: string): Promise<CourseSettingsView> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const { _count, ...course } = await prisma.course.findUniqueOrThrow({
    where: { id: owned.id },
    select: {
      id: true, slug: true, title: true, description: true, projectGoal: true,
      difficulty: true, estimatedHours: true, category: true, subcategory: true, tags: true, sequential: true, autoGradeOpenQuestions: true, coverUrl: true,
      status: true, pricingType: true, priceCents: true, currency: true, integritySnapshots: true,
      familySlug: true, variantFamily: true, variantAssignment: true,
      _count: {
        select: {
          enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          chapters: { where: { archivedAt: null } },
        },
      },
    },
  });
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { zipImportEnabled: true } });
  const { variantFamily, ...settings } = course;
  return { ...settings, hasVariants: Boolean(resolveCourseFamily(course.familySlug, variantFamily)), enrollmentCount: _count.enrollments, chapterCount: _count.chapters, zipImportEnabled: account?.zipImportEnabled ?? false };
}

/** Read-only preview of the latest saved draft, available to the course team. */
export async function loadCourseDraftPreview(user: SessionUser, courseSlug: string): Promise<CourseDraftPreview> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: owned.id },
    select: {
      id: true, slug: true, title: true, description: true, projectGoal: true, coverUrl: true, status: true,
        difficulty: true, estimatedHours: true, category: true, subcategory: true, tags: true,
      activeReleaseId: true, familySlug: true, variantFamily: true,
      modules: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: { id: true, title: true, chapters: { where: { archivedAt: null }, orderBy: { order: "asc" }, select: {
          id: true, title: true, slug: true, readerMode: true, publishedAt: true, source: true,
          estimatedMinutes: true, isMilestone: true, summary: true,
          releaseDraft: { select: { title: true, readerMode: true, source: true, estimatedMinutes: true, isMilestone: true, summary: true } },
        } } },
      },
    },
  });
  const { modules, activeReleaseId, familySlug, variantFamily, ...settings } = course;
  type Row = (typeof modules)[number]["chapters"][number];
  const toPreview = (row: Row, snapshot?: { title: string; slug: string; readerMode: Row["readerMode"]; estimatedMinutes?: number | null; isMilestone?: boolean; summary?: string | null }) => ({
    id: row.id,
    title: row.releaseDraft?.title ?? snapshot?.title ?? row.title,
    slug: snapshot?.slug ?? row.slug,
    readerMode: row.releaseDraft?.readerMode ?? snapshot?.readerMode ?? row.readerMode,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    source: row.releaseDraft?.source ?? row.source,
    hasDraft: Boolean(row.releaseDraft) || !row.publishedAt,
    estimatedMinutes: row.releaseDraft?.estimatedMinutes ?? snapshot?.estimatedMinutes ?? row.estimatedMinutes ?? null,
    isMilestone: row.releaseDraft?.isMilestone ?? snapshot?.isMilestone ?? row.isMilestone ?? false,
    summary: row.releaseDraft?.summary ?? snapshot?.summary ?? row.summary ?? null,
  });
  let previewModules: CourseDraftPreview["modules"] = modules.map(module => ({
    id: module.id, title: module.title, chapters: module.chapters.map(chapter => toPreview(chapter)),
  }));
  if (activeReleaseId) {
    const release = await prisma.courseRelease.findFirstOrThrow({ where: { id: activeReleaseId, courseId: course.id } });
    const shared = (release.content as unknown as ReleaseContent).variants[
      variantForRelease(resolveCourseFamily(familySlug, variantFamily), null)] ?? [];
    const rows = new Map(modules.flatMap(module => module.chapters.map(chapter => [chapter.id, chapter] as const)));
    const moduleRows = new Map(modules.map(module => [module.id, module] as const));
    const activeIds = new Set(shared.flatMap(module => module.chapters.map(chapter => chapter.id)));
    previewModules = shared.map(module => ({
      id: module.id, title: moduleRows.get(module.id)?.title ?? module.title,
      chapters: module.chapters.map(chapter => {
        const row = rows.get(chapter.id);
        if (!row) throw new ConflictError("Course release refers to a missing chapter.");
        return toPreview(row, chapter);
      }).concat((moduleRows.get(module.id)?.chapters ?? [])
        .filter(chapter => !chapter.publishedAt && !activeIds.has(chapter.id)).map(chapter => toPreview(chapter))),
    }));
    for (const module of modules) if (!shared.some(item => item.id === module.id)) {
      const drafts = module.chapters.filter(chapter => !chapter.publishedAt && !activeIds.has(chapter.id));
      if (drafts.length) previewModules.push({ id: module.id, title: module.title, chapters: drafts.map(chapter => toPreview(chapter)) });
    }
  }
  return {
    course: settings,
    modules: previewModules,
  };
}

export async function updateCourseSettings(user: SessionUser, courseId: string, input: CourseSettingsBody): Promise<void> {
  await requireCourseById(user, courseId);

  if (input.variantAssignment === "RANDOM") {
    const { familySlug, variantFamily } = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { familySlug: true, variantFamily: true } });
    if (!resolveCourseFamily(familySlug, variantFamily)) {
      const reason = "Only a course in a course family has variants to assign.";
      throw new UnprocessableError(reason, "VALIDATION_ERROR", [reason]);
    }
  }

  let priceCents = 0;
  if (input.pricingType === "PAID") {
    if (input.priceDollars === "") {
      throw new UnprocessableError("Enter a price for paid courses.", TEACH_ERROR_CODES.COURSE_NOT_PUBLISHABLE, ["Enter a price for paid courses."]);
    }
    priceCents = Math.round(input.priceDollars * 100);
    if (priceCents <= 0) {
      throw new UnprocessableError("Paid courses need a price greater than zero.", TEACH_ERROR_CODES.COURSE_NOT_PUBLISHABLE, ["Paid courses need a price greater than zero."]);
    }
  }

  const managed = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { repositorySourceHash: true } });
  if (managed.repositorySourceHash && (input.pricingType !== "PAID" || priceCents !== 1000 || input.currency.toUpperCase() !== "USD")) {
    throw new UnprocessableError("Repository-managed courses must be priced at $10 USD.");
  }

  await prisma.course.update({
    where: { id: courseId },
    data: {
      title: input.title,
      description: input.description || null,
      coverUrl: input.coverUrl || null,
      projectGoal: input.projectGoal || null,
      difficulty: input.difficulty || null,
      estimatedHours: input.estimatedHours === "" ? null : input.estimatedHours,
      ...(input.category ? { category: input.category } : {}),
      ...(input.subcategory !== undefined ? { subcategory: input.subcategory || null } : {}),
      ...(input.tags ? { tags: [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))] } : {}),
      sequential: input.sequential,
      autoGradeOpenQuestions: input.autoGradeOpenQuestions,
      ...(input.variantAssignment ? { variantAssignment: input.variantAssignment } : {}),
      pricingType: input.pricingType,
      priceCents,
      currency: input.currency.toUpperCase(),
    },
  });
}

export async function publishCourse(user: SessionUser, courseId: string): Promise<CourseSlugResult> {
  const owned = await requireCourseById(user, courseId);
  if (owned.status !== "PUBLISHED") {
    const course = await prisma.course.findUniqueOrThrow({
      where: { id: owned.id },
      select: { pricingType: true, priceCents: true, _count: { select: { chapters: { where: { archivedAt: null } } } } },
    });
    const reasons = validateCoursePublish({
      status: owned.status,
      pricingType: course.pricingType,
      priceCents: course.priceCents,
      chapterCount: course._count.chapters,
      // The publish operation below snapshots every chapter together.
      publishedChapterCount: course._count.chapters,
    });
    if (reasons.length > 0) {
      throw new UnprocessableError(reasons.join(" "), TEACH_ERROR_CODES.COURSE_NOT_PUBLISHABLE, reasons);
    }
  }
  // Publishing the course is the single action that validates and snapshots
  // every chapter draft before the course becomes visible in the catalog.
  await publishChapters(user, { courseId: owned.id });
  if (owned.status === "PUBLISHED" || owned.status === "ARCHIVED") {
    await prisma.$transaction(tx => publishDashboardStructureRelease(tx, owned.id), { isolationLevel: "Serializable" });
    if (owned.status === "PUBLISHED") return { courseSlug: owned.slug };
  }

  await prisma.course.update({ where: { id: owned.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await prisma.$transaction(async tx => { await ensureBaselineRelease(tx, owned.id); });
  return { courseSlug: owned.slug };
}

/** Published → ARCHIVED when learners are enrolled (after confirmation), otherwise back to DRAFT. */
export async function unpublishCourse(
  user: SessionUser,
  courseId: string,
  options: { confirmedWithEnrollments?: boolean }
): Promise<CourseSlugResult> {
  const owned = await requireCourseById(user, courseId);
  if (owned.status !== "PUBLISHED") return { courseSlug: owned.slug };

  const enrollments = await prisma.enrollment.count({ where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE } });
  if (enrollments > 0 && !options.confirmedWithEnrollments) {
    throw new ConflictError(
      `${enrollments} learner(s) are enrolled. Confirm you want to archive this course.`,
      TEACH_ERROR_CODES.ENROLLMENTS_CONFIRMATION_REQUIRED
    );
  }

  const nextStatus = enrollments > 0 ? "ARCHIVED" : "DRAFT";
  await prisma.course.update({
    where: { id: owned.id },
    data: { status: nextStatus, ...(nextStatus === "DRAFT" ? { publishedAt: null } : {}) },
  });
  return { courseSlug: owned.slug };
}

/** Archived courses with learner history stay versioned; only empty ones can become drafts. */
export async function restoreCourseToDraft(user: SessionUser, courseId: string): Promise<CourseSlugResult> {
  const owned = await requireCourseById(user, courseId);
  if (owned.status !== "ARCHIVED") return { courseSlug: owned.slug };
  const learners = await prisma.enrollment.count({ where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE } });
  if (learners) throw new ConflictError("This course has learners. Edit it while archived or publish it again so their progress stays safe.");
  await prisma.course.update({ where: { id: owned.id }, data: { status: "DRAFT", publishedAt: null } });
  return { courseSlug: owned.slug };
}

/**
 * Permanently deletes a course and everything under it (modules, chapters,
 * blocks, enrollments and learner history). Courses with learners need an
 * explicit confirmation flag.
 */
export async function deleteCourse(
  user: SessionUser,
  courseId: string,
  options: { confirmedWithEnrollments?: boolean }
): Promise<CourseSlugResult> {
  const owned = await requireCourseById(user, courseId);

  const enrollments = await prisma.enrollment.count({ where: { courseId: owned.id, ...CONFIRMED_ENROLLMENT_WHERE } });
  if (enrollments > 0 && !options.confirmedWithEnrollments) {
    throw new ConflictError(
      `${enrollments} learner(s) are enrolled. Deleting this course permanently removes their progress. Confirm you want to delete it.`,
      TEACH_ERROR_CODES.ENROLLMENTS_CONFIRMATION_REQUIRED
    );
  }

  await prisma.course.delete({ where: { id: owned.id } });
  return { courseSlug: owned.slug };
}
