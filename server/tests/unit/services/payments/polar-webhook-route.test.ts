import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const validateEvent = vi.hoisted(() => vi.fn());
const fulfillPolarOrderPaid = vi.hoisted(() => vi.fn());

vi.mock("@polar-sh/sdk/2026-10", () => {
  class PolarWebhookVerificationError extends Error {}
  class PolarWebhookError extends Error {}
  return {
    webhooks: {
      validateEvent,
      PolarWebhookVerificationError,
      PolarWebhookError,
    },
  };
});

vi.mock("../../../../src/config/env.js", () => ({
  env: { POLAR_WEBHOOK_SECRET: "whsec_test" },
}));

vi.mock("../../../../src/services/payments/fulfill-polar-order.js", () => ({ fulfillPolarOrderPaid }));
vi.mock("../../../../src/utils/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import polarWebhookRoutes from "../../../../src/routes/webhook/polar.js";
import { webhooks } from "@polar-sh/sdk/2026-10";

function app() {
  const application = express();
  application.use("/webhooks/polar", express.raw({ type: "application/json" }), polarWebhookRoutes);
  return application;
}

describe("POST /webhooks/polar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fulfills order.paid after signature validation", async () => {
    validateEvent.mockResolvedValue({
      type: "order.paid",
      data: {
        id: "ord_1",
        checkout_id: "chk_1",
        metadata: { enrollmentId: "enr_1" },
      },
    });
    fulfillPolarOrderPaid.mockResolvedValue({ fulfilled: true, enrollmentId: "enr_1" });

    const res = await request(app())
      .post("/webhooks/polar")
      .set("Content-Type", "application/json")
      .set("webhook-id", "msg_1")
      .set("webhook-timestamp", "123")
      .set("webhook-signature", "v1,sig")
      .send(Buffer.from(JSON.stringify({ type: "order.paid" })));

    expect(res.status).toBe(200);
    expect(fulfillPolarOrderPaid).toHaveBeenCalledWith({
      orderId: "ord_1",
      checkoutId: "chk_1",
      metadata: { enrollmentId: "enr_1" },
    });
  });

  it("rejects invalid signatures", async () => {
    validateEvent.mockRejectedValue(new webhooks.PolarWebhookVerificationError("bad"));

    const res = await request(app())
      .post("/webhooks/polar")
      .set("Content-Type", "application/json")
      .set("webhook-id", "msg_1")
      .set("webhook-timestamp", "123")
      .set("webhook-signature", "v1,bad")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(403);
    expect(fulfillPolarOrderPaid).not.toHaveBeenCalled();
  });

  it("acknowledges refund events without fulfilling", async () => {
    validateEvent.mockResolvedValue({
      type: "order.refunded",
      data: { id: "ord_refund" },
    });

    const res = await request(app())
      .post("/webhooks/polar")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(200);
    expect(fulfillPolarOrderPaid).not.toHaveBeenCalled();
  });
});
