import { prisma } from "../../db/prisma.js";

export type FundingSourceBreakdown = {
  count: number;
  originalAmountCents: number;
  discountAmountCents: number;
  organizationContributionCents: number;
  learnerAmountCents: number;
  instructorShareCents: number;
  platformRevenueCents: number;
};

export type AdminRevenueReport = {
  totalPlatformRevenueCents: number;
  totalLearnerPaymentsCents: number;
  totalOrganizationContributionsCents: number;
  totalInstructorEarningsCents: number;
  totalInstructorPaidCents: number;
  totalInstructorPendingCents: number;
  currency: string;
  byFundingSource: Record<string, FundingSourceBreakdown>;
};

export async function getPlatformRevenueReport(): Promise<AdminRevenueReport> {
  const succeededPayments = await prisma.payment.findMany({
    where: {
      status: "SUCCEEDED",
    },
    select: {
      originalAmountCents: true,
      discountAmountCents: true,
      organizationContributionCents: true,
      learnerAmountCents: true,
      instructorShareCents: true,
      platformRevenueCents: true,
      fundingSource: true,
      instructorPayoutStatus: true,
    },
  });

  let totalPlatformRevenueCents = 0;
  let totalLearnerPaymentsCents = 0;
  let totalOrganizationContributionsCents = 0;
  let totalInstructorEarningsCents = 0;
  let totalInstructorPaidCents = 0;
  let totalInstructorPendingCents = 0;

  const byFundingSource: Record<string, FundingSourceBreakdown> = {};

  for (const p of succeededPayments) {
    totalPlatformRevenueCents += p.platformRevenueCents;
    totalLearnerPaymentsCents += p.learnerAmountCents;
    totalOrganizationContributionsCents += p.organizationContributionCents;
    totalInstructorEarningsCents += p.instructorShareCents;

    if (p.instructorPayoutStatus === "PAID") {
      totalInstructorPaidCents += p.instructorShareCents;
    } else if (p.instructorPayoutStatus === "PENDING") {
      totalInstructorPendingCents += p.instructorShareCents;
    }

    const sourceKey = p.fundingSource || "other";
    if (!byFundingSource[sourceKey]) {
      byFundingSource[sourceKey] = {
        count: 0,
        originalAmountCents: 0,
        discountAmountCents: 0,
        organizationContributionCents: 0,
        learnerAmountCents: 0,
        instructorShareCents: 0,
        platformRevenueCents: 0,
      };
    }

    const group = byFundingSource[sourceKey];
    group.count += 1;
    group.originalAmountCents += p.originalAmountCents;
    group.discountAmountCents += p.discountAmountCents;
    group.organizationContributionCents += p.organizationContributionCents;
    group.learnerAmountCents += p.learnerAmountCents;
    group.instructorShareCents += p.instructorShareCents;
    group.platformRevenueCents += p.platformRevenueCents;
  }

  return {
    totalPlatformRevenueCents,
    totalLearnerPaymentsCents,
    totalOrganizationContributionsCents,
    totalInstructorEarningsCents,
    totalInstructorPaidCents,
    totalInstructorPendingCents,
    currency: "USD",
    byFundingSource,
  };
}

