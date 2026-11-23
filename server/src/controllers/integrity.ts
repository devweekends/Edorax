import type { Request, Response } from "express";
import { BadRequestError } from "../utils/errors.js";
import { created, ok } from "../utils/responses.js";
import { requireCourseBySlug } from "../services/teach/access.js";
import { loadIntegrityOverview } from "../services/integrity/live.js";
import {
  openIntegrityAttempt,
  recordIntegrityEvents,
  recordPresence,
  saveIntegritySnapshot,
  setIntegrityCamera,
} from "../services/integrity/attempts.js";
import {
  loadIntegrityAttemptDetail,
  loadMenteeIntegrity,
  readSignedSnapshot,
  updateCourseIntegritySettings,
} from "../services/integrity/review.js";
import {
  exchangeSecureLaunch,
  createSecureLaunch,
} from "../services/integrity/secure-launch.js";
import {
  finishSecureSession,
  recordHeartbeat,
  startSecureSession,
} from "../services/integrity/secure-session.js";
import {
  findSimilarAnswers,
  loadWrittenAnswers,
} from "../services/integrity/embeddings.js";
import {
  loadFlaggedAttempts,
  reviewIntegrityAttempt,
} from "../services/integrity/review.js";
import type {
  CourseIntegrityBody,
  IntegrityCameraBody,
  IntegrityEventsBody,
  IntegrityReviewBody,
  SecureExchangeBody,
  SecureProofBody,
  SecureStartBody,
} from "../validations/integrity.js";

// POST /api/v1/chapters/:chapterId/integrity
export async function openAttempt(req: Request, res: Response) {
  ok(res, await openIntegrityAttempt(req.user, req.params.chapterId as string));
}

// POST /api/v1/integrity/attempts/:attemptId/events
export async function recordEvents(req: Request, res: Response) {
  const { events } = req.body as IntegrityEventsBody;
  ok(
    res,
    await recordIntegrityEvents(
      req.user,
      req.params.attemptId as string,
      events,
    ),
  );
}

// PUT /api/v1/integrity/attempts/:attemptId/camera
export async function setCamera(req: Request, res: Response) {
  const { status } = req.body as IntegrityCameraBody;
  ok(
    res,
    await setIntegrityCamera(req.user, req.params.attemptId as string, status),
  );
}

// POST /api/v1/integrity/attempts/:attemptId/snapshots (body: image/jpeg bytes)
export async function uploadSnapshot(req: Request, res: Response) {
  if (!Buffer.isBuffer(req.body))
    throw new BadRequestError("Send one small JPEG image.", "INVALID_SNAPSHOT");
  created(
    res,
    await saveIntegritySnapshot(
      req.user,
      req.params.attemptId as string,
      req.body,
    ),
  );
}

// GET /api/v1/teach/integrity/attempts/:attemptId
export async function attemptDetail(req: Request, res: Response) {
  ok(
    res,
    await loadIntegrityAttemptDetail(req.user!, req.params.attemptId as string),
  );
}

// PUT /api/v1/teach/courses/:courseId/integrity
export async function updateCourseSettings(req: Request, res: Response) {
  const { integritySnapshots, integrityMode } = req.body as CourseIntegrityBody;
  ok(
    res,
    await updateCourseIntegritySettings(
      req.user!,
      req.params.courseId as string,
      { integritySnapshots, integrityMode },
    ),
  );
}

// POST /api/v1/chapters/:chapterId/secure-launch (website: "Start exam" in a secure course)
export async function secureLaunch(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  ok(res, await createSecureLaunch(req.user, req.params.chapterId as string));
}

// POST /api/v1/integrity/secure/exchange (desktop app, signed in as the same learner)
export async function secureExchange(req: Request, res: Response) {
  const { chapterId, token } = req.body as SecureExchangeBody;
  res.set("Cache-Control", "no-store");
  ok(res, await exchangeSecureLaunch(req.user, chapterId, token));
}

// POST /api/v1/integrity/attempts/:attemptId/secure/start
export async function secureStart(req: Request, res: Response) {
  ok(
    res,
    await startSecureSession(
      req.user,
      req.params.attemptId as string,
      req.body as SecureStartBody,
    ),
  );
}

// POST /api/v1/integrity/attempts/:attemptId/heartbeat
export async function heartbeat(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const proof = (req.body as SecureProofBody)?.proof;
  ok(
    res,
    await recordHeartbeat(req.user, req.params.attemptId as string, proof),
  );
}

// POST /api/v1/integrity/attempts/:attemptId/secure/finish
export async function secureFinish(req: Request, res: Response) {
  const proof = (req.body as SecureProofBody)?.proof;
  ok(
    res,
    await finishSecureSession(req.user, req.params.attemptId as string, proof),
  );
}

// GET /api/v1/teach/courses/:courseId/integrity/flagged
export async function flaggedAttempts(req: Request, res: Response) {
  ok(res, await loadFlaggedAttempts(req.user!, req.params.courseId as string));
}

// PUT /api/v1/teach/integrity/attempts/:attemptId/review
export async function reviewAttempt(req: Request, res: Response) {
  ok(
    res,
    await reviewIntegrityAttempt(
      req.user!,
      req.params.attemptId as string,
      req.body as IntegrityReviewBody,
    ),
  );
}

// GET /api/v1/teach/chapters/:chapterId/integrity/similarity
export async function similarAnswers(req: Request, res: Response) {
  ok(res, await findSimilarAnswers(req.user!, req.params.chapterId as string));
}

// GET /api/v1/media/integrity/:file?exp=&sig= (signed, short-lived)
export async function readSnapshot(req: Request, res: Response) {
  const snapshotId = (req.params.file as string).replace(/\.jpg$/, "");
  const bytes = await readSignedSnapshot(
    snapshotId,
    req.query.exp,
    req.query.sig,
  );
  res.set({
    "Content-Type": "image/jpeg",
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": "private, max-age=300",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(bytes);
}

// POST /api/v1/integrity/attempts/:attemptId/ping
export async function presence(req: Request, res: Response) {
  ok(res, await recordPresence(req.user, req.params.attemptId as string));
}

// GET /api/v1/teach/courses/:courseSlug/integrity/overview
export async function integrityOverview(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  ok(
    res,
    await loadIntegrityOverview(req.user!, req.params.courseSlug as string),
  );
}

// GET /api/v1/teach/courses/:courseSlug/mentees/:enrollmentId/integrity
export async function menteeIntegrity(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const course = await requireCourseBySlug(
    req.user!,
    req.params.courseSlug as string,
    "SUBMISSION_EVALUATOR",
  );
  ok(
    res,
    await loadMenteeIntegrity(
      req.user!,
      course.id,
      req.params.enrollmentId as string,
    ),
  );
}

// GET /api/v1/teach/chapters/:chapterId/integrity/answers
export async function writtenAnswers(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  ok(res, await loadWrittenAnswers(req.user!, req.params.chapterId as string));
}
