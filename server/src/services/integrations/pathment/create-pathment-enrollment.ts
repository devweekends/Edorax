import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  assertOrganizationCourseAllocation,
  consumeEnrollmentSlot,
} from "../allocation.js";
import { pathmentAssignmentId } from "./enrollment-idempotency.js";
import type { EnrollmentLifecycle } from "../../../generated/prisma/index.js";
import { assignmentForNewEnrollment } from "../../courses/variant-assignment.js";
import {
  pathmentEnrollmentPatch,
  shouldAttachPathmentOrg,
} from "./attach-org-enrollment.js";
import { cancelIssuedCouponUsage, issueCouponForEnrollment, redeemCouponUsage } from "../../coupons/issue.js";
import { paymentFromBreakdown } from "../../financials/calculator.js";
import { settleAssignment } from "../../financials/settlement.js";
import { releaseOrganizationCredits, reserveOrganizationCredits } from "../../organizations/credits.js";

export type PathmentEnrollmentInput = {
  organizationId: string;
  courseId: string;
  studentEmail: string;
  mentorId?: string | null;
  externalAssignmentId?: string | null;
};

export class PathmentEnrollmentError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PathmentEnrollmentError";
    this.status = status;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createPathmentEnrollment(
  db: PrismaClient,
  input: PathmentEnrollmentInput
) {
  const email = normalizeEmail(input.studentEmail);
  if (!email.includes("@")) {
    throw new PathmentEnrollmentError(400, "Invalid student_email");
  }

  const assignmentId = pathmentAssignmentId({
    organizationId: input.organizationId,
    courseId: input.courseId,
    studentEmail: email,
    mentorId: input.mentorId,
    externalAssignmentId: input.externalAssignmentId,
  });

  const existing = await db.enrollment.findFirst({
    where: {
      organizationId: input.organizationId,
      source: "PATHMENT",
      externalAssignmentId: assignmentId,
    },
    include: { learnerProfile: true, course: true },
  });
  if (existing) {
    return { enrollment: existing, created: false as const };
  }

  const course = await db.course.findUnique({
    where: { id: input.courseId },
    include: { organizationFreeAccesses: { where: { organizationId: input.organizationId }, select: { organizationId: true } } },
  });
  if (!course || course.status !== "PUBLISHED") {
    throw new PathmentEnrollmentError(404, "Course not found or not published");
  }

  const allocation = await db.organizationCourse.findUnique({
    where: {
      organizationId_courseId: {
        organizationId: input.organizationId,
        courseId: input.courseId,
      },
    },
  });
  assertOrganizationCourseAllocation(allocation);

  const linkedUser = await db.user.findUnique({ where: { email } });
  if (linkedUser) {
    const byUser = await db.enrollment.findUnique({
      where: { courseId_userId: { courseId: input.courseId, userId: linkedUser.id } },
    });
    if (byUser) {
      if (!shouldAttachPathmentOrg(byUser.organizationId, input.organizationId)) {
        throw new PathmentEnrollmentError(
          409,
          "Learner is enrolled through a different organization"
        );
      }
      if (
        !byUser.organizationId ||
        !byUser.externalAssignmentId ||
        byUser.externalAssignmentId !== assignmentId
      ) {
        const updated = await db.$transaction(async (tx) => {
          let row = await tx.enrollment.update({
            where: { id: byUser.id },
            data: pathmentEnrollmentPatch({ organizationId: input.organizationId, mentorId: input.mentorId, assignmentId }),
            include: { course: true, learnerProfile: true },
          });
          if (row.lifecycle === "PAYMENT_REQUIRED" || row.lifecycle === "PENDING_ACCOUNT") {
            const organizationListed = course.organizationFreeAccesses.length > 0;
            const settlement = settleAssignment({
              pricingType: course.pricingType,
              channel: "pathment",
              organizationListed,
              originalAmountCents: course.priceCents,
              instructorPayoutPercent: course.instructorPayoutPercent,
            });
            if (settlement.priority.fundingSource === "organization_free" || settlement.priority.fundingSource === "free") {
              await cancelIssuedCouponUsage(tx, row.id);
              await releaseOrganizationCredits(tx, row.id);
              row = await tx.enrollment.update({
                where: { id: row.id },
                data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: row.startedAt ?? new Date() },
                include: { course: true, learnerProfile: true },
              });
              await tx.payment.upsert({
                where: { enrollmentId: row.id },
                create: { enrollmentId: row.id, currency: course.currency, ...settlement.payment },
                update: settlement.payment,
              });
            } else {
              const coupon = await issueCouponForEnrollment(tx, {
                organizationId: input.organizationId, courseId: input.courseId, enrollmentId: row.id,
                userId: linkedUser.id, learnerEmail: email, assignedById: input.mentorId?.trim() || null,
              });
              const priced = settleAssignment({
                pricingType: course.pricingType,
                channel: "pathment",
                organizationListed: false,
                originalAmountCents: course.priceCents,
                instructorPayoutPercent: course.instructorPayoutPercent,
                organizationContributionPercent: coupon?.percentOff,
              });
              if (coupon && priced.grantsAccess) {
                await reserveOrganizationCredits(tx, {
                  organizationId: input.organizationId,
                  enrollmentId: row.id,
                  amountCredits: priced.financials.organizationContributionCents,
                });
                await tx.organizationCreditTransaction.updateMany({
                  where: { enrollmentId: row.id, status: "RESERVED" },
                  data: { status: "COMMITTED", committedAt: new Date() },
                });
                row = await tx.enrollment.update({ where: { id: row.id }, data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: new Date() }, include: { course: true, learnerProfile: true } });
                await tx.payment.upsert({
                  where: { enrollmentId: row.id },
                  create: { enrollmentId: row.id, currency: course.currency, ...priced.payment },
                  update: priced.payment,
                });
                await redeemCouponUsage(tx, row.id);
              } else if (coupon) {
                await tx.payment.upsert({
                  where: { enrollmentId: row.id },
                  create: { enrollmentId: row.id, currency: course.currency, ...priced.payment },
                  update: priced.payment,
                });
                await reserveOrganizationCredits(tx, {
                  organizationId: input.organizationId,
                  enrollmentId: row.id,
                  amountCredits: priced.financials.organizationContributionCents,
                });
              }
            }
          }
          return row;
        });
        return { enrollment: updated, created: false as const };
      }
      return { enrollment: byUser, created: false as const };
    }
  }

  return db.$transaction(async (tx) => {
    const freshAllocation = await tx.organizationCourse.findUnique({
      where: {
        organizationId_courseId: {
          organizationId: input.organizationId,
          courseId: input.courseId,
        },
      },
    });
    assertOrganizationCourseAllocation(freshAllocation!);
    await consumeEnrollmentSlot(tx, freshAllocation!.id);

    const learnerProfile = await tx.learnerProfile.upsert({
      where: { email },
      create: { email, userId: linkedUser?.id ?? null, linkedAt: linkedUser ? new Date() : null },
      update: linkedUser
        ? { userId: linkedUser.id, linkedAt: new Date() }
        : {},
    });

    const organizationListed = course.organizationFreeAccesses.length > 0;
    const preview = settleAssignment({
      pricingType: course.pricingType,
      channel: "pathment",
      organizationListed,
      originalAmountCents: course.priceCents,
      instructorPayoutPercent: course.instructorPayoutPercent,
    });
    let lifecycle: EnrollmentLifecycle = linkedUser
      ? (preview.grantsAccess ? "ACTIVE" : "PAYMENT_REQUIRED")
      : "PENDING_ACCOUNT";
    const assignment = await assignmentForNewEnrollment(tx, course.id);

    const enrollment = await tx.enrollment.create({
      data: {
        ...assignment,
        courseId: course.id,
        userId: linkedUser?.id ?? null,
        learnerProfileId: learnerProfile.id,
        organizationId: input.organizationId,
        lifecycle,
        source: "PATHMENT",
        externalMentorId: input.mentorId?.trim() || null,
        externalAssignmentId: assignmentId,
        status: lifecycle === "ACTIVE" ? "IN_PROGRESS" : "ASSIGNED",
      },
      include: { course: true, learnerProfile: true },
    });

    if (preview.priority.fundingSource === "free" || preview.priority.fundingSource === "organization_free") {
      await tx.payment.create({
        data: { enrollmentId: enrollment.id, currency: course.currency, ...preview.payment },
      });
      return { enrollment, created: true as const };
    }

    const coupon = preview.priority.skipOrganizationCoupon ? null : await issueCouponForEnrollment(tx, {
      organizationId: input.organizationId,
      courseId: course.id,
      enrollmentId: enrollment.id,
      userId: linkedUser?.id ?? null,
      learnerEmail: email,
      assignedById: input.mentorId?.trim() || null,
    });
    const priced = settleAssignment({
      pricingType: course.pricingType,
      channel: "pathment",
      organizationListed: false,
      originalAmountCents: course.priceCents,
      instructorPayoutPercent: course.instructorPayoutPercent,
      organizationContributionPercent: coupon?.percentOff,
    });

    if (coupon && priced.grantsAccess && linkedUser) {
      await reserveOrganizationCredits(tx, {
        organizationId: input.organizationId,
        enrollmentId: enrollment.id,
        amountCredits: priced.financials.organizationContributionCents,
      });
      await tx.organizationCreditTransaction.updateMany({
        where: { enrollmentId: enrollment.id, status: "RESERVED" },
        data: { status: "COMMITTED", committedAt: new Date() },
      });
      const unlocked = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: new Date() },
        include: { course: true, learnerProfile: true },
      });
      await tx.payment.create({
        data: { enrollmentId: enrollment.id, currency: course.currency, ...priced.payment },
      });
      await redeemCouponUsage(tx, enrollment.id);
      return { enrollment: unlocked, created: true as const };
    }

    if (lifecycle === "PAYMENT_REQUIRED" || lifecycle === "PENDING_ACCOUNT") {
      await tx.payment.create({
        data: {
          enrollmentId: enrollment.id,
          currency: course.currency,
          ...paymentFromBreakdown(priced.financials, { status: "PENDING" }),
        },
      });
      if (coupon && linkedUser) {
        await reserveOrganizationCredits(tx, {
          organizationId: input.organizationId,
          enrollmentId: enrollment.id,
          amountCredits: priced.financials.organizationContributionCents,
        });
      }
    }

    return { enrollment, created: true as const };
  });
}
