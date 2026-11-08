import { describe, expect, it } from "vitest";
import { calculateFinancialBreakdown } from "../../src/services/financials/calculator.js";

describe("calculateFinancialBreakdown", () => {
  it("splits a partial organization contribution from the original price", () => {
    expect(calculateFinancialBreakdown({
      originalAmountCents: 1000,
      pricingType: "PAID",
      fundingSource: "organization_contribution",
      organizationContributionPercent: 20,
      instructorPayoutPercent: 70,
    })).toMatchObject({
      organizationContributionCents: 200,
      learnerAmountCents: 800,
      instructorShareCents: 700,
      platformRevenueCents: 300,
    });
  });

  it("records the 50% campaign rate but does not create earnings for a fully discounted enrollment", () => {
    expect(calculateFinancialBreakdown({
      originalAmountCents: 1000,
      pricingType: "PAID",
      fundingSource: "admin_coupon",
      discountPercent: 100,
      instructorPayoutPercent: 70,
    })).toMatchObject({
      learnerAmountCents: 0,
      instructorShareCents: 0,
      instructorPayoutPercent: 50,
      platformRevenueCents: 0,
    });
  });

  it("does not create instructor earnings for an instructor-funded coupon", () => {
    expect(calculateFinancialBreakdown({
      originalAmountCents: 1000,
      pricingType: "PAID",
      fundingSource: "instructor_coupon",
      discountPercent: 100,
      instructorPayoutPercent: 70,
    }).instructorShareCents).toBe(0);
  });

  it("keeps the course price on record and settles every party at zero for instructor free-for-organization", () => {
    expect(calculateFinancialBreakdown({
      originalAmountCents: 4900,
      pricingType: "PAID",
      fundingSource: "organization_free",
      discountPercent: 100,
      organizationContributionPercent: 100,
      instructorPayoutPercent: 70,
    })).toMatchObject({
      originalAmountCents: 4900,
      discountAmountCents: 4900,
      organizationContributionCents: 0,
      learnerAmountCents: 0,
      instructorShareCents: 0,
      instructorPayoutPercent: 0,
      platformRevenueCents: 0,
      fundingSource: "organization_free",
    });
  });
});
