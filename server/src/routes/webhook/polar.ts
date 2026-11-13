import { Router, type Request, type Response } from "express";
import { webhooks } from "@polar-sh/sdk/2026-10";
import { env } from "../../config/env.js";
import { fulfillPolarOrderPaid } from "../../services/payments/fulfill-polar-order.js";
import { logger } from "../../utils/logger.js";

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
      const metadata =
        order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
          ? (order.metadata as Record<string, unknown>)
          : null;
      await fulfillPolarOrderPaid({
        orderId: order.id,
        checkoutId: order.checkout_id,
        metadata,
      });
    } else if (event.type === "order.refunded") {
      // Product is non-refundable; keep access and log for ops visibility.
      logger.info({ orderId: event.data.id, type: event.type }, "polar refund event ignored (non-refundable product)");
    }
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error, type: event.type }, "polar webhook handler failed");
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
