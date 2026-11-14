import { z } from "zod";
import { id, params } from "./common.js";

export const selfEnrollBody = z.object({ courseId: id, couponCode: z.string().trim().min(3).max(32).optional() });
export const enrollmentParams = params("enrollmentId");
export const refundBody = z.object({
  reason: z.enum(["customer_request", "duplicate", "fraudulent", "service_disruption", "satisfaction_guarantee", "other"]).optional(),
  comment: z.string().trim().max(500).optional(),
});

/** Admin edit of an enrollment: course access and payment status only. Only the fields sent change. */
export const adminEnrollmentUpdateBody = z
  .object({
    lifecycle: z.enum(["PENDING_ACCOUNT", "PAYMENT_REQUIRED", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
    paymentStatus: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"]).optional(),
  })
  .strict()
  .refine((body) => body.lifecycle !== undefined || body.paymentStatus !== undefined, { message: "Nothing to update." });
export type AdminEnrollmentUpdateBody = z.infer<typeof adminEnrollmentUpdateBody>;
