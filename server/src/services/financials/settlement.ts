import type { CoursePricingType } from "../../generated/prisma/index.js";
import { calculateFinancialBreakdown, paymentFromBreakdown, type FinancialBreakdown } from "./calculator.js";
import { resolveCouponPriority, type CommercialChannel, type CouponPriority } from "./coupon-priority.js";

export type AssignmentSettlement = {
  priority: CouponPriority;
  financials: FinancialBreakdown;
  payment: ReturnType<typeof paymentFromBreakdown>;
  /** Commercial decision grants access. Account linking still waits for a user. */
  grantsAccess: boolean;
};

/**
 * One commercial decision for every enrollment channel.
 * Instructor free-for-organization is only settled on Pathment, and only for organizations the instructor listed.
 * Direct checkout never receives that override. Admin course access is a separate waiver and does not use it.
 */
export function settleAssignment(input: {
  pricingType: CoursePricingType;
  channel: CommercialChannel;
  organizationListed: boolean;
  originalAmountCents: number;
  instructorPayoutPercent: number;
  organizationContributionPercent?: number;
  learnerDiscountPercent?: number;
  learnerCouponFunding?: "admin_coupon" | "instructor_coupon";
}): AssignmentSettlement {
  const priority = resolveCouponPriority({
    pricingType: input.pricingType,
    channel: input.channel,
    organizationListed: input.organizationListed,
  });

  let fundingSource: FinancialBreakdown["fundingSource"] = "manual";
  let discountPercent: number | undefined;
  let organizationContributionPercent: number | undefined;
  let instructorPayoutPercent = input.instructorPayoutPercent;
  let provider: string | null = null;
  let status: "PENDING" | "SUCCEEDED" = "PENDING";

  if (priority.fundingSource === "free") {
    fundingSource = "free";
    instructorPayoutPercent = 0;
    provider = "free";
    status = "SUCCEEDED";
  } else if (priority.fundingSource === "organization_free") {
    fundingSource = "organization_free";
    instructorPayoutPercent = 0;
    provider = "organization_free";
    status = "SUCCEEDED";
  } else if (priority.fundingSource === "organization_or_price" && (input.organizationContributionPercent ?? 0) > 0) {
    fundingSource = "organization_contribution";
    organizationContributionPercent = input.organizationContributionPercent;
    if ((input.organizationContributionPercent ?? 0) >= 100) {
      provider = "organization_coupon";
      status = "SUCCEEDED";
    }
  } else if (priority.fundingSource === "learner_coupon_or_price" && (input.learnerDiscountPercent ?? 0) > 0 && input.learnerCouponFunding) {
    fundingSource = input.learnerCouponFunding;
    discountPercent = input.learnerDiscountPercent;
    if ((input.learnerDiscountPercent ?? 0) >= 100) {
      provider = "coupon";
      status = "SUCCEEDED";
    }
  } else if (input.pricingType === "FREE") {
    fundingSource = "free";
    instructorPayoutPercent = 0;
    provider = "free";
    status = "SUCCEEDED";
  }

  const financials = calculateFinancialBreakdown({
    originalAmountCents: input.originalAmountCents,
    pricingType: priority.fundingSource === "organization_free" ? "PAID" : input.pricingType,
    fundingSource,
    discountPercent,
    organizationContributionPercent,
    instructorPayoutPercent,
  });

  return {
    priority,
    financials,
    payment: paymentFromBreakdown(financials, { status, provider }),
    grantsAccess: status === "SUCCEEDED",
  };
}

/** Platform staff access. This is not instructor free-for-organization. */
export function adminWaiverSnapshot(input: { originalAmountCents: number; pricingType: CoursePricingType }) {
  const financials = calculateFinancialBreakdown({
    originalAmountCents: input.originalAmountCents,
    pricingType: input.pricingType,
    fundingSource: "free",
    instructorPayoutPercent: 0,
  });
  return paymentFromBreakdown(financials, { status: "SUCCEEDED", provider: "admin" });
}
