import { describe, expect, it } from "vitest";
import { organizationFreeApplies, resolveCouponPriority } from "../../src/services/financials/coupon-priority.js";
import { settleAssignment } from "../../src/services/financials/settlement.js";

describe("resolveCouponPriority", () => {
  it("lets a globally free course win over an organization allow-list", () => {
    expect(resolveCouponPriority({
      pricingType: "FREE",
      channel: "pathment",
      organizationListed: true,
    })).toMatchObject({ fundingSource: "free", skipOrganizationCoupon: true, skipLearnerCoupon: true });
  });

  it("gives a listed organization free Pathment access and skips coupons", () => {
    expect(organizationFreeApplies({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: true,
    })).toBe(true);
    expect(resolveCouponPriority({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: true,
    })).toMatchObject({ fundingSource: "organization_free", skipOrganizationCoupon: true, skipLearnerCoupon: true });
  });

  it("keeps other organizations on the organization coupon, then the course price", () => {
    expect(resolveCouponPriority({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: false,
    })).toMatchObject({ fundingSource: "organization_or_price", skipOrganizationCoupon: false, skipLearnerCoupon: true });
  });

  it("never gives direct learners the organization override", () => {
    expect(organizationFreeApplies({
      pricingType: "PAID",
      channel: "direct",
      organizationListed: true,
    })).toBe(false);
    expect(resolveCouponPriority({
      pricingType: "PAID",
      channel: "direct",
      organizationListed: true,
    })).toMatchObject({ fundingSource: "learner_coupon_or_price", skipLearnerCoupon: false });
  });
});

describe("settleAssignment", () => {
  it("settles instructor free-for-organization at zero without changing the recorded course price", () => {
    const settlement = settleAssignment({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: true,
      originalAmountCents: 4900,
      instructorPayoutPercent: 70,
      organizationContributionPercent: 100,
      learnerDiscountPercent: 100,
      learnerCouponFunding: "instructor_coupon",
    });
    expect(settlement.grantsAccess).toBe(true);
    expect(settlement.payment).toMatchObject({
      status: "SUCCEEDED",
      provider: "organization_free",
      amountCents: 0,
      originalAmountCents: 4900,
      organizationContributionCents: 0,
      learnerAmountCents: 0,
      instructorShareCents: 0,
      platformRevenueCents: 0,
      instructorPayoutStatus: "NOT_DUE",
      fundingSource: "organization_free",
    });
  });

  it("still charges a direct learner the course price when their organization is listed", () => {
    const settlement = settleAssignment({
      pricingType: "PAID",
      channel: "direct",
      organizationListed: true,
      originalAmountCents: 4900,
      instructorPayoutPercent: 70,
    });
    expect(settlement.grantsAccess).toBe(false);
    expect(settlement.payment).toMatchObject({
      status: "PENDING",
      provider: null,
      amountCents: 4900,
      learnerAmountCents: 4900,
      fundingSource: "manual",
    });
  });
});
