import type { CourseOverview } from "../../shared/api/catalog.js";
import { buildCourseTrack } from "../../shared/lib/course-tracks.js";
import { prisma } from "../../db/prisma.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { shouldBypassProgressGating } from "../auth/seed-access.js";
import { enrollmentGrantsContentAccess } from "../enrollment/lifecycle.js";
import { ensureOwnCourseEnrollment, isCourseInstructor } from "../enrollment/own-course.js";
import { redeemCouponOnCourseOpen } from "../coupons/redeem.js";
import { pickDefaultOpenModule, resolveContinueChapterPath, syllabusForEnrollment } from "../progress/enrollment-syllabus.js";
import { releaseForEnrollment, releaseModulesWithBlocks, upgradeEnrollmentToRelease } from "./releases.js";
import { resolveCourseFamily } from "../../shared/lib/course-tracks.js";

/** Everything the course overview page shows, including whether the caller may read it. */
export async function getCourseOverview(courseSlug: string, user: SessionUser): Promise<CourseOverview> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      projectGoal: true,
      coverUrl: true,
      difficulty: true,
      estimatedHours: true,
      sequential: true,
      familySlug: true,
      variantFamily: true,
      availableVariantSlugs: true,
      status: true,
      activeReleaseId: true,
      mentorId: true,
      mentor: { select: { name: true } },
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
              blocks: { where: { archivedAt: null }, select: { type: true, required: true, archivedAt: true } },
            },
          },
        },
      },
    },
  });
  if (!course) throw new NotFoundError("Course not found");

  const { mentor, mentorId: _mentorId, modules: courseModules, sequential, familySlug, variantFamily, availableVariantSlugs, activeReleaseId, ...courseFields } = course;
  const base = { course: { ...courseFields, instructorName: mentor.name } };

  // The course's instructor opens it free, so they are never shown a payment step (see own-course.ts).
  const enrollment = isCourseInstructor(user.id, course)
    ? await ensureOwnCourseEnrollment(prisma, { courseId: course.id, userId: user.id })
    : await prisma.enrollment.findUnique({
        where: { courseId_userId: { courseId: course.id, userId: user.id } },
      });
  const myRatingRow = await prisma.courseRating.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    select: { rating: true, review: true, updatedAt: true },
  });
  const rating = myRatingRow
    ? { rating: myRatingRow.rating, review: myRatingRow.review, updatedAt: myRatingRow.updatedAt.toISOString() }
    : null;
  const ratingDismissed = Boolean(enrollment?.ratingDismissedAt);
  if (!enrollment) {
    return { ...base, access: "none", enrollment: null, rating, ratingDismissed, coupon: null, track: null, syllabus: null };
  }

  let curriculumUpgradeAvailable = false;
  if (activeReleaseId && enrollment.releaseId !== activeReleaseId) {
    if (enrollment.status === "COMPLETED") {
      curriculumUpgradeAvailable = true;
    } else {
      // Automatically shift active/in-progress learners to the latest active release while preserving progress & answers
      try {
        const upgraded = await prisma.$transaction((tx) =>
          upgradeEnrollmentToRelease(tx, enrollment.id, activeReleaseId), { timeout: 60_000 });
        if (upgraded) enrollment.releaseId = activeReleaseId;
        const refreshed = await prisma.enrollment.findUnique({
          where: { id: enrollment.id },
          select: { percentComplete: true, chaptersCompleted: true, pendingReviews: true },
        });
        if (refreshed) {
          enrollment.percentComplete = refreshed.percentComplete;
          enrollment.chaptersCompleted = refreshed.chaptersCompleted;
          enrollment.pendingReviews = refreshed.pendingReviews;
        }
      } catch {
        // Leave the learner on their working release so the overview still loads.
        curriculumUpgradeAvailable = true;
      }
    }
  }

  const summary = {
    percentComplete: enrollment.percentComplete,
    chaptersCompleted: enrollment.chaptersCompleted,
    pendingReviews: enrollment.pendingReviews,
    status: enrollment.status,
  };
  if (!enrollmentGrantsContentAccess(enrollment.lifecycle)) {
    return { ...base, access: "payment_required", enrollment: summary, rating, ratingDismissed, coupon: null, track: null, syllabus: null };
  }

  const coupon = await redeemCouponOnCourseOpen(enrollment.id);

  const selected = await releaseForEnrollment(course.id, enrollment, familySlug);
  const effectiveModules = selected ? await releaseModulesWithBlocks(selected.modules) : courseModules;
  const { modules, flatChapters } = await syllabusForEnrollment(
    { sequential, modules: effectiveModules },
    enrollment.id,
    shouldBypassProgressGating(user)
  );

  return {
    ...base,
    access: "active",
    enrollment: summary,
    rating,
    ratingDismissed,
    coupon,
    track: buildCourseTrack(variantFamily ? resolveCourseFamily(familySlug, variantFamily) : familySlug, enrollment, availableVariantSlugs),
    curriculumUpgradeAvailable,
    syllabus: {
      modules,
      chapterCount: flatChapters.length,
      continueHref: resolveContinueChapterPath(course.slug, flatChapters),
      defaultOpenModuleId: pickDefaultOpenModule(modules),
    },
  };
}

/** Upgrade an enrollment to the course's latest active release. */
export async function upgradeEnrollmentCurriculum(courseSlug: string, user: SessionUser) {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, activeReleaseId: true },
  });
  if (!course) throw new NotFoundError("Course not found");
  if (!course.activeReleaseId) throw new BadRequestError("Course has no active release");

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
  });
  if (!enrollment) throw new NotFoundError("Enrollment not found");

  const upgraded = await prisma.$transaction((tx) =>
    upgradeEnrollmentToRelease(tx, enrollment.id, course.activeReleaseId!), { timeout: 60_000 });
  if (!upgraded) throw new BadRequestError("Completed chapters have no match in the latest curriculum.");

  return { success: true, releaseId: course.activeReleaseId };
}
