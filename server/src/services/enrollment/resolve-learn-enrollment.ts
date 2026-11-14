import type { Enrollment, Role } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { isMentorOfCourse } from "../auth/access-rules.js";
import { enrollmentGrantsContentAccess } from "./lifecycle.js";
import { adminWaiverSnapshot } from "../financials/settlement.js";
import { ensureOwnCourseEnrollment, isCourseInstructor } from "./own-course.js";

export type LearnAccessDenial =
  | "not_enrolled"
  | "payment_required"
  | "pending_account"
  | "inactive";

export function learnAccessDenial(
  enrollment: Pick<Enrollment, "lifecycle" | "userId"> | null
): LearnAccessDenial | null {
  if (!enrollment) return "not_enrolled";
  if (!enrollment.userId) return "pending_account";
  if (enrollment.lifecycle === "PAYMENT_REQUIRED") return "payment_required";
  if (!enrollmentGrantsContentAccess(enrollment.lifecycle)) return "inactive";
  return null;
}

/** Active enrollment for chapter read + block submit (creates instructor preview enrollment when needed). */
export async function resolveLearnEnrollment(
  user: { id: string; role: Role },
  courseId: string
): Promise<Enrollment> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, mentorId: true, priceCents: true, pricingType: true },
  });
  if (!course) throw new NotFoundError("Course not found");

  // The course's own instructor always gets in free, even over an earlier enrollment left awaiting payment.
  if (isCourseInstructor(user.id, course)) {
    return ensureOwnCourseEnrollment(prisma, { courseId, userId: user.id });
  }

  let enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId, userId: user.id } },
  });

  if (!enrollment && isMentorOfCourse(user.id, user.role, course)) {
    enrollment = await prisma.enrollment.create({
      data: {
        courseId,
        userId: user.id,
        lifecycle: "ACTIVE",
        status: "IN_PROGRESS",
        source: "DIRECT",
        startedAt: new Date(),
        // An admin previewing a course gets the same no-charge record as an admin enrollment,
        // so the admin enrollments page labels it. Instructors previewing their own course get none.
        ...(user.role === "ADMIN"
          ? { payment: { create: adminWaiverSnapshot({ originalAmountCents: course.priceCents, pricingType: course.pricingType }) } }
          : {}),
      },
    });
  }

  const denial = learnAccessDenial(enrollment);
  if (denial) throw new LearnAccessError(denial);

  return enrollment!;
}

export class LearnAccessError extends Error {
  readonly code: LearnAccessDenial;
  constructor(code: LearnAccessDenial) {
    super(`Learn access denied: ${code}`);
    this.name = "LearnAccessError";
    this.code = code;
  }
}
