import { describe, expect, it } from "vitest";
import { refundBreakdown, refundEndsAccess } from "../../../../src/services/payments/refund-policy.js";

describe("refundBreakdown", () => {
  it("keeps back $0.50, 1.5% and the 5% platform fee of what was paid", () => {
    expect(refundBreakdown(1000)).toEqual({ paidCents: 1000, fixedFeeCents: 50, internationalFeeCents: 15, platformFeeCents: 50, refundCents: 885 });
    expect(refundBreakdown(4999).refundCents).toBe(4999 - 50 - 75 - 250);
  });

  it("rounds the international fee to the nearest cent", () => {
    expect(refundBreakdown(100).internationalFeeCents).toBe(2); // 1.5 cents
    expect(refundBreakdown(1033).internationalFeeCents).toBe(15); // 15.495 cents
  });

  it("never goes below zero when the fees are as much as the payment", () => {
    expect(refundBreakdown(50).refundCents).toBe(0);
    expect(refundBreakdown(0).refundCents).toBe(0);
  });
});

describe("refundEndsAccess", () => {
  it("ends access for a full refund or one at the policy amount", () => {
    expect(refundEndsAccess({ status: "refunded", refundedCents: 1000, paidCents: 1000 })).toBe(true);
    expect(refundEndsAccess({ status: "partially_refunded", refundedCents: 885, paidCents: 1000 })).toBe(true);
  });

  it("keeps access for a smaller goodwill refund", () => {
    expect(refundEndsAccess({ status: "partially_refunded", refundedCents: 884, paidCents: 1000 })).toBe(false);
    expect(refundEndsAccess({ status: "partially_refunded", refundedCents: 0, paidCents: 30 })).toBe(false);
  });
});
