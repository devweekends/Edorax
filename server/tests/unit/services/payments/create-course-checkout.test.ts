import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  enrollment: { findFirst: vi.fn() },
  payment: { update: vi.fn() },
}));

const polarCreate = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/config/env.js", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    POLAR_ACCESS_TOKEN: "polar_token",
    POLAR_PRODUCT_ID: "prod_course",
    POLAR_WEBHOOK_SECRET: "whsec_test",
    POLAR_ENVIRONMENT: "sandbox",
  },
  polarPaymentsConfigured: true,
}));
vi.mock("../../../../src/services/payments/polar.js", () => ({
  requirePolarConfig: () => ({
    accessToken: "polar_token",
    productId: "prod_course",
    webhookSecret: "whsec_test",
    environment: "sandbox" as const,
  }),
  getPolarClient: () => ({ checkouts: { create: polarCreate } }),
  resetPolarClientForTests: () => undefined,
}));

import { createCourseCheckout } from "../../../../src/services/payments/create-course-checkout.js";

describe("createCourseCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Polar session with an ad-hoc price and stores the checkout id", async () => {
    db.enrollment.findFirst.mockResolvedValue({
      id: "enr_1",
      userId: "user_1",
      lifecycle: "PAYMENT_REQUIRED",
      user: { id: "user_1", email: "learner@example.com", name: "Learner" },
      course: {
        id: "course_1",
        slug: "system-design",
        title: "System Design",
        status: "PUBLISHED",
        pricingType: "PAID",
        priceCents: 1000,
        currency: "USD",
      },
      payment: { amountCents: 800, currency: "USD", status: "PENDING" },
    });
    polarCreate.mockResolvedValue({ id: "chk_1", url: "https://sandbox.polar.sh/checkout/chk_1" });

    const result = await createCourseCheckout("enr_1", "user_1", { customerIpAddress: "1.2.3.4" });

    expect(result).toEqual({ url: "https://sandbox.polar.sh/checkout/chk_1", checkoutId: "chk_1" });
    expect(polarCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        products: ["prod_course"],
        external_customer_id: "user_1",
        customer_email: "learner@example.com",
        allow_discount_codes: false,
        prices: {
          prod_course: [{ amount_type: "fixed", price_amount: 800, price_currency: "usd" }],
        },
        metadata: expect.objectContaining({ enrollmentId: "enr_1", courseSlug: "system-design" }),
      })
    );
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { enrollmentId: "enr_1" },
      data: { provider: "polar", providerRef: "chk_1", status: "PENDING" },
    });
  });

  it("rejects enrollments that are not awaiting payment", async () => {
    db.enrollment.findFirst.mockResolvedValue({
      id: "enr_1",
      userId: "user_1",
      lifecycle: "ACTIVE",
      user: { id: "user_1", email: "learner@example.com", name: "Learner" },
      course: { id: "course_1", slug: "system-design", title: "System Design", status: "PUBLISHED", pricingType: "PAID", priceCents: 1000, currency: "USD" },
      payment: { amountCents: 1000, currency: "USD", status: "SUCCEEDED" },
    });
    await expect(createCourseCheckout("enr_1", "user_1")).rejects.toThrow(/not awaiting payment/i);
    expect(polarCreate).not.toHaveBeenCalled();
  });
});
