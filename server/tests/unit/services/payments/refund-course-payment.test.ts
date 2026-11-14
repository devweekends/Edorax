import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enrollment: { findUnique: vi.fn(), update: vi.fn() },
  payment: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const refundsCreate = vi.hoisted(() => vi.fn());
const recordAdminAction = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/utils/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../../../../src/services/payments/polar.js", () => ({
  requirePolarConfig: () => ({}),
  getPolarClient: () => ({ refunds: { create: refundsCreate } }),
}));
vi.mock("../../../../src/services/admin/audit.js", () => ({
  recordAdminAction,
  ADMIN_AUDIT_ACTIONS: { PAYMENT_REFUND: "payment.refund" },
}));

import { previewCourseRefund, refundCoursePayment } from "../../../../src/services/payments/refund-course-payment.js";

const admin = { id: "admin_1", email: "admin@example.com" };
const enrollment = (payment: Record<string, unknown> = {}) => ({
  id: "enr_1",
  lifecycle: "ACTIVE",
  payment: { status: "SUCCEEDED", provider: "polar", providerRef: "ord_1", amountCents: 1000, instructorPayoutStatus: "PENDING", instructorShareCents: 700, ...payment },
});

describe("refundCoursePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn) => fn(db));
    db.payment.updateMany.mockResolvedValue({ count: 1 });
    refundsCreate.mockResolvedValue({ id: "ref_1" });
  });

  it("refunds the payment less $0.50, 1.5% and 5% through Polar, ends access and records who did it", async () => {
    db.enrollment.findUnique.mockResolvedValue(enrollment());

    const result = await refundCoursePayment("enr_1", admin, { reason: "customer_request" });

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "ord_1", amount: 885, reason: "customer_request", metadata: { enrollmentId: "enr_1", refundedBy: "admin_1" } }),
    );
    expect(result).toMatchObject({ refundId: "ref_1", paidCents: 1000, fixedFeeCents: 50, internationalFeeCents: 15, platformFeeCents: 50, refundCents: 885 });
    expect(db.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) }));
    expect(db.enrollment.update).toHaveBeenCalledWith({ where: { id: "enr_1" }, data: { lifecycle: "CANCELLED", status: "DROPPED" } });
    expect(recordAdminAction).toHaveBeenCalledWith(db, expect.objectContaining({ actor: admin, action: "payment.refund", targetId: "enr_1" }));
  });

  it("previews the same amounts without refunding", async () => {
    db.enrollment.findUnique.mockResolvedValue(enrollment());
    await expect(previewCourseRefund("enr_1")).resolves.toEqual({ paidCents: 1000, fixedFeeCents: 50, internationalFeeCents: 15, platformFeeCents: 50, refundCents: 885 });
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("refuses when the fees would take the whole payment", async () => {
    db.enrollment.findUnique.mockResolvedValue(enrollment({ amountCents: 50 }));
    await expect(refundCoursePayment("enr_1", admin)).rejects.toThrow(/nothing to refund/);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("refuses a payment that is already refunded, or not made through Polar", async () => {
    db.enrollment.findUnique.mockResolvedValueOnce(enrollment({ status: "REFUNDED" }));
    await expect(refundCoursePayment("enr_1", admin)).rejects.toThrow(/already been refunded/);
    db.enrollment.findUnique.mockResolvedValueOnce(enrollment({ provider: "manual" }));
    await expect(refundCoursePayment("enr_1", admin)).rejects.toThrow(/not paid through Polar/);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("changes nothing in the database when Polar refuses the refund", async () => {
    db.enrollment.findUnique.mockResolvedValue(enrollment());
    refundsCreate.mockRejectedValue(new Error("Polar said no"));

    await expect(refundCoursePayment("enr_1", admin)).rejects.toThrow(/Polar said no/);
    expect(db.payment.updateMany).not.toHaveBeenCalled();
    expect(db.enrollment.update).not.toHaveBeenCalled();
  });
});
