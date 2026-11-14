import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enrollment: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  payment: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));

vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/utils/logger.js", () => ({ logger }));

import { revokePolarOrderRefund } from "../../../../src/services/payments/refund-polar-order.js";

const paidEnrollment = (payment: Record<string, unknown> = {}) => ({
  id: "enr_1",
  lifecycle: "ACTIVE",
  payment: { status: "SUCCEEDED", provider: "polar", providerRef: "ord_1", amountCents: 1000, instructorPayoutStatus: "PENDING", instructorShareCents: 700, ...payment },
});

// $10.00 paid, refunded by the policy: 1000 - 50 - 15 - 50 = 885 cents, which Polar calls partially refunded.
const policyRefund = { orderId: "ord_1", checkoutId: "chk_1", metadata: { enrollmentId: "enr_1" }, status: "partially_refunded", refundedAmount: 885, totalAmount: 1000 };

describe("revokePolarOrderRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn) => fn(db));
    db.enrollment.findFirst.mockResolvedValue(null);
    db.payment.updateMany.mockResolvedValue({ count: 1 });
  });

  it("removes access for a refund at the policy amount and cancels an unpaid instructor payout", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment());

    await expect(revokePolarOrderRefund(policyRefund)).resolves.toEqual({ revoked: true, enrollmentId: "enr_1" });
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { enrollmentId: "enr_1", status: "SUCCEEDED" },
      data: { status: "REFUNDED", instructorPayoutStatus: "NOT_DUE" },
    });
    expect(db.enrollment.update).toHaveBeenCalledWith({ where: { id: "enr_1" }, data: { lifecycle: "CANCELLED", status: "DROPPED" } });
  });

  it("removes access for a full refund too", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment());
    const result = await revokePolarOrderRefund({ ...policyRefund, status: "refunded", refundedAmount: 1000 });
    expect(result).toEqual({ revoked: true, enrollmentId: "enr_1" });
  });

  it("finds the enrollment by order id when the metadata has none", async () => {
    db.enrollment.findFirst.mockImplementation(async ({ where }) => (where.payment.providerRef === "ord_1" ? paidEnrollment() : null));
    const result = await revokePolarOrderRefund({ ...policyRefund, metadata: null });
    expect(result).toEqual({ revoked: true, enrollmentId: "enr_1" });
  });

  it("keeps access for a goodwill refund below the policy amount", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment());

    const result = await revokePolarOrderRefund({ ...policyRefund, refundedAmount: 300 });
    expect(result).toEqual({ revoked: false, enrollmentId: "enr_1", reason: "goodwill" });
    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });

  it("changes nothing when the admin refund already ended access", async () => {
    db.enrollment.findUnique.mockResolvedValue({ ...paidEnrollment({ status: "REFUNDED" }), lifecycle: "CANCELLED" });

    const result = await revokePolarOrderRefund(policyRefund);
    expect(result).toEqual({ revoked: false, enrollmentId: "enr_1", reason: "already-refunded" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("changes nothing when another delivery won the race", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment());
    db.payment.updateMany.mockResolvedValue({ count: 0 });

    const result = await revokePolarOrderRefund(policyRefund);
    expect(result).toEqual({ revoked: false, enrollmentId: "enr_1", reason: "already-refunded" });
    expect(db.enrollment.update).not.toHaveBeenCalled();
  });

  it("never removes access that was not paid through Polar", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment({ provider: "manual" }));
    const result = await revokePolarOrderRefund(policyRefund);
    expect(result).toEqual({ revoked: false, enrollmentId: "enr_1", reason: "not-polar" });
  });

  it("keeps an instructor payout that was already paid, and flags it", async () => {
    db.enrollment.findUnique.mockResolvedValue(paidEnrollment({ instructorPayoutStatus: "PAID" }));

    await revokePolarOrderRefund(policyRefund);
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { enrollmentId: "enr_1", status: "SUCCEEDED" }, data: { status: "REFUNDED" } });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: "enr_1" }), expect.stringMatching(/manual adjustment/));
  });

  it("reports an order it cannot match without failing", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    const result = await revokePolarOrderRefund({ ...policyRefund, metadata: null, checkoutId: null });
    expect(result).toEqual({ revoked: false, enrollmentId: null, reason: "no-enrollment" });
  });
});
