import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db/prisma.js";
import { createDiscountCampaign, listDiscountCampaigns, setDiscountCampaignActive } from "../../src/services/admin/discount-campaigns.js";
import { listInstructorCampaigns, setInstructorCampaignParticipation } from "../../src/services/teach/campaigns.js";
import { loadCheckout } from "../../src/services/enrollment/checkout.js";
import { createDiscountCampaignBody } from "../../src/validations/admin.js";
import type { SessionUser } from "../../src/types/auth.js";

const tag = randomUUID().slice(0, 8);
let admin: { id: string; email: string };
let instructor: SessionUser;
let other: SessionUser;
let firstCourse: { id: string; slug: string };
let secondCourse: { id: string; slug: string };
let campaignId = "";

beforeAll(async () => {
  const a = await prisma.user.create({ data: { email: `campaign-admin-${tag}@test.local`, role: "ADMIN", emailVerified: new Date() } });
  const one = await prisma.user.create({ data: { email: `campaign-one-${tag}@test.local`, role: "MENTOR", emailVerified: new Date() } });
  const two = await prisma.user.create({ data: { email: `campaign-two-${tag}@test.local`, role: "MENTOR", emailVerified: new Date() } });
  admin = { id: a.id, email: a.email };
  instructor = { ...one, testerEnabled: one.testerEnabled };
  other = { ...two, testerEnabled: two.testerEnabled };
  firstCourse = await prisma.course.create({ data: { mentorId: one.id, slug: `campaign-one-${tag}`, title: "First course", status: "PUBLISHED", pricingType: "PAID", priceCents: 10000 } });
  secondCourse = await prisma.course.create({ data: { mentorId: two.id, slug: `campaign-two-${tag}`, title: "Second course", status: "PUBLISHED", pricingType: "PAID", priceCents: 10000 } });
});

afterAll(async () => {
  if (campaignId) await prisma.courseDiscountCampaign.delete({ where: { id: campaignId } });
  await prisma.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.course.deleteMany({ where: { id: { in: [firstCourse.id, secondCourse.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, instructor.id, other.id] } } });
});

describe("campaign participation requires instructor opt-in", () => {
  it("does not allow new campaigns to target individual courses", () => {
    expect(createDiscountCampaignBody.safeParse({ label: "Restricted", scope: "SELECTED_COURSES", courseIds: [firstCourse.id], percentOff: 20, maxRedemptions: 50, autoApply: true }).success).toBe(false);
  });

  it("keeps existing selected-course campaigns available to their eligible instructor", async () => {
    const legacy = await prisma.courseDiscountCampaign.create({
      data: { createdById: admin.id, label: "Existing campaign", scope: "SELECTED_COURSES", courseIds: [firstCourse.id], percentOff: 20, maxRedemptions: 10, autoApply: true },
    });
    try {
      const firstView = (await listInstructorCampaigns(instructor)).campaigns.find((item) => item.id === legacy.id);
      const secondView = (await listInstructorCampaigns(other)).campaigns.find((item) => item.id === legacy.id);
      expect(firstView?.eligibleCourseIds).toContain(firstCourse.id);
      expect(secondView?.eligibleCourseIds).not.toContain(secondCourse.id);
      await setInstructorCampaignParticipation(instructor, legacy.id, [firstCourse.id]);
      expect((await prisma.courseDiscountCampaign.findUniqueOrThrow({ where: { id: legacy.id } })).courseIds).toEqual([firstCourse.id]);
    } finally {
      await prisma.courseDiscountCampaign.delete({ where: { id: legacy.id } });
    }
  });

  it("creates an eligible campaign without applying discounts and preserves choices when paused", async () => {
    const campaign = await createDiscountCampaign(admin, {
      label: "Opt-in campaign", scope: "ALL",
      percentOff: 20, maxRedemptions: 50, autoApply: true, code: null,
    });
    campaignId = campaign.id;
    expect(campaign.courseCount).toBe(0);
    expect(await prisma.instructorCoupon.count({ where: { campaignId } })).toBe(0);
    expect((await loadCheckout(firstCourse.slug, admin.id)).automaticDiscount).toBeNull();
    expect((await loadCheckout(secondCourse.slug, admin.id)).automaticDiscount).toBeNull();

    await setInstructorCampaignParticipation(instructor, campaignId, [firstCourse.id]);
    expect((await loadCheckout(firstCourse.slug, admin.id)).automaticDiscount?.percentOff).toBe(20);
    expect((await loadCheckout(secondCourse.slug, admin.id)).automaticDiscount).toBeNull();
    expect((await listDiscountCampaigns()).campaigns.find((item) => item.id === campaignId)?.courseCount).toBe(1);
    const otherView = (await listInstructorCampaigns(other)).campaigns.find((item) => item.id === campaignId);
    expect(otherView?.eligibleCourseIds).toContain(secondCourse.id);
    expect(otherView?.participatingCourseIds).toEqual([]);
    await expect(setInstructorCampaignParticipation(other, campaignId, [firstCourse.id])).rejects.toThrow();

    await setDiscountCampaignActive(admin, campaignId, false);
    expect((await loadCheckout(firstCourse.slug, admin.id)).automaticDiscount).toBeNull();
    await setDiscountCampaignActive(admin, campaignId, true);
    expect((await loadCheckout(firstCourse.slug, admin.id)).automaticDiscount?.percentOff).toBe(20);

    await prisma.instructorCoupon.updateMany({ where: { campaignId, courseId: firstCourse.id }, data: { redemptionCount: 1 } });
    await setInstructorCampaignParticipation(instructor, campaignId, []);
    await setDiscountCampaignActive(admin, campaignId, false);
    await setDiscountCampaignActive(admin, campaignId, true);
    expect((await loadCheckout(firstCourse.slug, admin.id)).automaticDiscount).toBeNull();
    expect((await prisma.courseDiscountCampaign.findUniqueOrThrow({ where: { id: campaignId } })).courseIds).toEqual([]);
  });
});
