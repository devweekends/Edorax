import type { PrismaClient } from "../../generated/prisma/index.js";
import { lifecycleForSignedInEnrollment } from "./lifecycle.js";
import { cancelIssuedCouponUsage, redeemCouponUsage } from "../coupons/issue.js";
import { settleAssignment } from "../financials/settlement.js";
import { releaseOrganizationCredits, reserveOrganizationCredits } from "../organizations/credits.js";

/** After verified signup/login, attach pending Pathment enrollments for the same email. */
export async function linkLearnerProfileToUser(db: PrismaClient, userId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  const profile = await db.learnerProfile.findUnique({ where: { email: normalized } });
  if (!profile) return;

  await db.learnerProfile.update({
    where: { id: profile.id },
    data: { userId, linkedAt: new Date() },
  });

  const pending = await db.enrollment.findMany({
    where: {
      learnerProfileId: profile.id,
      userId: null,
    },
    include: { course: true, couponUsage: true, payment: true },
  });

  for (const enrollment of pending) {
    await db.$transaction(async (tx) => {
      const organizationListed = enrollment.source === "PATHMENT" && enrollment.organizationId
        ? Boolean(await tx.courseOrganizationAccess.findUnique({
          where: { courseId_organizationId: { courseId: enrollment.courseId, organizationId: enrollment.organizationId } },
        }))
        : false;
      const keptOrganizationFree = enrollment.payment?.status === "SUCCEEDED" && enrollment.payment.fundingSource === "organization_free";
      const settlement = settleAssignment({
        pricingType: enrollment.course.pricingType,
        channel: enrollment.source === "PATHMENT" ? "pathment" : "direct",
        organizationListed: keptOrganizationFree || organizationListed,
        originalAmountCents: enrollment.course.priceCents,
        instructorPayoutPercent: enrollment.course.instructorPayoutPercent,
        organizationContributionPercent: enrollment.couponUsage?.status !== "CANCELLED" ? enrollment.couponUsage?.percentOff : undefined,
      });

      if (keptOrganizationFree || settlement.priority.fundingSource === "organization_free" || settlement.priority.fundingSource === "free") {
        await cancelIssuedCouponUsage(tx, enrollment.id);
        await releaseOrganizationCredits(tx, enrollment.id);
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { userId, lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: enrollment.startedAt ?? new Date() },
        });
        if (!keptOrganizationFree) {
          await tx.payment.upsert({
            where: { enrollmentId: enrollment.id },
            create: { enrollmentId: enrollment.id, currency: enrollment.course.currency, ...settlement.payment },
            update: settlement.payment,
          });
        }
        return;
      }

      const coupon = enrollment.couponUsage?.status !== "CANCELLED" ? enrollment.couponUsage : null;
      const lifecycle = settlement.grantsAccess ? "ACTIVE" : lifecycleForSignedInEnrollment(enrollment.course.pricingType);
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { userId, lifecycle, status: lifecycle === "ACTIVE" ? "IN_PROGRESS" : enrollment.status, startedAt: lifecycle === "ACTIVE" ? new Date() : null },
      });
      if (!settlement.grantsAccess) {
        await tx.payment.upsert({
          where: { enrollmentId: enrollment.id },
          create: { enrollmentId: enrollment.id, currency: enrollment.course.currency, ...settlement.payment },
          update: coupon ? settlement.payment : {},
        });
        if (coupon && enrollment.organizationId) {
          await reserveOrganizationCredits(tx, {
            organizationId: enrollment.organizationId,
            enrollmentId: enrollment.id,
            amountCredits: settlement.financials.organizationContributionCents,
          });
        }
      } else if (coupon) {
        await tx.payment.upsert({
          where: { enrollmentId: enrollment.id },
          create: { enrollmentId: enrollment.id, currency: enrollment.course.currency, ...settlement.payment },
          update: settlement.payment,
        });
        if (enrollment.organizationId) {
          await reserveOrganizationCredits(tx, {
            organizationId: enrollment.organizationId,
            enrollmentId: enrollment.id,
            amountCredits: settlement.financials.organizationContributionCents,
          });
          await tx.organizationCreditTransaction.updateMany({
            where: { enrollmentId: enrollment.id, status: "RESERVED" },
            data: { status: "COMMITTED", committedAt: new Date() },
          });
        }
        await redeemCouponUsage(tx, enrollment.id);
      }
    });
  }
}
