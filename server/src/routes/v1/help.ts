import { Router } from "express";
import * as help from "../../controllers/help.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import {
  validate,
  validateBody,
  validateParams,
} from "../../middlewares/validate.js";
import {
  askFromChapterBody,
  lessonReportBody,
  replyBody,
  threadParams,
} from "../../validations/help.js";

// Learner ⇄ mentor conversations. Mentors read and act on threads through the
// same endpoints; the service decides what each role may do.
const router = Router();

router.use(authenticate, requireVerified);

router.get("/threads", help.list);
router.post("/threads", validateBody(askFromChapterBody), help.ask);
router.post("/reports", validateBody(lessonReportBody), help.reportLesson);
router.get("/threads/:threadId", validateParams(threadParams), help.detail);
router.post(
  "/threads/:threadId/seen",
  validateParams(threadParams),
  help.markSeen,
);
router.post(
  "/threads/:threadId/messages",
  validate({ params: threadParams, body: replyBody }),
  help.postMessage,
);
router.post(
  "/threads/:threadId/resolve",
  validateParams(threadParams),
  help.resolve,
);

export default router;
