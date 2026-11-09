import { userRateLimit } from "../../middlewares/rate-limit.js";
import { Router } from "express";
import * as enrollments from "../../controllers/enrollments.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import { validateBody, validateParams } from "../../middlewares/validate.js";
import { enrollmentParams, selfEnrollBody } from "../../validations/enrollments.js";

const router = Router();

router.use(authenticate, requireVerified);

router.post("/", userRateLimit({ scope: "self-enroll", max: 20, windowMs: 60 * 60_000 }), validateBody(selfEnrollBody), enrollments.create);
router.post("/:enrollmentId/request-access", userRateLimit({ scope: "course-access-request", max: 5, windowMs: 60 * 60_000 }), validateParams(enrollmentParams), enrollments.requestAccess);

export default router;
