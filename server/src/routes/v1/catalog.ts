import { Router } from "express";
import * as catalog from "../../controllers/catalog.js";
import { optionalAuth } from "../../middlewares/authenticate.js";
import { validateParams, validateQuery } from "../../middlewares/validate.js";
import { courseReviewsQuery, courseSlugParams } from "../../validations/courses.js";

const router = Router();

// Published catalog summaries and curriculum outlines are public.
router.get("/", optionalAuth, catalog.list);
router.get("/:courseSlug", optionalAuth, validateParams(courseSlugParams), catalog.detail);
router.get("/:courseSlug/reviews", optionalAuth, validateParams(courseSlugParams), validateQuery(courseReviewsQuery), catalog.reviews);

export default router;
