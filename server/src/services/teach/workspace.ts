import type { MentorCoursesView, TeachWorkspace } from "../../shared/api/teach.js";
import { prisma } from "../../db/prisma.js";
import type { SessionUser } from "../../types/auth.js";
import { loadInstructorAccessState } from "../instructor-access/status.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";
import { mentoredCoursesWhere } from "./access.js";
import { activityState, average } from "./helpers.js";

/** Sidebar data for the instructor shell: one row per mentored course plus the access state. */
export async function loadTeachWorkspace(user: SessionUser): Promise<TeachWorkspace> {
  const [rows, instructorAccess] = await Promise.all([
    prisma.course.findMany({
      where: mentoredCoursesWhere(user),
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        _count: {
          select: {
            chapters: { where: { archivedAt: null } },
            enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          },
        },
        enrollments: { where: CONFIRMED_ENROLLMENT_WHERE, select: { pendingReviews: true } },
        helpThreads: { where: { status: "OPEN" }, select: { id: true } },
      },
    }),
    loadInstructorAccessState(user),
  ]);

  return {
    instructorAccess,
    courses: rows.map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      status: course.status,
      chapterCount: course._count.chapters,
      learnerCount: course._count.enrollments,
      pendingReviews: course.enrollments.reduce((sum, item) => sum + item.pendingReviews, 0),
      openHelpRequests: course.helpThreads.length,
    })),
  };
}

/** The "My courses" page: per-course cohort signals and totals across them. */
export async function loadMentorCourses(user: SessionUser): Promise<MentorCoursesView> {
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { zipImportEnabled: true } });
  const now = Date.now();
  const rows = await prisma.course.findMany({
    where: mentoredCoursesWhere(user),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverUrl: true,
      status: true,
      updatedAt: true,
      _count: { select: { chapters: { where: { archivedAt: null } } } },
      enrollments: {
        where: CONFIRMED_ENROLLMENT_WHERE,
        select: { status: true, percentComplete: true, pendingReviews: true, lastActiveAt: true },
      },
      helpThreads: { where: { status: "OPEN" }, select: { id: true } },
    },
  });

  const courses = rows.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    coverUrl: course.coverUrl,
    status: course.status,
    chapterCount: course._count.chapters,
    learnerCount: course.enrollments.length,
    averageProgress: average(course.enrollments.map((item) => item.percentComplete)),
    completedLearners: course.enrollments.filter((item) => item.status === "COMPLETED").length,
    pendingReviews: course.enrollments.reduce((sum, item) => sum + item.pendingReviews, 0),
    openHelpRequests: course.helpThreads.length,
    inactiveLearners: course.enrollments.filter(
      (item) => item.status === "IN_PROGRESS" && activityState(item.lastActiveAt, now) === "inactive"
    ).length,
    updatedAt: course.updatedAt.toISOString(),
  }));

  return {
    courses,
    zipImportEnabled: account.zipImportEnabled,
    summary: {
      totalCourses: courses.length,
      publishedCourses: courses.filter((course) => course.status === "PUBLISHED").length,
      draftCourses: courses.filter((course) => course.status === "DRAFT").length,
      totalLearners: courses.reduce((sum, course) => sum + course.learnerCount, 0),
      pendingReviews: courses.reduce((sum, course) => sum + course.pendingReviews, 0),
      openHelpRequests: courses.reduce((sum, course) => sum + course.openHelpRequests, 0),
    },
  };
}
