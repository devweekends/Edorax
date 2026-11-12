import { Router } from "express";
import * as courses from "../../controllers/courses.js";
import * as enrollments from "../../controllers/enrollments.js";
import * as certificates from "../../controllers/certificates.js";
import { certificateClaimBody } from "../../validations/capstone.js";
import { authenticate, optionalAuth } from "../../middlewares/authenticate.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import { validateBody, validateParams } from "../../middlewares/validate.js";
import { chapterPathParams, chooseSpecialisationBody, chooseVariantBody, courseRatingBody, courseSlugParams } from "../../validations/courses.js";

const router = Router();

router.get("/:courseSlug/continue", optionalAuth, validateParams(courseSlugParams), courses.continueChapter);
router.get("/:courseSlug/certificate", authenticate, requireVerified, validateParams(courseSlugParams), certificates.mine);
router.post("/:courseSlug/certificate", authenticate, requireVerified, validateParams(courseSlugParams), validateBody(certificateClaimBody), certificates.claim);
router.get("/:courseSlug/overview", authenticate, requireVerified, validateParams(courseSlugParams), courses.overview);
router.get("/:courseSlug/rating", authenticate, requireVerified, validateParams(courseSlugParams), courses.getRating);
router.put(
  "/:courseSlug/rating",
  authenticate,
  requireVerified,
  validateParams(courseSlugParams),
  validateBody(courseRatingBody),
  courses.putRating
);
router.post(
  "/:courseSlug/rating/dismiss",
  authenticate,
  requireVerified,
  validateParams(courseSlugParams),
  courses.dismissRating
);
router.get("/:courseSlug/chapters/:chapterSlug", authenticate, requireVerified, validateParams(chapterPathParams), courses.chapter);
router.get("/:courseSlug/chapters/:chapterSlug/download", authenticate, requireVerified, validateParams(chapterPathParams), courses.downloadChapter);
router.put(
  "/:courseSlug/track/variant",
  authenticate,
  requireVerified,
  validateParams(courseSlugParams),
  validateBody(chooseVariantBody),
  courses.chooseVariant
);
router.put(
  "/:courseSlug/track/specialisation",
  authenticate,
  requireVerified,
  validateParams(courseSlugParams),
  validateBody(chooseSpecialisationBody),
  courses.chooseSpecialisation
);
router.post(
  "/:courseSlug/upgrade-curriculum",
  authenticate,
  requireVerified,
  validateParams(courseSlugParams),
  courses.upgradeCurriculum
);
router.get("/:courseSlug/checkout", authenticate, requireVerified, validateParams(courseSlugParams), enrollments.checkout);

export default router;
