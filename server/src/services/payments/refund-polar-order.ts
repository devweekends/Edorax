import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../utils/logger.js";
import { refundEndsAccess } from "./refund-policy.js";

export type PolarOrderRefundedInput = {
  orderId: string;
  checkoutId: string | null;
  metadata: Record<string, unknown> | null | undefined;
  /** Polar's order status after the refund: "refunded" or "partially_refunded". */
  status: string;
  refundedAmount: number;
  totalAmount: number;
};

export type PolarRefundOutcome =
  | { revoked: true; enrollmentId: string }
  | { revoked: false; enrollmentId: string | null; reason: "no-enrollment" | "goodwill" | "already-refunded" | "not-polar" };

type RefundableEnrollment = {
  id: string;
  payment: { status: string; provider: string | null; instructorPayoutStatus: string; instructorShareCents: number } | null;
};

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * End course access for a refunded payment: the enrollment becomes CANCELLED + DROPPED (as an
 * admin removal does, so the learner can enrol again), the payment REFUNDED, and an instructor
 * payout not yet paid is no longer owed. Guarded on the payment still being SUCCEEDED, so the admin
 * refund and Polar's webhook can both call it and only the first one changes anything.
 * Returns whether this call made the change.
 */
export async function endAccessForRefund(tx: Prisma.TransactionClient, enrollment: RefundableEnrollment): Promise<boolean> {
  const payoutAlreadyPaid = enrollment.payment?.instructorPayoutStatus === "PAID";
  const refunded = await tx.payment.updateMany({
    where: { enrollmentId: enrollment.id, status: "SUCCEEDED" },
    data: {
      status: "REFUNDED",
      // A payout already paid stays recorded as paid; it needs a manual adjustment (logged below).
      ...(payoutAlreadyPaid ? {} : { instructorPayoutStatus: "NOT_DUE" as const }),
    },
  });
  if (!refunded.count) return false;
  await tx.enrollment.update({
    where: { id: enrollment.id },
    data: { lifecycle: "CANCELLED", status: "DROPPED" },
  });
  if (payoutAlreadyPaid)
    logger.warn(
      { enrollmentId: enrollment.id, instructorShareCents: enrollment.payment?.instructorShareCents },
      "refund after the instructor share was paid out: needs a manual adjustment",
    );
  return true;
}

/**
 * Polar reported order.refunded. A refund at or above the refund policy amount (paid minus the
 * Polar’s payment fees kept back) ends access; a smaller one is goodwill and access stays. Idempotent,
 * because Polar retries webhooks and the admin refund may already have ended access.
 */
export async function revokePolarOrderRefund(input: PolarOrderRefundedInput): Promise<PolarRefundOutcome> {
  const enrollmentIdFromMeta = metadataString(input.metadata, "enrollmentId");
  const include = { payment: true } as const;

  const enrollment =
    (enrollmentIdFromMeta ? await prisma.enrollment.findUnique({ where: { id: enrollmentIdFromMeta }, include }) : null) ??
    // order.paid stores the order id on the payment; before that it held the checkout id.
    (await prisma.enrollment.findFirst({ where: { payment: { provider: "polar", providerRef: input.orderId } }, include })) ??
    (input.checkoutId
      ? await prisma.enrollment.findFirst({ where: { payment: { provider: "polar", providerRef: input.checkoutId } }, include })
      : null);

  if (!enrollment?.payment) {
    logger.warn({ orderId: input.orderId, checkoutId: input.checkoutId, enrollmentIdFromMeta }, "polar order.refunded with no matching enrollment");
    return { revoked: false, enrollmentId: null, reason: "no-enrollment" };
  }

  // Never touch access that was not bought through Polar, even if metadata points at it.
  if (enrollment.payment.provider !== "polar") {
    logger.warn({ orderId: input.orderId, enrollmentId: enrollment.id, provider: enrollment.payment.provider }, "polar refund for an enrollment not paid through polar");
    return { revoked: false, enrollmentId: enrollment.id, reason: "not-polar" };
  }

  if (enrollment.payment.status === "REFUNDED") {
    return { revoked: false, enrollmentId: enrollment.id, reason: "already-refunded" };
  }

  if (!refundEndsAccess({ status: input.status, refundedCents: input.refundedAmount, paidCents: enrollment.payment.amountCents })) {
    logger.info(
      { orderId: input.orderId, enrollmentId: enrollment.id, refundedAmount: input.refundedAmount, paidCents: enrollment.payment.amountCents },
      "polar goodwill refund below the policy amount: course access kept",
    );
    return { revoked: false, enrollmentId: enrollment.id, reason: "goodwill" };
  }

  const changed = await prisma.$transaction((tx) => endAccessForRefund(tx, enrollment));
  if (!changed) return { revoked: false, enrollmentId: enrollment.id, reason: "already-refunded" };
  logger.info({ orderId: input.orderId, enrollmentId: enrollment.id }, "polar refund: course access removed");
  return { revoked: true, enrollmentId: enrollment.id };
}
