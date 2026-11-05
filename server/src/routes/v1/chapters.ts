import { Router } from "express";
import * as chapters from "../../controllers/chapters.js";
import * as integrity from "../../controllers/integrity.js";
import { authenticate, optionalAuth } from "../../middlewares/authenticate.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import { userRateLimit } from "../../middlewares/rate-limit.js";
import { validate, validateParams } from "../../middlewares/validate.js";
import {
  askChapterBody,
  chapterParams,
  checklistItemBody,
  checklistItemParams,
  headingNoteBody,
  headingNoteParams,
  highlightCreateBody,
  highlightParams,
  highlightUpdateBody,
  learningLogBody,
  quizSubmitBody,
} from "../../validations/chapters.js";

const router = Router();

router.post(
  "/:chapterId/quiz/submit",
  optionalAuth,
  validate({ params: chapterParams, body: quizSubmitBody }),
  userRateLimit({
    scope: "quiz-submit",
    max: 10,
    keyFrom: (req) => req.params.chapterId as string,
    message: "Too many quiz submissions. Please wait a moment.",
  }),
  chapters.submitQuiz
);

// Learner progress on a chapter: completion, checklist ticks, reflections, margin notes.
const learner = [authenticate, requireVerified] as const;
router.get("/:chapterId/quiz", ...learner, validateParams(chapterParams), chapters.quizState);
router.post("/:chapterId/integrity", ...learner, validateParams(chapterParams), integrity.openAttempt);
router.post("/:chapterId/complete", ...learner, validateParams(chapterParams), chapters.complete);
router.put("/:chapterId/checklist/:itemId", ...learner, validate({ params: checklistItemParams, body: checklistItemBody }), chapters.putChecklistItem);
router.put("/:chapterId/learning-log", ...learner, validate({ params: chapterParams, body: learningLogBody }), chapters.putLearningLog);
router.put("/:chapterId/notes/:headingId", ...learner, validate({ params: headingNoteParams, body: headingNoteBody }), chapters.putHeadingNote);

// Learner highlights on a chapter (private annotations).
router.get("/:chapterId/highlights", ...learner, validateParams(chapterParams), chapters.getHighlights);
router.post("/:chapterId/highlights", ...learner, validate({ params: chapterParams, body: highlightCreateBody }), chapters.postHighlight);
router.patch("/:chapterId/highlights/:highlightId", ...learner, validate({ params: highlightParams, body: highlightUpdateBody }), chapters.patchHighlight);
router.delete("/:chapterId/highlights/:highlightId", ...learner, validateParams(highlightParams), chapters.deleteHighlight);

// Ask about this chapter. Access is checked in the service (same rules as blocks); the daily and
// platform limits are counted in the database, and this limiter only blunts a burst before it gets there.
router.get("/:chapterId/ask", ...learner, validateParams(chapterParams), chapters.askStatus);
router.post(
  "/:chapterId/ask",
  ...learner,
  validate({ params: chapterParams, body: askChapterBody }),
  userRateLimit({ scope: "chapter-ask", max: 10, message: "You are asking quickly. Wait a minute and try again." }),
  chapters.ask
);

export default router;
