import type { CatalogCourseDetail, CatalogCourseSummary } from "../../shared/api/catalog.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";
import { enrollmentGrantsContentAccess } from "../enrollment/lifecycle.js";
import { isCourseInstructor } from "../enrollment/own-course.js";
import { readReleaseContent, variantForRelease, type ReleaseModule } from "../courses/releases.js";

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  coverUrl: true,
  difficulty: true,
  estimatedHours: true,
  category: true,
  subcategory: true,
  tags: true,
  projectGoal: true,
  pricingType: true,
  priceCents: true,
  currency: true,
  mentorId: true,
  mentor: { select: { name: true } },
  ratingAverage: true,
  ratingCount: true,
  familySlug: true,
  variantFamily: true,
  activeReleaseId: true,
  _count: { select: { modules: { where: { archivedAt: null } }, chapters: { where: { archivedAt: null } } } },
} as const;

type ReleaseSource = { id: string; familySlug: string | null; variantFamily: unknown; activeReleaseId: string | null };

/**
 * The curriculum a new learner gets: the active release's default variant.
 * Republishing a changed lesson adds a new chapter row and keeps the old one live for learners
 * pinned to an earlier release, so counting live rows would list that lesson twice.
 * Returns null for a course with no release yet; callers then fall back to the live rows.
 */
async function activeReleaseModules(courses: ReleaseSource[]): Promise<Map<string, ReleaseModule[]>> {
  const releaseIds = courses.flatMap((course) => (course.activeReleaseId ? [course.activeReleaseId] : []));
  const releases = releaseIds.length
    ? await prisma.courseRelease.findMany({ where: { id: { in: releaseIds } }, select: { id: true, content: true } })
    : [];
  const contentById = new Map(releases.map((release) => [release.id, readReleaseContent(release.content)]));
  const result = new Map<string, ReleaseModule[]>();
  for (const course of courses) {
    const content = course.activeReleaseId ? contentById.get(course.activeReleaseId) : undefined;
    if (!content) continue;
    const variant = variantForRelease(resolveCourseFamily(course.familySlug, course.variantFamily), null);
    const modules = content.variants[variant] ?? content.variants.default;
    if (modules) result.set(course.id, modules);
  }
  return result;
}

/** Published courses. Anonymous visitors (the landing page) get no enrollment state. */
export async function listCatalog(userId: string | undefined): Promise<CatalogCourseSummary[]> {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: summarySelect,
  });
  const enrollments = userId
    ? await prisma.enrollment.findMany({
        where: { userId, courseId: { in: courses.map((course) => course.id) } },
        select: { courseId: true, lifecycle: true },
      })
    : [];
  const lifecycleByCourse = new Map(enrollments.map((row) => [row.courseId, row.lifecycle]));

  const releaseModules = await activeReleaseModules(courses);

  return courses.map(({ mentor, mentorId: _mentorId, _count, familySlug: _family, variantFamily: _variants, activeReleaseId: _release, ...course }) => {
    const modules = releaseModules.get(course.id);
    return {
      ...course,
      instructorName: mentor.name,
      moduleCount: modules ? modules.length : _count.modules,
      chapterCount: modules ? modules.reduce((sum, module) => sum + module.chapters.length, 0) : _count.chapters,
      enrollmentLifecycle: lifecycleByCourse.get(course.id) ?? null,
    };
  });
}

export async function getCatalogCourse(courseSlug: string, userId: string | undefined): Promise<CatalogCourseDetail> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: {
      ...summarySelect,
      status: true,
      modules: {
        where: { archivedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          chapters: {
            where: { archivedAt: null, publishedAt: { not: null } },
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, estimatedMinutes: true },
          },
        },
      },
    },
  });
  if (!course || course.status !== "PUBLISHED") throw new NotFoundError("Course not found");

  const enrollment = userId
    ? await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: course.id, userId } },
        select: { lifecycle: true },
      })
    : null;
  const { mentor, mentorId, _count, status: _status, familySlug: _family, variantFamily: _variants, activeReleaseId: _release, ...rest } = course;
  const releaseModules = (await activeReleaseModules([course])).get(course.id);
  const modules = releaseModules
    ? releaseModules.map((module) => ({
        id: module.id,
        title: module.title,
        order: module.order,
        chapters: module.chapters.map((chapter) => ({
          id: chapter.id, title: chapter.title, order: chapter.order, estimatedMinutes: chapter.estimatedMinutes,
        })),
      }))
    : rest.modules;

  return {
    ...rest,
    modules,
    instructorName: mentor.name,
    moduleCount: modules.length,
    chapterCount: modules.reduce((sum, module) => sum + module.chapters.length, 0),
    enrollmentLifecycle: enrollment?.lifecycle ?? null,
    // The course's instructor opens it free (see own-course.ts), so the catalog never asks them to pay.
    access: isCourseInstructor(userId, { mentorId })
      ? "active"
      : !enrollment
      ? "none"
      : enrollmentGrantsContentAccess(enrollment.lifecycle)
        ? "active"
        : enrollment.lifecycle === "PAYMENT_REQUIRED"
          ? "payment_required"
          : "none",
  };
}
