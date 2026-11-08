import { prisma } from "../../db/prisma.js";
import type { SessionUser } from "../../types/auth.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";

function isCourseEligibleForCampaign(
  course: { id: string; category: string | null; subcategory: string | null; tags: string[] },
  campaign: { scope: string; category: string | null; subcategory: string | null; tag: string | null; courseIds: string[] }
): boolean {
  switch (campaign.scope) {
    case "CATEGORY":
      return Boolean(campaign.category && course.category === campaign.category);
    case "SUBCATEGORY":
      return Boolean(campaign.subcategory && course.subcategory?.toLowerCase() === campaign.subcategory.toLowerCase());
    case "TAG":
      return Boolean(campaign.tag && course.tags.map((t) => t.toLowerCase()).includes(campaign.tag.toLowerCase()));
    case "SELECTED_COURSES":
      return campaign.courseIds.includes(course.id);
    case "ALL":
    default:
      return true;
  }
}

export async function listInstructorCampaigns(user: SessionUser) {
  const [campaigns, instructorCourses] = await Promise.all([
    prisma.courseDiscountCampaign.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        coupons: {
          where: {
            course: { mentorId: user.id },
            active: true,
          },
          select: { courseId: true },
        },
      },
    }),
    prisma.course.findMany({
      where: {
        mentorId: user.id,
        status: "PUBLISHED",
        pricingType: "PAID",
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        subcategory: true,
        tags: true,
        priceCents: true,
        currency: true,
      },
    }),
  ]);

  return {
    campaigns: campaigns.map((campaign) => {
      const participatingSet = new Set(campaign.coupons.map((c) => c.courseId));
      const eligibleCourses = instructorCourses.filter((course) =>
        isCourseEligibleForCampaign(course, campaign)
      );

      return {
        id: campaign.id,
        label: campaign.label,
        code: campaign.code,
        scope: campaign.scope,
        percentOff: campaign.percentOff,
        maxRedemptions: campaign.maxRedemptions,
        autoApply: campaign.autoApply,
        active: campaign.active,
        expiresAt: campaign.expiresAt?.toISOString() ?? null,
        createdAt: campaign.createdAt.toISOString(),
        participatingCourseIds: Array.from(participatingSet),
        eligibleCourseIds: eligibleCourses.map((c) => c.id),
      };
    }),
    courses: instructorCourses,
  };
}

export async function setInstructorCampaignParticipation(
  user: SessionUser,
  campaignId: string,
  selectedCourseIds: string[]
) {
  const campaign = await prisma.courseDiscountCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || !campaign.active || (campaign.expiresAt && campaign.expiresAt <= new Date())) {
    throw new NotFoundError("Campaign not found or is no longer active.");
  }

  // Verify all chosen courses are owned by the instructor, published, and paid
  const instructorCourses = await prisma.course.findMany({
    where: {
      id: { in: selectedCourseIds },
      mentorId: user.id,
      status: "PUBLISHED",
      pricingType: "PAID",
    },
    select: {
      id: true,
      title: true,
      category: true,
      subcategory: true,
      tags: true,
    },
  });

  if (instructorCourses.length !== selectedCourseIds.length) {
    throw new UnprocessableError(
      "One or more selected courses are invalid or not eligible for campaign participation.",
      "INVALID_COURSES"
    );
  }

  // Verify eligible scope
  for (const course of instructorCourses) {
    if (!isCourseEligibleForCampaign(course, campaign)) {
      throw new UnprocessableError(
        `Course "${course.title}" does not meet the eligibility requirements for campaign "${campaign.label}".`,
        "COURSE_NOT_ELIGIBLE"
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // Current coupons for this instructor under this campaign
    const existingCoupons = await tx.instructorCoupon.findMany({
      where: {
        campaignId: campaign.id,
        course: { mentorId: user.id },
      },
    });

    const existingMap = new Map(existingCoupons.map((c) => [c.courseId, c]));
    const targetSet = new Set(selectedCourseIds);

    // 1. Activate or create coupons for selected courses
    for (const courseId of selectedCourseIds) {
      const existing = existingMap.get(courseId);
      if (existing) {
        if (!existing.active) {
          await tx.instructorCoupon.update({
            where: { id: existing.id },
            data: { active: true },
          });
        }
      } else {
        // Create new campaign-linked coupon
        if (campaign.code) {
          const collision = await tx.instructorCoupon.findFirst({
            where: { courseId, code: campaign.code },
            select: { id: true },
          });
          if (collision) {
            throw new ConflictError(
              `Coupon code "${campaign.code}" is already in use for course.`,
              "COUPON_CODE_TAKEN"
            );
          }
        }

        await tx.instructorCoupon.create({
          data: {
            courseId,
            createdById: user.id,
            campaignId: campaign.id,
            code: campaign.code,
            label: campaign.label,
            percentOff: campaign.percentOff,
            maxRedemptions: campaign.maxRedemptions,
            autoApply: campaign.autoApply,
            expiresAt: campaign.expiresAt,
            active: true,
          },
        });
      }
    }

    // 2. Remove or deactivate unselected courses
    for (const existing of existingCoupons) {
      if (!targetSet.has(existing.courseId) && existing.active) {
        if (existing.redemptionCount === 0) {
          await tx.instructorCoupon.delete({
            where: { id: existing.id },
          });
        } else {
          await tx.instructorCoupon.update({
            where: { id: existing.id },
            data: { active: false },
          });
        }
      }
    }

    return { ok: true, participatingCourseIds: selectedCourseIds };
  });
}

