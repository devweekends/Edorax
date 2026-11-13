import { prisma } from "../../db/prisma.js";
import { redeemCouponUsage } from "../coupons/issue.js";
import { commitOrganizationCredits } from "../organizations/credits.js";
import { logger } from "../../utils/logger.js";

export type PolarOrderPaidInput = {
  orderId: string;
  checkoutId: string | null;
  metadata: Record<string, unknown> | null | undefined;
};

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Grant course access after Polar reports order.paid.
 * Idempotent: already-succeeded payments / active enrollments are no-ops.
 */
export async function fulfillPolarOrderPaid(input: PolarOrderPaidInput): Promise<{ fulfilled: boolean; enrollmentId: string | null }> {
  const enrollmentIdFromMeta = metadataString(input.metadata, "enrollmentId");

  const enrollment = enrollmentIdFromMeta
    ? await prisma.enrollment.findUnique({
        where: { id: enrollmentIdFromMeta },
        include: { payment: true },
      })
    : input.checkoutId
      ? await prisma.enrollment.findFirst({
          where: { payment: { provider: "polar", providerRef: input.checkoutId } },
          include: { payment: true },
        })
      : null;

  if (!enrollment?.payment) {
    logger.warn({ orderId: input.orderId, checkoutId: input.checkoutId, enrollmentIdFromMeta }, "polar order.paid with no matching enrollment");
    return { fulfilled: false, enrollmentId: null };
  }

  if (enrollment.payment.status === "SUCCEEDED" || enrollment.lifecycle === "ACTIVE") {
    return { fulfilled: false, enrollmentId: enrollment.id };
  }

  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") {
    logger.warn({ enrollmentId: enrollment.id, lifecycle: enrollment.lifecycle, orderId: input.orderId }, "polar order.paid for enrollment not awaiting payment");
    return { fulfilled: false, enrollmentId: enrollment.id };
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.enrollment.updateMany({
      where: { id: enrollment.id, lifecycle: "PAYMENT_REQUIRED" },
      data: {
        lifecycle: "ACTIVE",
        status: "IN_PROGRESS",
        startedAt: enrollment.startedAt ?? new Date(),
      },
    });
    if (!updated.count) return;

    await tx.payment.update({
      where: { enrollmentId: enrollment.id },
      data: {
        status: "SUCCEEDED",
        provider: "polar",
        providerRef: input.orderId,
        paidAt: new Date(),
        instructorPayoutStatus: enrollment.payment!.instructorShareCents > 0 ? "PENDING" : "NOT_DUE",
      },
    });

    await commitOrganizationCredits(tx, enrollment.id);
    await redeemCouponUsage(tx, enrollment.id);
  });

  return { fulfilled: true, enrollmentId: enrollment.id };
}
