import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enrollment: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  payment: { update: vi.fn() },
  $transaction: vi.fn(),
}));

const commitOrganizationCredits = vi.hoisted(() => vi.fn());
const redeemCouponUsage = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/services/organizations/credits.js", () => ({ commitOrganizationCredits }));
vi.mock("../../../../src/services/coupons/issue.js", () => ({ redeemCouponUsage }));
vi.mock("../../../../src/utils/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { fulfillPolarOrderPaid } from "../../../../src/services/payments/fulfill-polar-order.js";

describe("fulfillPolarOrderPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn) => fn(db));
  });

  it("activates a pending enrollment and marks the payment succeeded", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr_1",
      lifecycle: "PAYMENT_REQUIRED",
      startedAt: null,
      payment: { status: "PENDING", instructorShareCents: 700 },
    });
    db.enrollment.updateMany.mockResolvedValue({ count: 1 });

    const result = await fulfillPolarOrderPaid({
      orderId: "ord_1",
      checkoutId: "chk_1",
      metadata: { enrollmentId: "enr_1" },
    });

    expect(result).toEqual({ fulfilled: true, enrollmentId: "enr_1" });
    expect(db.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enr_1", lifecycle: "PAYMENT_REQUIRED" } })
    );
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { enrollmentId: "enr_1" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        provider: "polar",
        providerRef: "ord_1",
        instructorPayoutStatus: "PENDING",
      }),
    });
    expect(commitOrganizationCredits).toHaveBeenCalledWith(db, "enr_1");
    expect(redeemCouponUsage).toHaveBeenCalledWith(db, "enr_1");
  });

  it("is idempotent when payment already succeeded", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr_1",
      lifecycle: "ACTIVE",
      startedAt: new Date(),
      payment: { status: "SUCCEEDED", instructorShareCents: 700 },
    });

    const result = await fulfillPolarOrderPaid({
      orderId: "ord_1",
      checkoutId: "chk_1",
      metadata: { enrollmentId: "enr_1" },
    });

    expect(result).toEqual({ fulfilled: false, enrollmentId: "enr_1" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("falls back to checkout id lookup when metadata is missing", async () => {
    db.enrollment.findFirst.mockResolvedValue({
      id: "enr_2",
      lifecycle: "PAYMENT_REQUIRED",
      startedAt: null,
      payment: { status: "PENDING", instructorShareCents: 0 },
    });
    db.enrollment.updateMany.mockResolvedValue({ count: 1 });

    const result = await fulfillPolarOrderPaid({
      orderId: "ord_2",
      checkoutId: "chk_2",
      metadata: null,
    });

    expect(result.fulfilled).toBe(true);
    expect(db.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payment: { provider: "polar", providerRef: "chk_2" } } })
    );
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { enrollmentId: "enr_2" },
      data: expect.objectContaining({ instructorPayoutStatus: "NOT_DUE", providerRef: "ord_2" }),
    });
  });
});
