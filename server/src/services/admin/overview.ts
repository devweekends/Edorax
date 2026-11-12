import type { AdminCourseRow, AdminCoursesView, AdminOverview } from "../../shared/api/admin.js";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { CsvTable } from "../../utils/csv.js";
import type { ListCoursesQuery } from "../../validations/admin.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";
import { pageInfo, resolvePaging } from "./paging.js";

/** Upper bound on exported rows (see ADMIN_EXPORT_LIMIT in users.ts). */
const COURSE_EXPORT_LIMIT = 10_000;

/** Shared filter clause for the list view and the CSV export. */
function buildCourseWhere(filters: ListCoursesQuery): Prisma.CourseWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query
      ? {
          OR: [
            { title: { contains: filters.query, mode: "insensitive" as const } },
            { slug: { contains: filters.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** Tile counts for the admin home and the shell's badges. */
export async function loadOverview(): Promise<AdminOverview> {
  const [organizations, pendingCourseRequests, publishedCourses, instructors] = await Promise.all([
    prisma.organization.count(),
    prisma.organizationCourseRequest.count({ where: { status: "PENDING" } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.user.count({ where: { role: "MENTOR" } }),
  ]);
  return { organizations, pendingCourseRequests, publishedCourses, instructors };
}

/** Read-only catalog for support and allocation decisions, searchable and paged. */
export async function listCourses(filters: ListCoursesQuery = {}): Promise<AdminCoursesView> {
  const where = buildCourseWhere(filters);
  const total = await prisma.course.count({ where });
  const paging = resolvePaging(filters, total);

  const rows = await prisma.course.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: paging.skip,
    take: paging.take,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      pricingType: true,
      priceCents: true,
      currency: true,
      updatedAt: true,
      mentor: { select: { email: true, name: true } },
      _count: {
        select: {
          enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          organizationCourses: true,
        },
      },
    },
  });

  const courses = rows.map(({ mentor, _count, updatedAt, ...course }): AdminCourseRow => ({
    ...course,
    updatedAt: updatedAt.toISOString(),
    instructorLabel: mentor.name ?? mentor.email,
    enrollmentCount: _count.enrollments,
    allocationCount: _count.organizationCourses,
  }));

  return { courses, page: pageInfo(paging) };
}

/** Rows for the courses CSV export (same filters as the list, capped). */export async function exportCourses(filters: ListCoursesQuery = {}): Promise<CsvTable> {
  const courses = await prisma.course.findMany({
    where: buildCourseWhere(filters),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: COURSE_EXPORT_LIMIT,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      pricingType: true,
      priceCents: true,
      currency: true,
      updatedAt: true,
      mentor: { select: { email: true, name: true } },
      _count: {
        select: {
          enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          organizationCourses: true,
        },
      },
    },
  });
  return {
    header: ["id", "slug", "title", "status", "pricingType", "priceCents", "currency", "instructor", "enrollments", "allocations", "updatedAt"],
    rows: courses.map((course) => [
      course.id,
      course.slug,
      course.title,
      course.status,
      course.pricingType,
      course.priceCents,
      course.currency,
      course.mentor.name ?? course.mentor.email,
      course._count.enrollments,
      course._count.organizationCourses,
      course.updatedAt.toISOString(),
    ]),
  };
}
