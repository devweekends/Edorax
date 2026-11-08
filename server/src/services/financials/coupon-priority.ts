import type { CoursePricingType } from "../../generated/prisma/index.js";

export type CommercialChannel = "pathment" | "direct";

export type CouponPriority = {
  /** Globally free courses settle as free. Instructor free-for-organization settles as organization_free. */
  fundingSource: "free" | "organization_free" | "organization_or_price" | "learner_coupon_or_price";
  /** Organization coupon pools are not consumed for this assignment. */
  skipOrganizationCoupon: boolean;
  /** Instructor and admin coupons are not offered on this assignment. */
  skipLearnerCoupon: boolean;
};

/**
 * One priority order for every enrollment channel:
 * 1. The course is free for everyone, so its price is already zero.
 * 2. A platform admin granted this organization free access to the course, and the
 *    organization is assigning the course through Pathment. Credits and coupons do not apply.
 * 3. A Pathment assignment uses the organization coupon, then the course price.
 * 4. A direct learner uses an instructor or admin coupon, then the course price.
 *
 * Only platform admins grant the organization override (CourseOrganizationAccess).
 * Instructors cannot. Direct checkout never receives it.
 */
export function resolveCouponPriority(input: {
  pricingType: CoursePricingType;
  channel: CommercialChannel;
  organizationListed: boolean;
}): CouponPriority {
  if (input.pricingType === "FREE") {
    return { fundingSource: "free", skipOrganizationCoupon: true, skipLearnerCoupon: true };
  }
  if (input.channel === "pathment" && input.organizationListed) {
    return { fundingSource: "organization_free", skipOrganizationCoupon: true, skipLearnerCoupon: true };
  }
  if (input.channel === "pathment") {
    return { fundingSource: "organization_or_price", skipOrganizationCoupon: false, skipLearnerCoupon: true };
  }
  return { fundingSource: "learner_coupon_or_price", skipOrganizationCoupon: true, skipLearnerCoupon: false };
}

/**
 * Automatic direct-checkout coupons, when the learner does not type a code:
 * 1. An admin campaign coupon takes precedence over an instructor-funded coupon so instructor revenue is protected.
 * 2. The larger discount wins when coupons are of the same source.
 * 3. The older coupon wins ties.
 */
export function rankLearnerCoupons<T extends { percentOff: number; campaignId: string | null; createdAt: Date }>(coupons: T[]): T[] {
  return [...coupons].sort((left, right) => {
    const adminFirst = Number(Boolean(right.campaignId)) - Number(Boolean(left.campaignId));
    if (adminFirst !== 0) return adminFirst;
    if (right.percentOff !== left.percentOff) return right.percentOff - left.percentOff;
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

export function organizationFreeApplies(input: {
  pricingType: CoursePricingType;
  channel: CommercialChannel;
  organizationListed: boolean;
}) {
  return resolveCouponPriority(input).fundingSource === "organization_free";
}
