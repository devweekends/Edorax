import type { Checkout } from "../../shared/api/catalog.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import { enrollmentGrantsContentAccess } from "./lifecycle.js";

export async function loadCheckout(courseSlug: string, userId: string): Promise<Checkout> {
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, slug: true, title: true, pricingType: true, priceCents: true, currency: true, status: true },
  });
  if (!course || course.status !== "PUBLISHED") throw new NotFoundError("Course not found");
  const { status: _status, ...courseFields } = course;

  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId: course.id, userId } },
    select: { id: true, lifecycle: true, payment: { select: { amountCents: true } }, instructorCouponRedemption: { select: { id: true } }, couponUsage: { select: { status: true, percentOff: true, displayLabel: true } } },
  });
  const enrollmentView = enrollment ? { id: enrollment.id, lifecycle: enrollment.lifecycle } : null;
  const activeOrganizationCoupon = enrollment?.couponUsage && enrollment.couponUsage.status !== "CANCELLED" ? enrollment.couponUsage : null;
  const automaticCoupon = (!activeOrganizationCoupon && (!enrollment || (enrollment.lifecycle === "PAYMENT_REQUIRED" && !enrollment.instructorCouponRedemption))) && course.pricingType === "PAID"
    ? await prisma.instructorCoupon.findMany({
        where: { courseId: course.id, active: true, autoApply: true, redemptionCount: { lt: 1000000 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: [{ percentOff: "desc" }, { createdAt: "asc" }],
        include: { campaign: true },
      }).then((offers) => {
        const coupon = offers.find((offer) => offer.redemptionCount < offer.maxRedemptions && (!offer.campaign || (offer.campaign.active && offer.campaign.redemptionCount < offer.campaign.maxRedemptions && (!offer.campaign.expiresAt || offer.campaign.expiresAt > new Date()))));
        return coupon ? { percentOff: coupon.percentOff, label: coupon.label } : null;
      })
    : null;
  const amountDueCents = activeOrganizationCoupon
    ? enrollment?.payment?.amountCents ?? Math.max(0, Math.round(course.priceCents * (100 - activeOrganizationCoupon.percentOff) / 100))
    : enrollment?.payment?.amountCents ?? (automaticCoupon ? Math.round(course.priceCents * (100 - automaticCoupon.percentOff) / 100) : course.priceCents);
  const organizationDiscount = activeOrganizationCoupon ? {
    percentOff: activeOrganizationCoupon.percentOff,
    label: activeOrganizationCoupon.displayLabel,
    amountDueCents,
  } : null;
  if (!enrollment) return { course: courseFields, enrollment: null, state: "no_enrollment", automaticDiscount: automaticCoupon, organizationDiscount: null, amountDueCents };
  if (enrollmentGrantsContentAccess(enrollment.lifecycle)) {
    return { course: courseFields, enrollment: enrollmentView, state: "already_paid", automaticDiscount: null, organizationDiscount, amountDueCents: 0 };
  }
  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") throw new NotFoundError("Enrollment is not awaiting payment");
  return { course: courseFields, enrollment: enrollmentView, state: "payment_required", automaticDiscount: activeOrganizationCoupon ? null : automaticCoupon, organizationDiscount, amountDueCents };
}
