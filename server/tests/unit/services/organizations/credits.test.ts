import { describe, expect, it } from "vitest";
import { InsufficientOrganizationCreditsError } from "../../../../src/services/organizations/credits.js";

describe("InsufficientOrganizationCreditsError", () => {
  it("explains required vs available credits for the enrollment API", () => {
    const error = new InsufficientOrganizationCreditsError(5_000, 125);

    expect(error.statusCode).toBe(402);
    expect(error.code).toBe("INSUFFICIENT_CREDITS");
    expect(error.message).toBe(
      "Organization credit balance is too low to fund this enrollment. Required 5,000 credits ($50.00); available 125 credits ($1.25). Add credits for the organization, then retry."
    );
  });
});
