import { raw, Router } from "express";
import * as integrity from "../../controllers/integrity.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { userRateLimit } from "../../middlewares/rate-limit.js";
import { validate, validateParams } from "../../middlewares/validate.js";
import { INTEGRITY_LIMITS } from "../../shared/api/integrity.js";
import {
  attemptParams,
  integrityCameraBody,
  integrityEventsBody,
  secureExchangeBody,
  secureProofBody,
  secureStartBody,
} from "../../validations/integrity.js";

// Learner-side quiz integrity signals. The browser treats every failure here as
// non-fatal: a flaky connection must never block a quiz.
const router = Router();

router.use(authenticate);

router.post(
  "/attempts/:attemptId/events",
  validate({ params: attemptParams, body: integrityEventsBody }),
  userRateLimit({
    scope: "integrity-events",
    max: 60,
    keyFrom: (req) => req.params.attemptId as string,
    message: "Too many integrity reports.",
  }),
  integrity.recordEvents,
);
router.post(
  "/attempts/:attemptId/ping",
  validateParams(attemptParams),
  userRateLimit({
    scope: "integrity-ping",
    max: 30,
    keyFrom: (req) => req.params.attemptId as string,
    message: "Too many pings.",
  }),
  integrity.presence,
);
router.put(
  "/attempts/:attemptId/camera",
  validate({ params: attemptParams, body: integrityCameraBody }),
  integrity.setCamera,
);
router.post(
  "/attempts/:attemptId/snapshots",
  validateParams(attemptParams),
  userRateLimit({
    scope: "integrity-snapshot",
    max: 6,
    keyFrom: (req) => req.params.attemptId as string,
    message: "Snapshot skipped.",
  }),
  raw({ type: "image/jpeg", limit: INTEGRITY_LIMITS.snapshotMaxBytes }),
  integrity.uploadSnapshot,
);

// Secure mode: the desktop app trades the website's one-time link for an attempt, then records
// consent and its pre-check, beats every few seconds, and says when it is done.
router.post(
  "/secure/exchange",
  validate({ body: secureExchangeBody }),
  userRateLimit({
    scope: "integrity-secure-exchange",
    max: 10,
    message: "Too many exam launches. Wait a moment.",
  }),
  integrity.secureExchange,
);
router.post(
  "/attempts/:attemptId/secure/start",
  validate({ params: attemptParams, body: secureStartBody }),
  userRateLimit({
    scope: "integrity-secure-start",
    max: 10,
    keyFrom: (req) => req.params.attemptId as string,
  }),
  integrity.secureStart,
);
router.post(
  "/attempts/:attemptId/heartbeat",
  validate({ params: attemptParams, body: secureProofBody }),
  userRateLimit({
    scope: "integrity-heartbeat",
    max: 30,
    keyFrom: (req) => req.params.attemptId as string,
    message: "Too many heartbeats.",
  }),
  integrity.heartbeat,
);
router.post(
  "/attempts/:attemptId/secure/finish",
  validate({ params: attemptParams, body: secureProofBody }),
  integrity.secureFinish,
);

export default router;
