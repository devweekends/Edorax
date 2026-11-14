// How much of a course payment comes back on a refund. The fees on the sale are not returned: a
// fixed transaction fee per payment, an international card fee and Polar’s 5% fee: all charged by Polar,
// the payment handler, and not returned when a payment is refunded. Edorax adds no fee of its own. Change them
// here only; the admin refund, the webhook and any screen showing the amount all read these.

/** Kept back on every refund, in cents. */
export const REFUND_FIXED_FEE_CENTS = 50;
/** Kept back on every refund, as a share of the amount paid: 1.5%, in basis points. */
export const REFUND_INTERNATIONAL_FEE_BPS = 150;
/** Polar's own fee on the payment, kept back on every refund: 5%, in basis points. Not an Edorax fee. */
export const REFUND_PLATFORM_FEE_BPS = 500;

export type RefundBreakdown = {
  paidCents: number;
  fixedFeeCents: number;
  internationalFeeCents: number;
  platformFeeCents: number;
  /** What the learner gets back. 0 when the fees would take all of it. */
  refundCents: number;
};

const share = (cents: number, bps: number) => Math.round((cents * bps) / 10_000);

/** The refund for a payment: paid − $0.50 − 1.5% − 5% of paid, each percentage rounded to the nearest cent. */
export function refundBreakdown(paidCents: number): RefundBreakdown {
  const paid = Math.max(0, Math.round(paidCents));
  const internationalFeeCents = share(paid, REFUND_INTERNATIONAL_FEE_BPS);
  const platformFeeCents = share(paid, REFUND_PLATFORM_FEE_BPS);
  const refundCents = Math.max(0, paid - REFUND_FIXED_FEE_CENTS - internationalFeeCents - platformFeeCents);
  return { paidCents: paid, fixedFeeCents: REFUND_FIXED_FEE_CENTS, internationalFeeCents, platformFeeCents, refundCents };
}

/**
 * Whether a refund on an order ends the learner's access. A full refund does, and so does one at
 * or above the policy amount, which is how every refund under this policy arrives: the fees kept
 * back make it "partially refunded" to Polar. A smaller refund is goodwill and access stays.
 */
export function refundEndsAccess(input: { status: string; refundedCents: number; paidCents: number }) {
  if (input.status === "refunded") return true;
  const policy = refundBreakdown(input.paidCents).refundCents;
  return input.refundedCents > 0 && input.refundedCents >= policy;
}
