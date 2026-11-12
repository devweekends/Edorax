import { prisma } from "../../db/prisma.js";
import { ForbiddenError, NotFoundError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { releaseForEnrollment } from "./releases.js";

// Course ratings are the macro signal: one per learner, unlocked once the learner
// has finished more than half of the course, editable, and prompted once when
// moving to the next chapter. Lesson-level problems go through help/report instead.

export type CourseRatingView = {
  rating: number;
  review: string | null;
  updatedAt: string;
};

export type CourseReviewItem = {
  id: string;
  rating: number;
  review: string;
  reviewer: string;
  createdAt: string;
};

export type CourseReviewsView = {
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
  items: CourseReviewItem[];
  total: number;
  page: number;
  pageSize: number;
};

async function publishedCourse(courseSlug: string) {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, status: true, familySlug: true },
  });
  if (!course || course.status !== "PUBLISHED") throw new NotFoundError("Course not found");
  return course;
}

/** First name plus last initial, or the email prefix. Keeps reviews readable without exposing full identities. */
function reviewerLabel(user: { name: string | null; email: string }): string {
  const name = user.name?.trim();
  if (!name) return user.email.split("@")[0] ?? "Learner";
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

export async function saveCourseRating(
  user: SessionUser,
  courseSlug: string,
  input: { rating: number; review?: string | null },
): Promise<CourseRatingView> {
  const course = await publishedCourse(courseSlug);
  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    select: {
      status: true,
      chaptersCompleted: true,
      percentComplete: true,
      releaseId: true,
      variantSlug: true,
    },
  });
  if (!enrollment) {
    throw new ForbiddenError("Complete more than half of the course before rating it.");
  }
  if (enrollment.status !== "COMPLETED" && enrollment.percentComplete <= 50) {
    const selected = await releaseForEnrollment(course.id, enrollment, course.familySlug);
    const totalChapters = selected
      ? selected.modules.reduce((sum, mod) => sum + mod.chapters.length, 0)
      : await prisma.chapter.count({
          where: {
            courseId: course.id,
            archivedAt: null,
            publishedAt: { not: null },
            module: { archivedAt: null },
          },
        });
    if (totalChapters <= 0 || enrollment.chaptersCompleted * 2 <= totalChapters) {
      throw new ForbiddenError("Complete more than half of the course before rating it.");
    }
  }

  const review = input.review?.trim() || null;
  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.courseRating.upsert({
      where: { courseId_userId: { courseId: course.id, userId: user.id } },
      create: { courseId: course.id, userId: user.id, rating: input.rating, review },
      update: { rating: input.rating, review },
      select: { rating: true, review: true, updatedAt: true },
    });
    // Keep the catalog aggregate in the same transaction as the write.
    const aggregate = await tx.courseRating.aggregate({
      where: { courseId: course.id },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.course.update({
      where: { id: course.id },
      data: { ratingAverage: aggregate._avg.rating, ratingCount: aggregate._count._all },
    });
    return row;
  });

  return { rating: saved.rating, review: saved.review, updatedAt: saved.updatedAt.toISOString() };
}

export async function getMyCourseRating(
  user: SessionUser,
  courseSlug: string,
): Promise<CourseRatingView | null> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!course) throw new NotFoundError("Course not found");
  const row = await prisma.courseRating.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    select: { rating: true, review: true, updatedAt: true },
  });
  return row ? { rating: row.rating, review: row.review, updatedAt: row.updatedAt.toISOString() } : null;
}

export async function listCourseReviews(
  courseSlug: string,
  options: { page: number; pageSize: number },
): Promise<CourseReviewsView> {
  const course = await publishedCourse(courseSlug);
  const where = { courseId: course.id, review: { not: null } };

  const [rows, total, aggregate, groups] = await Promise.all([
    prisma.courseRating.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        id: true,
        rating: true,
        review: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.courseRating.count({ where }),
    prisma.courseRating.aggregate({
      where: { courseId: course.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.courseRating.groupBy({
      by: ["rating"],
      where: { courseId: course.id },
      _count: { _all: true },
    }),
  ]);

  const byStars = new Map(groups.map((group) => [group.rating, group._count._all]));
  return {
    average: aggregate._avg.rating,
    count: aggregate._count._all,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: byStars.get(stars) ?? 0 })),
    items: rows
      .filter((row): row is typeof row & { review: string } => Boolean(row.review))
      .map((row) => ({
        id: row.id,
        rating: row.rating,
        review: row.review,
        reviewer: reviewerLabel(row.user),
        createdAt: row.createdAt.toISOString(),
      })),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export type CourseRatingReport = {
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
  recent: Array<{ id: string; rating: number; review: string | null; reviewer: string; createdAt: string }>;
};

/** Instructor-facing summary: aggregate plus the latest written reviews. */
export async function loadCourseRatingReport(courseId: string): Promise<CourseRatingReport> {
  const [aggregate, groups, recent] = await Promise.all([
    prisma.courseRating.aggregate({ where: { courseId }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.courseRating.groupBy({ by: ["rating"], where: { courseId }, _count: { _all: true } }),
    prisma.courseRating.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, rating: true, review: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const byStars = new Map(groups.map((group) => [group.rating, group._count._all]));
  return {
    average: aggregate._avg.rating,
    count: aggregate._count._all,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: byStars.get(stars) ?? 0 })),
    recent: recent.map((row) => ({
      id: row.id,
      rating: row.rating,
      review: row.review,
      reviewer: reviewerLabel(row.user),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** The learner said "Not now": remember it so the full prompt never returns. */
export async function dismissCourseRatingPrompt(
  user: SessionUser,
  courseSlug: string,
): Promise<{ dismissed: true }> {
  const course = await prisma.course.findUnique({ where: { slug: courseSlug }, select: { id: true } });
  if (!course) throw new NotFoundError("Course not found");
  await prisma.enrollment.updateMany({
    where: { courseId: course.id, userId: user.id },
    data: { ratingDismissedAt: new Date() },
  });
  return { dismissed: true };
}
