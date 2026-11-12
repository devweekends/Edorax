import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  payment: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  instructorWithdrawal: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  adminAuditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../../src/db/prisma.js", () => ({ prisma: db }));

import {
  getInstructorWallet,
  listAdminWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
  requestInstructorWithdrawal,
} from "../../src/services/financials/withdrawals.js";
import { markManualInstructorPayoutPaid } from "../../src/services/enrollment/manual-access.js";

const admin = { id: "admin-1", email: "admin@test.local" };
const instructorId = "instructor-42";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (work) =>
    typeof work === "function" ? work(db) : Promise.all(work)
  );
});

describe("Instructor wallet & withdrawals", () => {
  it("includes admin-coupon and organization-funded earnings in available balance", async () => {
    db.payment.findMany.mockResolvedValue([
      {
        id: "pay-admin-coupon",
        amountCents: 0,
        currency: "USD",
        status: "SUCCEEDED",
        fundingSource: "admin_coupon",
        instructorShareCents: 7000,
        instructorPayoutStatus: "PENDING",
        payoutWithdrawalId: null,
        paidAt: new Date("2026-11-01"),
        createdAt: new Date("2026-11-01"),
        enrollment: {
          id: "enr-1",
          user: { name: "Learner 1", email: "learner1@test.local" },
          course: { title: "Admin-Discounted Course" },
        },
        payoutWithdrawal: null,
      },
      {
        id: "pay-org-funded",
        amountCents: 0,
        currency: "USD",
        status: "SUCCEEDED",
        fundingSource: "organization_contribution",
        instructorShareCents: 3500,
        instructorPayoutStatus: "PENDING",
        payoutWithdrawalId: null,
        paidAt: new Date("2026-11-02"),
        createdAt: new Date("2026-11-02"),
        enrollment: {
          id: "enr-2",
          user: { name: "Learner 2", email: "learner2@test.local" },
          course: { title: "Org-Sponsored Course" },
        },
        payoutWithdrawal: null,
      },
    ]);
    db.instructorWithdrawal.findMany.mockResolvedValue([]);

    const wallet = await getInstructorWallet(instructorId);

    expect(wallet.totalEarnedCents).toBe(10500);
    expect(wallet.availableBalanceCents).toBe(10500);
    expect(wallet.alreadyPaidCents).toBe(0);
    expect(wallet.pendingWithdrawalCents).toBe(0);
    expect(wallet.recentEarnings).toHaveLength(2);
    expect(wallet.recentEarnings[0].status).toBe("AVAILABLE");
    expect(wallet.recentEarnings[1].status).toBe("AVAILABLE");
  });

  it("prevents double-withdrawal by locking eligible payments to payoutWithdrawalId", async () => {
    const eligiblePayments = [
      { id: "p1", instructorShareCents: 5000 },
      { id: "p2", instructorShareCents: 2000 },
    ];
    db.payment.findMany.mockResolvedValue(eligiblePayments);
    db.instructorWithdrawal.create.mockResolvedValue({
      id: "withdrawal-1",
      instructorId,
      amountCents: 7000,
      currency: "USD",
      status: "REQUESTED",
      note: "PayPal: mentor@example.com",
      paymentIds: ["p1", "p2"],
    });
    db.payment.updateMany.mockResolvedValue({ count: 2 });

    const withdrawal = await requestInstructorWithdrawal(instructorId, "PayPal: mentor@example.com");

    expect(withdrawal.amountCents).toBe(7000);
    expect(withdrawal.status).toBe("REQUESTED");
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["p1", "p2"] },
        status: "SUCCEEDED",
        instructorPayoutStatus: "PENDING",
        payoutWithdrawalId: null,
      },
      data: {
        payoutWithdrawalId: "withdrawal-1",
      },
    });

    // If another withdrawal is attempted while no payments are free (available), it throws
    db.payment.findMany.mockResolvedValue([]);
    await expect(requestInstructorWithdrawal(instructorId, "Bank Transfer")).rejects.toThrow(
      "No available earnings to withdraw."
    );
  });

  it("marks a withdrawal paid and updates all linked payments to PAID", async () => {
    db.instructorWithdrawal.findUnique.mockResolvedValue({
      id: "withdrawal-1",
      instructorId,
      amountCents: 7000,
      status: "REQUESTED",
      instructor: { name: "Instructor One", email: "instructor@test.local" },
    });
    db.instructorWithdrawal.update.mockResolvedValue({});
    db.payment.updateMany.mockResolvedValue({ count: 2 });
    db.adminAuditLog.create.mockResolvedValue({});

    const result = await markWithdrawalPaid("withdrawal-1", admin);

    expect(result).toEqual({ paid: true });
    expect(db.instructorWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "withdrawal-1" },
        data: expect.objectContaining({
          status: "PAID",
          resolvedById: admin.id,
        }),
      })
    );
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { payoutWithdrawalId: "withdrawal-1" },
      data: expect.objectContaining({
        instructorPayoutStatus: "PAID",
      }),
    });
  });

  it("rejects a withdrawal and restores payments back to the available balance", async () => {
    db.instructorWithdrawal.findUnique.mockResolvedValue({
      id: "withdrawal-1",
      instructorId,
      amountCents: 7000,
      status: "REQUESTED",
      instructor: { name: "Instructor One", email: "instructor@test.local" },
    });
    db.instructorWithdrawal.update.mockResolvedValue({});
    db.payment.updateMany.mockResolvedValue({ count: 2 });
    db.adminAuditLog.create.mockResolvedValue({});

    const result = await rejectWithdrawal("withdrawal-1", admin, "Incorrect account number provided");

    expect(result).toEqual({ rejected: true });
    expect(db.instructorWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "withdrawal-1" },
        data: expect.objectContaining({
          status: "REJECTED",
          resolvedById: admin.id,
        }),
      })
    );
    // Unlinks the payments by setting payoutWithdrawalId to null
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { payoutWithdrawalId: "withdrawal-1" },
      data: {
        payoutWithdrawalId: null,
      },
    });
  });

  it("blocks direct admin payout marking when a payment is already reserved in a withdrawal", async () => {
    db.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      enrollmentId: "enr-1",
      status: "SUCCEEDED",
      instructorPayoutStatus: "PENDING",
      instructorShareCents: 5000,
      payoutWithdrawalId: "withdrawal-active",
      enrollment: {
        id: "enr-1",
        course: { title: "Course 101" },
      },
    });

    await expect(markManualInstructorPayoutPaid("enr-1", admin)).rejects.toThrow(
      "This payment is reserved inside an instructor withdrawal request. Process the withdrawal instead."
    );
  });
});

