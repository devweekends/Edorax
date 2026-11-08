import type { Enrollment, PrismaClient } from "../../../generated/prisma/index.js";
import { releaseEnrollmentSlot } from "../allocation.js";
import { pathmentAssignmentId } from "./enrollment-idempotency.js";
import { PathmentEnrollmentError } from "./create-pathment-enrollment.js";
import { cancelIssuedCouponUsage } from "../../coupons/issue.js";
import { releaseOrganizationCredits } from "../../organizations/credits.js";

export type CancelPathmentEnrollmentInput = {
  organizationId: string;
  courseId: string;
  email: string;
  /** Must match the organization slug from API credentials. */
  orgSlug: string;
  /** Buildment User.id when the tenant knows it; optional for pre-signup rows. */
  userId?: string | null;
  /** Tenant mentor identifier; must match enrollment.externalMentorId when set. */
  mentorId?: string | null;
  externalAssignmentId?: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isCancelled(enrollment: Pick<Enrollment, "lifecycle" | "status">): boolean {
  return enrollment.lifecycle === "CANCELLED" || enrollment.status === "DROPPED";
}

async function loadEnrollmentForCancel(
  db: PrismaClient,
  organizationId: string,
  input: CancelPathmentEnrollmentInput
) {
  const email = normalizeEmail(input.email);
  const assignmentId = input.externalAssignmentId?.trim()
    ? input.externalAssignmentId.trim()
    : pathmentAssignmentId({
        organizationId,
        courseId: input.courseId,
        studentEmail: email,
        mentorId: input.mentorId,
      });

  const include = {
    learnerProfile: true,
    user: true,
    course: { select: { id: true, title: true } },
  } as const;

  const byAssignment = await db.enrollment.findFirst({
    where: {
      organizationId,
      externalAssignmentId: assignmentId,
    },
    include,
  });
  if (byAssignment) return byAssignment;

  return db.enrollment.findFirst({
    where: {
      organizationId,
      courseId: input.courseId,
      OR: [{ learnerProfile: { email } }, { user: { email } }],
    },
    include,
  });
}

function assertEnrollmentMatchesRequest(
  enrollment: Enrollment & {
    learnerProfile: { email: string; userId: string | null } | null;
    user: { id: string; email: string } | null;
  },
  input: CancelPathmentEnrollmentInput
) {
  const email = normalizeEmail(input.email);
  const rowEmail = enrollment.user?.email ?? enrollment.learnerProfile?.email;
  if (!rowEmail || normalizeEmail(rowEmail) !== email) {
    throw new PathmentEnrollmentError(404, "Enrollment not found for this email");
  }

  if (input.userId?.trim()) {
    const requestedUserId = input.userId.trim();
    if (enrollment.userId) {
      if (enrollment.userId !== requestedUserId) {
        throw new PathmentEnrollmentError(409, "user_id does not match this enrollment");
      }
    } else if (enrollment.learnerProfile?.userId && enrollment.learnerProfile.userId !== requestedUserId) {
      throw new PathmentEnrollmentError(409, "user_id does not match this enrollment");
    }
  }

  if (input.mentorId?.trim()) {
    const requestedMentor = input.mentorId.trim();
    if (enrollment.externalMentorId && enrollment.externalMentorId !== requestedMentor) {
      throw new PathmentEnrollmentError(409, "mentor_id does not match this enrollment");
    }
  }
}

export async function cancelPathmentEnrollment(
  db: PrismaClient,
  auth: { organizationId: string; slug: string },
  input: CancelPathmentEnrollmentInput
) {
  if (input.orgSlug.trim() !== auth.slug) {
    throw new PathmentEnrollmentError(403, "org_slug does not match authenticated organization");
  }
  if (input.organizationId !== auth.organizationId) {
    throw new PathmentEnrollmentError(403, "Organization mismatch");
  }

  const enrollment = await loadEnrollmentForCancel(db, input.organizationId, input);
  if (!enrollment || enrollment.organizationId !== input.organizationId) {
    throw new PathmentEnrollmentError(404, "Enrollment not found");
  }

  if (enrollment.courseId !== input.courseId) {
    throw new PathmentEnrollmentError(404, "Enrollment not found for this course");
  }

  assertEnrollmentMatchesRequest(enrollment, input);

  const allocation = await db.organizationCourse.findUnique({
    where: {
      organizationId_courseId: {
        organizationId: input.organizationId,
        courseId: input.courseId,
      },
    },
  });
  if (!allocation) {
    throw new PathmentEnrollmentError(
      403,
      "Course is not allocated to this organization"
    );
  }

  if (isCancelled(enrollment)) {
    return { enrollment, cancelled: false as const, alreadyCancelled: true as const };
  }

  const updated = await db.$transaction(async (tx) => {
    if (enrollment.source === "PATHMENT") {
      await releaseEnrollmentSlot(tx, input.organizationId, input.courseId);
    }
    await cancelIssuedCouponUsage(tx, enrollment.id);
    await releaseOrganizationCredits(tx, enrollment.id);
    await tx.payment?.updateMany({
      where: { enrollmentId: enrollment.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        lifecycle: "CANCELLED",
        status: "DROPPED",
      },
      include: { learnerProfile: true, user: true, course: true },
    });
  });

  return { enrollment: updated, cancelled: true as const, alreadyCancelled: false as const };
}
