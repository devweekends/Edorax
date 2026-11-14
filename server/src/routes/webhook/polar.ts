import { Router, type Request, type Response } from "express";
import { webhooks } from "@polar-sh/sdk/2026-10";
import { env } from "../../config/env.js";
import { fulfillPolarOrderPaid } from "../../services/payments/fulfill-polar-order.js";
import { revokePolarOrderRefund } from "../../services/payments/refund-polar-order.js";
import { logger } from "../../utils/logger.js";

function orderMetadata(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
}

const router = Router();

function webhookHeaders(req: Request): Record<string, string> {
  return {
    "webhook-id": String(req.header("webhook-id") ?? ""),
    "webhook-timestamp": String(req.header("webhook-timestamp") ?? ""),
    "webhook-signature": String(req.header("webhook-signature") ?? ""),
  };
}

router.post("/", async (req: Request, res: Response) => {
  const secret = env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Polar webhooks are not configured" });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") {
    res.status(400).json({ error: "Expected raw webhook body" });
    return;
  }

  let event: Awaited<ReturnType<typeof webhooks.validateEvent>>;
  try {
    event = await webhooks.validateEvent(rawBody, webhookHeaders(req), secret);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError) {
      res.status(403).json({ error: "Invalid webhook signature" });
      return;
    }
    if (error instanceof webhooks.PolarWebhookError) {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }
    throw error;
  }

  try {
    if (event.type === "order.paid") {
      const order = event.data;
      await fulfillPolarOrderPaid({
        orderId: order.id,
        checkoutId: order.checkout_id,
        metadata: orderMetadata(order.metadata),
      });
    } else if (event.type === "order.refunded") {
      // A full refund removes course access; a partial one keeps it (see revokePolarOrderRefund).
      const order = event.data;
      await revokePolarOrderRefund({
        orderId: order.id,
        checkoutId: order.checkout_id,
        metadata: orderMetadata(order.metadata),
        status: order.status,
        refundedAmount: order.refunded_amount,
        totalAmount: order.total_amount,
      });
    }
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error, type: event.type }, "polar webhook handler failed");
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
