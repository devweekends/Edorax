import { describe, expect, it } from "vitest";
import { settleAssignment } from "../../src/services/financials/settlement.js";

describe("organization free access payouts", () => {
  it("pays the instructor nothing when a platform-granted organization is assigned the course", () => {
    const settlement = settleAssignment({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: true,
      originalAmountCents: 5000,
      instructorPayoutPercent: 70,
    });

    expect(settlement.grantsAccess).toBe(true);
    expect(settlement.payment).toMatchObject({
      amountCents: 0,
      provider: "organization_free",
      instructorShareCents: 0,
      instructorPayoutStatus: "NOT_DUE",
      fundingSource: "organization_free",
    });
  });

  it("still pays the instructor on an organization-funded seat that is not free-for-organization", () => {
    // Control case: the free-access grant must not change ordinary organization-funded seats.
    const settlement = settleAssignment({
      pricingType: "PAID",
      channel: "pathment",
      organizationListed: false,
      originalAmountCents: 5000,
      instructorPayoutPercent: 70,
      organizationContributionPercent: 100,
    });

    expect(settlement.payment.instructorShareCents).toBeGreaterThan(0);
  });
});
