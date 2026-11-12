import type { PrismaClient } from "../../generated/prisma/index.js";
import { assignmentForNewEnrollment } from "../courses/variant-assignment.js";
import { lifecycleForSignedInEnrollment } from "./lifecycle.js";
import { rankLearnerCoupons } from "../financials/coupon-priority.js";
import { settleAssignment } from "../financials/settlement.js";

export class SelfEnrollmentError extends Error {
  readonly code:
    | "COURSE_NOT_FOUND"
    | "NOT_PUBLISHED"
    | "ALREADY_ENROLLED"
    | "PAYMENT_PENDING"
    | "COUPON_INVALID"
    | "COUPON_EXHAUSTED"
    | "COUPON_NOT_APPLICABLE";
  constructor(code: SelfEnrollmentError["code"], message: string) {
    super(message);
    this.name = "SelfEnrollmentError";
    this.code = code;
  }
}

export type SelfEnrollmentResult = {
  enrollmentId: string;
  courseSlug: string;
  lifecycle: ReturnType<typeof lifecycleForSignedInEnrollment>;
  created: boolean;
  couponApplied?: boolean;
};

export async function createSelfEnrollment(
  db: PrismaClient,
  input: { userId: string; courseId: string; couponCode?: string }
): Promise<SelfEnrollmentResult> {
  const course = await db.course.findUnique({
    where: { id: input.courseId },
    select: {
      id: true,
      slug: true,
      status: true,
      pricingType: true,
      priceCents: true,
      currency: true,
      instructorPayoutPercent: true,
    },
  });
  if (!course) throw new SelfEnrollmentError("COURSE_NOT_FOUND", "Course not found.");
  if (course.status !== "PUBLISHED") {
    throw new SelfEnrollmentError("NOT_PUBLISHED", "This course is not open for enrollment.");
  }

  const couponCode = input.couponCode?.trim().toUpperCase();
  const defaultLifecycle = lifecycleForSignedInEnrollment(course.pricingType);

  const result = await db.$transaction(async (tx) => {
    let lifecycle = defaultLifecycle;
    const existing = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: input.userId } },
      include: { payment: true },
    });
    if (existing) {
      const organizationCoupon = await tx.couponUsage.findUnique({ where: { enrollmentId: existing.id }, select: { status: true } });
      if (organizationCoupon && organizationCoupon.status !== "CANCELLED") {
        throw new SelfEnrollmentError("COUPON_NOT_APPLICABLE", "This enrollment already has an organization discount assigned.");
      }
    }
    // A dropped or cancelled row can be re-enrolled by the learner at their own cost. The same row is
    // reused because (courseId, userId) is unique; any organization link is released.
    const dropped = Boolean(existing && (existing.lifecycle === "CANCELLED" || existing.status === "DROPPED"));
    if (existing && !dropped && existing.lifecycle !== "PAYMENT_REQUIRED") {
      throw new SelfEnrollmentError("ALREADY_ENROLLED", "You are already enrolled in this course.");
    }
    if (existing && await tx.instructorCouponRedemption.findUnique({ where: { enrollmentId: existing.id }, select: { id: true } })) {
      throw new SelfEnrollmentError("PAYMENT_PENDING", "A discount has already been applied to this enrollment.");
    }

    let coupon: { id: string; percentOff: number; campaignId: string | null } | null = null;
    if (couponCode || course.pricingType === "PAID") {
      if (course.pricingType !== "PAID") throw new SelfEnrollmentError("COUPON_NOT_APPLICABLE", "Coupons are only available for paid courses.");
      const offers = couponCode
        ? []
        : await tx.instructorCoupon.findMany({
            where: { courseId: course.id, active: true, autoApply: true, redemptionCount: { lt: 1000000 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            include: { campaign: true },
          });
      const eligible = rankLearnerCoupons(offers.filter((candidate) => candidate.redemptionCount < candidate.maxRedemptions && (!candidate.campaign || (candidate.campaign.active && candidate.campaign.redemptionCount < candidate.campaign.maxRedemptions && (!candidate.campaign.expiresAt || candidate.campaign.expiresAt > new Date())))));
      const found = couponCode
        ? await tx.instructorCoupon.findUnique({ where: { courseId_code: { courseId: course.id, code: couponCode } }, include: { campaign: true } })
        : eligible[0] ?? null;
      if (!couponCode && !found) {
        // No automatic offer applies; continue at the regular course price.
      } else {
        if (!found || !found.active || (found.expiresAt && found.expiresAt <= new Date()) || (found.campaignId && (!found.campaign?.active || found.campaign.redemptionCount >= found.campaign.maxRedemptions || (found.campaign.expiresAt && found.campaign.expiresAt <= new Date())))) {
          throw new SelfEnrollmentError("COUPON_INVALID", "This coupon is invalid or expired.");
        }
        if (found.campaignId) {
          const campaignReserved = await tx.courseDiscountCampaign.updateMany({
            where: { id: found.campaignId, active: true, redemptionCount: { lt: found.campaign!.maxRedemptions }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            data: { redemptionCount: { increment: 1 } },
          });
          if (!campaignReserved.count) throw new SelfEnrollmentError("COUPON_EXHAUSTED", "This discount has no redemptions remaining.");
        }
        const reserved = await tx.instructorCoupon.updateMany({
          where: { id: found.id, active: true, redemptionCount: { lt: found.maxRedemptions }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          data: { redemptionCount: { increment: 1 } },
        });
        if (!reserved.count) throw new SelfEnrollmentError("COUPON_EXHAUSTED", "This coupon has no redemptions remaining.");
        coupon = { id: found.id, percentOff: found.percentOff, campaignId: found.campaignId };
        lifecycle = found.percentOff === 100 ? "ACTIVE" : "PAYMENT_REQUIRED";
      }
    }

    if (existing?.lifecycle === "PAYMENT_REQUIRED" && !coupon) {
      throw new SelfEnrollmentError("PAYMENT_PENDING", "Complete payment or apply a discount to access this course.");
    }

    const settlement = settleAssignment({
      pricingType: course.pricingType,
      channel: "direct",
      organizationListed: false,
      originalAmountCents: course.priceCents,
      instructorPayoutPercent: coupon?.campaignId ? 50 : course.instructorPayoutPercent,
      learnerDiscountPercent: coupon?.percentOff,
      learnerCouponFunding: coupon ? (coupon.campaignId ? "admin_coupon" : "instructor_coupon") : undefined,
    });
    lifecycle = settlement.grantsAccess ? "ACTIVE" : "PAYMENT_REQUIRED";

    if (existing) {
      const accessGranted = lifecycle === "ACTIVE";
      const row = await tx.enrollment.update({ where: { id: existing.id }, data: {
        lifecycle, status: accessGranted ? "IN_PROGRESS" : "ASSIGNED", startedAt: accessGranted ? existing.startedAt ?? new Date() : null,
        ...(dropped ? { organizationId: null, source: "SELF" as const, externalAssignmentId: null, externalMentorId: null } : {}),
      } });
      if (existing.payment) await tx.payment.update({ where: { enrollmentId: existing.id }, data: settlement.payment });
      else await tx.payment.create({
        data: { enrollmentId: existing.id, currency: course.currency, ...settlement.payment },
      });
      if (coupon) await tx.instructorCouponRedemption.create({ data: { couponId: coupon.id, enrollmentId: existing.id, userId: input.userId, percentOff: coupon.percentOff } });
      return { row, lifecycle, created: false, couponApplied: Boolean(coupon) };
    }

    const assignment = await assignmentForNewEnrollment(tx, course.id);
    const row = await tx.enrollment.create({
      data: {
        ...assignment,
        courseId: course.id,
        userId: input.userId,
        source: "SELF",
        lifecycle,
        status: lifecycle === "ACTIVE" ? "IN_PROGRESS" : "ASSIGNED",
        startedAt: lifecycle === "ACTIVE" ? new Date() : null,
      },
    });

    await tx.payment.create({
      data: { enrollmentId: row.id, currency: course.currency, ...settlement.payment },
    });

    if (coupon) await tx.instructorCouponRedemption.create({ data: { couponId: coupon.id, enrollmentId: row.id, userId: input.userId, percentOff: coupon.percentOff } });

    return { row, lifecycle, created: true, couponApplied: Boolean(coupon) };
  });

  return {
    enrollmentId: result.row.id,
    courseSlug: course.slug,
    lifecycle: result.lifecycle,
    created: result.created,
    couponApplied: result.couponApplied,
  };
}
