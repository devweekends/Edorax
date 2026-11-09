import { requestManualAccess } from "../services/enrollment/manual-access.js";
import type { Request, Response } from "express";
import { created, ok } from "../utils/responses.js";
import { selfEnroll } from "../services/enrollment/self-enroll.js";
import { loadCheckout } from "../services/enrollment/checkout.js";

// POST /api/v1/enrollments
export async function create(req: Request, res: Response) {
  const { courseId, couponCode } = req.body as { courseId: string; couponCode?: string };
  const result = await selfEnroll(req.user!.id, courseId, couponCode);
  created(res, result);
}

// GET /api/v1/courses/:courseSlug/checkout
export async function checkout(req: Request, res: Response) {
  ok(res, await loadCheckout(req.params.courseSlug as string, req.user!.id));
}

// POST /api/v1/enrollments/:enrollmentId/request-access
export async function requestAccess(req: Request, res: Response) {
  ok(res, await requestManualAccess(req.params.enrollmentId as string, req.user!.id));
}
