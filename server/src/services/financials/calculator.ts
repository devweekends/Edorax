import type { CoursePricingType } from "../../generated/prisma/index.js";

export type FinancialFundingSource =
  | "free"
  | "manual"
  | "admin_coupon"
  | "instructor_coupon"
  | "organization_free"
  | "organization_contribution";

export type FinancialInput = {
  originalAmountCents: number;
  pricingType: CoursePricingType;
  fundingSource: FinancialFundingSource;
  discountPercent?: number;
  organizationContributionPercent?: number;
  instructorPayoutPercent: number;
};

export type FinancialBreakdown = {
  originalAmountCents: number;
  discountAmountCents: number;
  organizationContributionCents: number;
  learnerAmountCents: number;
  instructorPayoutPercent: number;
  instructorShareCents: number;
  platformRevenueCents: number;
  fundingSource: FinancialFundingSource;
};

/**
 * All enrollment paths use this calculator so the payment row is an immutable
 * snapshot of the commercial decision made at enrollment time.
 *
 * Funding sources do not stack. A globally free course and instructor
 * free-for-organization both settle at zero. An organization coupon is the
 * organization's contribution, not a second discount. Instructor and admin
 * coupons discount the learner and never draw organization credits.
 */
export function calculateFinancialBreakdown(input: FinancialInput): FinancialBreakdown {
  const original = Math.max(0, Math.round(input.originalAmountCents));
  const fundingSource: FinancialFundingSource = input.pricingType === "FREE"
    ? "free"
    : input.fundingSource === "organization_free"
      ? "organization_free"
      : input.fundingSource;

  if (fundingSource === "free" || fundingSource === "organization_free") {
    return {
      originalAmountCents: original,
      discountAmountCents: original,
      organizationContributionCents: 0,
      learnerAmountCents: 0,
      instructorPayoutPercent: 0,
      instructorShareCents: 0,
      platformRevenueCents: 0,
      fundingSource,
    };
  }

  const discountPercent = fundingSource === "instructor_coupon" || fundingSource === "admin_coupon"
    ? clampPercent(input.discountPercent)
    : 0;
  const discount = Math.round(original * discountPercent / 100);
  const afterDiscount = Math.max(0, original - discount);
  const organizationPercent = fundingSource === "organization_contribution"
    ? clampPercent(input.organizationContributionPercent)
    : 0;
  const organizationContribution = Math.min(afterDiscount, Math.round(original * organizationPercent / 100));
  const learner = Math.max(0, afterDiscount - organizationContribution);
  // Platform campaigns pay instructors half of the post-discount amount.
  // Keep this rule here so every enrollment path settles campaigns identically.
  const payoutPercent = fundingSource === "admin_coupon"
    ? 50
    : clampPercent(input.instructorPayoutPercent);
  const instructorBase = fundingSource === "instructor_coupon" || fundingSource === "admin_coupon"
    ? afterDiscount
    : original;
  const instructorShare = Math.round(instructorBase * payoutPercent / 100);

  return {
    originalAmountCents: original,
    discountAmountCents: Math.min(original, discount),
    organizationContributionCents: organizationContribution,
    learnerAmountCents: learner,
    instructorPayoutPercent: payoutPercent,
    instructorShareCents: instructorShare,
    platformRevenueCents: Math.max(0, learner + organizationContribution - instructorShare),
    fundingSource,
  };
}

function clampPercent(value: number | undefined) {
  return Math.min(100, Math.max(0, Math.round(value ?? 0)));
}

/** Fields copied onto Payment, including when the instructor payout becomes due. */
export function paymentFromBreakdown(
  financials: FinancialBreakdown,
  input: { status: "PENDING" | "SUCCEEDED"; provider?: string | null }
) {
  const succeeded = input.status === "SUCCEEDED";
  return {
    amountCents: financials.learnerAmountCents,
    status: input.status,
    provider: succeeded ? input.provider ?? null : null,
    paidAt: succeeded ? new Date() : null,
    instructorPayoutStatus: succeeded && financials.instructorShareCents > 0 ? "PENDING" as const : "NOT_DUE" as const,
    ...financials,
  };
}
