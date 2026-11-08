import type { Prisma } from "../../generated/prisma/index.js";
import { AppError } from "../../utils/errors.js";

/** Enrollment API / Pathment: organization credit balance cannot cover the contribution. */
export class InsufficientOrganizationCreditsError extends AppError {
  constructor(requiredCredits: number, availableCredits: number) {
    const required = Math.max(0, Math.round(requiredCredits));
    const available = Math.max(0, Math.round(availableCredits));
    super(
      `Organization credit balance is too low to fund this enrollment. Required ${required.toLocaleString()} credits ($${(required / 100).toFixed(2)}); available ${available.toLocaleString()} credits ($${(available / 100).toFixed(2)}). Add credits for the organization, then retry.`,
      402,
      "INSUFFICIENT_CREDITS"
    );
    this.name = "InsufficientOrganizationCreditsError";
  }
}

/** Reserve credits atomically; one credit represents one cent of organization contribution. */
export async function reserveOrganizationCredits(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; enrollmentId: string; amountCredits: number }
) {
  const amount = Math.max(0, Math.round(input.amountCredits));
  if (amount === 0) return null;
  if (!tx.organizationCreditTransaction) return null;
  const existing = await tx.organizationCreditTransaction.findUnique({ where: { enrollmentId: input.enrollmentId } });
  if (existing) return existing;
  const updated = await tx.organization.updateMany({
    where: { id: input.organizationId, creditBalance: { gte: amount } },
    data: { creditBalance: { decrement: amount } },
  });
  if (!updated.count) {
    const org = await tx.organization.findUnique({
      where: { id: input.organizationId },
      select: { creditBalance: true },
    });
    throw new InsufficientOrganizationCreditsError(amount, org?.creditBalance ?? 0);
  }
  return tx.organizationCreditTransaction.create({
    data: { organizationId: input.organizationId, enrollmentId: input.enrollmentId, amountCredits: amount, status: "RESERVED" },
  });
}

export async function commitOrganizationCredits(tx: Prisma.TransactionClient, enrollmentId: string) {
  if (!tx.organizationCreditTransaction) return;
  await tx.organizationCreditTransaction.updateMany({
    where: { enrollmentId, status: "RESERVED" },
    data: { status: "COMMITTED", committedAt: new Date() },
  });
}

export async function releaseOrganizationCredits(tx: Prisma.TransactionClient, enrollmentId: string) {
  if (!tx.organizationCreditTransaction) return false;
  const transaction = await tx.organizationCreditTransaction.findFirst({
    where: { enrollmentId, status: "RESERVED" },
  });
  if (!transaction) return false;
  const updated = await tx.organizationCreditTransaction.updateMany({
    where: { id: transaction.id, status: "RESERVED" },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  if (!updated.count) return false;
  await tx.organization.update({
    where: { id: transaction.organizationId },
    data: { creditBalance: { increment: transaction.amountCredits } },
  });
  return true;
}

export async function grantOrganizationCredits(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; amountCredits: number }
) {
  const amount = Math.max(0, Math.round(input.amountCredits));
  if (amount <= 0) return null;
  return tx.organization.update({
    where: { id: input.organizationId },
    data: { creditBalance: { increment: amount } },
  });
}

