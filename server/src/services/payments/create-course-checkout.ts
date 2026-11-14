import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { getPolarClient, requirePolarConfig } from "./polar.js";
import { ensureCoursePolarProduct } from "./course-product.js";

export type CourseCheckoutSession = { url: string; checkoutId: string };

function presentmentCurrency(currency: string) {
  return currency.trim().toLowerCase() as "usd";
}

/**
 * Start a Polar checkout for a learner who still owes money on a paid course.
 * Pins an ad-hoc fixed price to the enrollment's amount due so coupons match what Edorax shows.
 */
export async function createCourseCheckout(
  enrollmentId: string,
  userId: string,
  options: { customerIpAddress?: string | null } = {}
): Promise<CourseCheckoutSession> {
  requirePolarConfig();
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, userId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      course: { select: { id: true, slug: true, title: true, description: true, status: true, pricingType: true, priceCents: true, currency: true, mentorId: true } },
      payment: true,
    },
  });
  if (!enrollment || !enrollment.user) throw new NotFoundError("Enrollment not found");
  if (enrollment.userId !== userId) throw new ForbiddenError("You do not own this enrollment.");
  if (enrollment.course.mentorId === userId) {
    throw new ConflictError("Instructors do not pay for their own course.", "PAYMENT_NOT_REQUIRED");
  }
  if (enrollment.lifecycle !== "PAYMENT_REQUIRED") {
    throw new ConflictError("This enrollment is not awaiting payment.", "PAYMENT_NOT_REQUIRED");
  }
  if (enrollment.course.status !== "PUBLISHED" || enrollment.course.pricingType !== "PAID") {
    throw new ConflictError("This course is not open for paid checkout.");
  }
  if (!enrollment.payment) throw new ConflictError("This enrollment has no payment record.");
  if (enrollment.payment.status === "SUCCEEDED") {
    throw new ConflictError("This enrollment is already paid.", "ALREADY_PAID");
  }

  const amountDueCents = enrollment.payment.amountCents;
  if (amountDueCents <= 0) {
    throw new BadRequestError("No payment is due for this enrollment.", "NO_AMOUNT_DUE");
  }

  const currency = presentmentCurrency(enrollment.payment.currency || enrollment.course.currency || "USD");
  const successUrl = `${env.APP_URL}/courses/${encodeURIComponent(enrollment.course.slug)}/checkout?paid=1`;
  const returnUrl = `${env.APP_URL}/courses/${encodeURIComponent(enrollment.course.slug)}/checkout`;

  // Every course has its own Polar product, created on its first checkout.
  const productId = await ensureCoursePolarProduct(enrollment.course);
  const polar = getPolarClient();
  const checkout = await polar.checkouts.create({
    products: [productId],
    prices: {
      [productId]: [
        {
          amount_type: "fixed",
          price_amount: amountDueCents,
          price_currency: currency,
        },
      ],
    },
    external_customer_id: userId,
    customer_email: enrollment.user.email,
    customer_name: enrollment.user.name,
    customer_ip_address: options.customerIpAddress ?? undefined,
    allow_discount_codes: false,
    success_url: successUrl,
    return_url: returnUrl,
    metadata: {
      enrollmentId: enrollment.id,
      courseId: enrollment.course.id,
      userId,
      courseSlug: enrollment.course.slug,
    },
  });

  if (!checkout.url) {
    throw new ConflictError("Polar did not return a checkout URL.");
  }

  await prisma.payment.update({
    where: { enrollmentId: enrollment.id },
    data: {
      provider: "polar",
      providerRef: checkout.id,
      status: "PENDING",
    },
  });

  return { url: checkout.url, checkoutId: checkout.id };
}
