import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "../admin/audit.js";

export type InstructorWithdrawalStatus = "REQUESTED" | "PAID" | "REJECTED";

export type InstructorWalletSummary = {
  totalEarnedCents: number;
  alreadyPaidCents: number;
  pendingWithdrawalCents: number;
  availableBalanceCents: number;
  currency: string;
  withdrawals: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: InstructorWithdrawalStatus;
    note: string;
    paymentCount: number;
    requestedAt: string;
    resolvedAt: string | null;
  }>;
  recentEarnings: Array<{
    id: string;
    courseTitle: string;
    learnerLabel: string;
    fundingSource: string | null;
    amountCents: number;
    instructorShareCents: number;
    currency: string;
    paidAt: string | null;
    status: "AVAILABLE" | "PENDING_WITHDRAWAL" | "PAID";
  }>;
};

export type AdminWithdrawalRow = {
  id: string;
  instructorId: string;
  instructorName: string | null;
  instructorEmail: string;
  amountCents: number;
  currency: string;
  status: InstructorWithdrawalStatus;
  note: string;
  paymentCount: number;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
};

/**
 * Calculates an instructor's balances across all succeeded payments:
 * - totalEarnedCents: all instructorShareCents earned
 * - alreadyPaidCents: payments with instructorPayoutStatus = "PAID"
 * - pendingWithdrawalCents: earnings locked in a "REQUESTED" withdrawal
 * - availableBalanceCents: payments with instructorPayoutStatus = "PENDING" and no active withdrawal
 */
export async function getInstructorWallet(instructorId: string): Promise<InstructorWalletSummary> {
  const [payments, withdrawals] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: "SUCCEEDED",
        instructorShareCents: { gt: 0 },
        enrollment: {
          course: { mentorId: instructorId },
        },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: {
        enrollment: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
            course: { select: { title: true } },
          },
        },
        payoutWithdrawal: {
          select: { id: true, status: true },
        },
      },
    }),
    prisma.instructorWithdrawal.findMany({
      where: { instructorId },
      orderBy: { requestedAt: "desc" },
    }),
  ]);

  let totalEarnedCents = 0;
  let alreadyPaidCents = 0;
  let pendingWithdrawalCents = 0;
  let availableBalanceCents = 0;

  for (const payment of payments) {
    totalEarnedCents += payment.instructorShareCents;
    if (payment.instructorPayoutStatus === "PAID") {
      alreadyPaidCents += payment.instructorShareCents;
    } else if (payment.payoutWithdrawalId && payment.payoutWithdrawal?.status === "REQUESTED") {
      pendingWithdrawalCents += payment.instructorShareCents;
    } else if (payment.instructorPayoutStatus === "PENDING" && !payment.payoutWithdrawalId) {
      availableBalanceCents += payment.instructorShareCents;
    }
  }

  const recentEarnings = payments.slice(0, 30).map((payment) => {
    let status: "AVAILABLE" | "PENDING_WITHDRAWAL" | "PAID" = "AVAILABLE";
    if (payment.instructorPayoutStatus === "PAID") {
      status = "PAID";
    } else if (payment.payoutWithdrawalId && payment.payoutWithdrawal?.status === "REQUESTED") {
      status = "PENDING_WITHDRAWAL";
    }
    return {
      id: payment.id,
      courseTitle: payment.enrollment.course.title,
      learnerLabel: payment.enrollment.user ? (payment.enrollment.user.name ?? payment.enrollment.user.email) : "Direct learner",
      fundingSource: payment.fundingSource,
      amountCents: payment.amountCents,
      instructorShareCents: payment.instructorShareCents,
      currency: payment.currency,
      paidAt: payment.paidAt?.toISOString() ?? payment.createdAt.toISOString(),
      status,
    };
  });

  return {
    totalEarnedCents,
    alreadyPaidCents,
    pendingWithdrawalCents,
    availableBalanceCents,
    currency: "USD",
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amountCents: w.amountCents,
      currency: w.currency,
      status: w.status,
      note: w.note,
      paymentCount: w.paymentIds.length,
      requestedAt: w.requestedAt.toISOString(),
      resolvedAt: w.resolvedAt?.toISOString() ?? null,
    })),
    recentEarnings,
  };
}

/**
 * Creates an InstructorWithdrawal request from all eligible payments for the instructor.
 * Locks the payments by setting payoutWithdrawalId to prevent double withdrawal.
 */
export async function requestInstructorWithdrawal(
  instructorId: string,
  note: string
) {
  const cleanNote = note.trim();
  if (!cleanNote) throw new ConflictError("A withdrawal note or transfer destination is required.");

  return prisma.$transaction(async (tx) => {
    const eligiblePayments = await tx.payment.findMany({
      where: {
        status: "SUCCEEDED",
        instructorPayoutStatus: "PENDING",
        payoutWithdrawalId: null,
        instructorShareCents: { gt: 0 },
        enrollment: {
          course: { mentorId: instructorId },
        },
      },
      select: { id: true, instructorShareCents: true },
    });

    if (eligiblePayments.length === 0) {
      throw new ConflictError("No available earnings to withdraw.");
    }

    const amountCents = eligiblePayments.reduce((sum, p) => sum + p.instructorShareCents, 0);
    if (amountCents <= 0) {
      throw new ConflictError("No available earnings to withdraw.");
    }

    const paymentIds = eligiblePayments.map((p) => p.id);

    const withdrawal = await tx.instructorWithdrawal.create({
      data: {
        instructorId,
        amountCents,
        currency: "USD",
        status: "REQUESTED",
        note: cleanNote,
        paymentIds,
      },
    });

    const updated = await tx.payment.updateMany({
      where: {
        id: { in: paymentIds },
        status: "SUCCEEDED",
        instructorPayoutStatus: "PENDING",
        payoutWithdrawalId: null,
      },
      data: {
        payoutWithdrawalId: withdrawal.id,
      },
    });

    if (updated.count !== paymentIds.length) {
      throw new ConflictError("One or more payments were already claimed for withdrawal.");
    }

    return withdrawal;
  });
}

/**
 * Admin: List all instructor withdrawals.
 */
export async function listAdminWithdrawals(status?: InstructorWithdrawalStatus): Promise<AdminWithdrawalRow[]> {
  const withdrawals = await prisma.instructorWithdrawal.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    include: {
      instructor: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return withdrawals.map((w) => ({
    id: w.id,
    instructorId: w.instructorId,
    instructorName: w.instructor.name,
    instructorEmail: w.instructor.email,
    amountCents: w.amountCents,
    currency: w.currency,
    status: w.status,
    note: w.note,
    paymentCount: w.paymentIds.length,
    requestedAt: w.requestedAt.toISOString(),
    resolvedAt: w.resolvedAt?.toISOString() ?? null,
    resolvedById: w.resolvedById,
  }));
}

/**
 * Admin: Mark a withdrawal request as PAID.
 * Updates the withdrawal and sets all reserved payments to instructorPayoutStatus = "PAID".
 */
export async function markWithdrawalPaid(withdrawalId: string, actor: AdminActor) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.instructorWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { instructor: { select: { email: true, name: true } } },
    });
    if (!withdrawal) throw new NotFoundError("Withdrawal request not found.");
    if (withdrawal.status !== "REQUESTED") {
      throw new ConflictError(`This withdrawal is already ${withdrawal.status.toLowerCase()}.`);
    }

    const now = new Date();
    await tx.instructorWithdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "PAID",
        resolvedAt: now,
        resolvedById: actor.id,
      },
    });

    await tx.payment.updateMany({
      where: { payoutWithdrawalId: withdrawal.id },
      data: {
        instructorPayoutStatus: "PAID",
        instructorPayoutPaidAt: now,
      },
    });

    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.INSTRUCTOR_WITHDRAWAL_PAID,
      targetType: "InstructorWithdrawal",
      targetId: withdrawal.id,
      summary: `Marked withdrawal ${withdrawal.id} of $${(withdrawal.amountCents / 100).toFixed(2)} as paid to ${withdrawal.instructor.name ?? withdrawal.instructor.email}.`,
    });

    return { paid: true };
  });
}

/**
 * Admin: Reject a withdrawal request.
 * Releases all linked payments back to the instructor's available balance.
 * Preserves paymentIds on the withdrawal record for audit history.
 */
export async function rejectWithdrawal(withdrawalId: string, actor: AdminActor, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.instructorWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { instructor: { select: { email: true, name: true } } },
    });
    if (!withdrawal) throw new NotFoundError("Withdrawal request not found.");
    if (withdrawal.status !== "REQUESTED") {
      throw new ConflictError(`This withdrawal is already ${withdrawal.status.toLowerCase()}.`);
    }

    const now = new Date();
    await tx.instructorWithdrawal.update({
      where: { id: withdrawal.id },
      data: {
        status: "REJECTED",
        resolvedAt: now,
        resolvedById: actor.id,
      },
    });

    // Release the payments back so they become available to withdraw again
    await tx.payment.updateMany({
      where: { payoutWithdrawalId: withdrawal.id },
      data: {
        payoutWithdrawalId: null,
      },
    });

    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.INSTRUCTOR_WITHDRAWAL_REJECT,
      targetType: "InstructorWithdrawal",
      targetId: withdrawal.id,
      summary: `Rejected withdrawal ${withdrawal.id} of $${(withdrawal.amountCents / 100).toFixed(2)} for ${withdrawal.instructor.name ?? withdrawal.instructor.email}.${reason ? ` Reason: ${reason}` : ""}`,
    });

    return { rejected: true };
  });
}

