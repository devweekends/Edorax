import { prisma } from "../../db/prisma.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "../admin/audit.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors.js";
import { getPolarClient, requirePolarConfig } from "./polar.js";
import { endAccessForRefund } from "./refund-polar-order.js";
import { refundBreakdown, type RefundBreakdown } from "./refund-policy.js";

export const REFUND_REASONS = ["customer_request", "duplicate", "fraudulent", "service_disruption", "satisfaction_guarantee", "other"] as const;
export type RefundReasonInput = (typeof REFUND_REASONS)[number];

export type CourseRefundResult = RefundBreakdown & { refundId: string; enrollmentId: string };

/** What a refund of this enrollment would return, without making it. For a confirm screen. */
export async function previewCourseRefund(enrollmentId: string): Promise<RefundBreakdown> {
  const payment = await refundablePayment(enrollmentId);
  return refundBreakdown(payment.amountCents);
}

/**
 * Refund a course bought through Polar, keeping back Polar’s payment fees (see refund-policy.ts), and
 * end the learner's access straight away. Polar then sends order.refunded; that webhook finds the
 * payment already REFUNDED and changes nothing.
 */
export async function refundCoursePayment(
  enrollmentId: string,
  actor: AdminActor,
  input: { reason?: RefundReasonInput; comment?: string | null } = {},
): Promise<CourseRefundResult> {
  requirePolarConfig();
  const payment = await refundablePayment(enrollmentId);
  const breakdown = refundBreakdown(payment.amountCents);
  if (breakdown.refundCents < 1) {
    throw new BadRequestError("The fees kept back are as much as the payment, so there is nothing to refund.", "REFUND_TOO_SMALL");
  }

  const refund = await getPolarClient().refunds.create({
    order_id: payment.providerRef,
    amount: breakdown.refundCents,
    reason: input.reason ?? "customer_request",
    comment:
      input.comment?.trim() ||
      `Refund less Polar fees: transaction ${breakdown.fixedFeeCents}, international ${breakdown.internationalFeeCents}, Polar ${breakdown.platformFeeCents} cents.`,
    metadata: { enrollmentId, refundedBy: actor.id },
  });

  // The money has gone back. If the database write below fails, the order.refunded webhook still
  // ends access, because the refund it reports is at the policy amount.
  await prisma.$transaction(async (tx) => {
    await endAccessForRefund(tx, { id: enrollmentId, payment: { ...payment, provider: "polar" } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.PAYMENT_REFUND,
      targetType: "Enrollment",
      targetId: enrollmentId,
      summary: `Refunded ${breakdown.refundCents} of ${breakdown.paidCents} cents through Polar and removed course access.`,
      metadata: { refundId: refund.id, orderId: payment.providerRef, ...breakdown, reason: input.reason ?? "customer_request" },
    });
  });

  return { ...breakdown, refundId: refund.id, enrollmentId };
}

async function refundablePayment(enrollmentId: string) {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { payment: true } });
  if (!enrollment) throw new NotFoundError("Enrollment not found");
  const payment = enrollment.payment;
  if (!payment || payment.provider !== "polar" || !payment.providerRef) {
    throw new ConflictError("This enrollment was not paid through Polar, so it cannot be refunded here.", "NOT_A_POLAR_PAYMENT");
  }
  if (payment.status === "REFUNDED") throw new ConflictError("This payment has already been refunded.", "ALREADY_REFUNDED");
  if (payment.status !== "SUCCEEDED") throw new ConflictError("Only a completed payment can be refunded.", "PAYMENT_NOT_COMPLETED");
  return { ...payment, providerRef: payment.providerRef };
}
