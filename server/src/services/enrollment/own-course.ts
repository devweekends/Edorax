import type { Enrollment, Prisma, PrismaClient } from "../../generated/prisma/index.js";
import { enrollmentGrantsContentAccess } from "./lifecycle.js";

type Db = PrismaClient | Prisma.TransactionClient;

/** The instructor of a course never pays for it: they get the same free access as the instructor preview. */
export function isCourseInstructor(userId: string | undefined | null, course: { mentorId: string }): boolean {
  return Boolean(userId) && course.mentorId === userId;
}

/**
 * Opens the instructor's own course for them, with no payment and no coupon, matching the instructor
 * preview in resolve-learn-enrollment.ts. Reuses an earlier enrollment (for example one left awaiting
 * payment) instead of making a second one. A payment row it already has is left as it is.
 */
export async function ensureOwnCourseEnrollment(db: Db, input: { courseId: string; userId: string }): Promise<Enrollment> {
  const where = { courseId_userId: { courseId: input.courseId, userId: input.userId } };
  const existing = await db.enrollment.findUnique({ where });
  if (existing && enrollmentGrantsContentAccess(existing.lifecycle)) return existing;
  if (existing) {
    return db.enrollment.update({
      where: { id: existing.id },
      data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: existing.startedAt ?? new Date() },
    });
  }
  // upsert so two tabs opening the course at once do not trip the (courseId, userId) unique key.
  return db.enrollment.upsert({
    where,
    create: { ...input, lifecycle: "ACTIVE", status: "IN_PROGRESS", source: "DIRECT", startedAt: new Date() },
    update: {},
  });
}
