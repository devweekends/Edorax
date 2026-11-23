import { randomBytes } from "node:crypto";
import { env, isProduction } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import {
  evaluateSecurePrecheck,
  INTEGRITY_INFO_EVENTS,
  SECURE_BLOCKED_APPS,
  SECURE_LIMITS,
  type IntegrityEventInput,
  type SecureHeartbeatResult,
  type SecurePolicy,
} from "../../shared/api/integrity.js";
import type { SessionUser } from "../../types/auth.js";
import { BadRequestError, ForbiddenError } from "../../utils/errors.js";
import type { SecureStartBody } from "../../validations/integrity.js";
import { recordIntegrityEvents, requireOwnAttempt } from "./attempts.js";
import {
  checkProof,
  DEV_APP_SIGNING_KEY,
  type AppProof,
  type ProofAction,
  type ProofPrecheck,
} from "./app-proof.js";
import { notifyIntegrity } from "./live.js";
import { cameraPhotosAvailable } from "./snapshot-store.js";

// The secure (desktop app) side of an exam: consent and pre-check, the heartbeat, and the
// rule that a secure course only accepts answers from a sitting that is still alive.
// Like the rest of integrity, none of this fails a learner. It records, and a mentor decides.

/** A sitting counts as alive for this long after its last heartbeat, so a short network drop never blocks a submit. */
const LIVE_WINDOW_MS = 60 * 1000;

const eventId = () => randomBytes(9).toString("base64url");

/** After the time limit, answers are still taken for this long, so the app's automatic save at zero goes through. */
const TIME_GRACE_MS = 60 * 1000;

/** When a sitting must end: its first consent plus the chapter's minutes. Null when the quiz has no time limit. */
function sittingDeadline(
  consentedAt: Date,
  minutes: number | null | undefined,
): number | null {
  return minutes && minutes > 0
    ? consentedAt.getTime() + minutes * 60_000 + TIME_GRACE_MS
    : null;
}

/**
 * Refuses a report that the desktop app did not sign for this attempt, this action and this
 * moment. A browser can copy the request, but it cannot make the signature.
 */
function requireAppProof(
  action: ProofAction,
  attemptId: string,
  proof: AppProof | undefined,
  precheck?: ProofPrecheck,
): void {
  const key =
    env.SECURE_APP_SIGNING_KEY ?? (isProduction ? null : DEV_APP_SIGNING_KEY);
  if (!key)
    throw new ForbiddenError(
      "Secure exams are not set up on this server yet. Please tell your mentor.",
      "SECURE_NOT_CONFIGURED",
    );
  const result = checkProof(key, action, attemptId, proof, precheck);
  if (result.ok) return;
  if (result.reason === "stale")
    throw new ForbiddenError(
      "The clock on this computer is wrong. Turn on automatic date and time, then try again.",
      "APP_CLOCK_OFF",
    );
  throw new ForbiddenError(
    "This step can only be done from the Edorax desktop app. Open the exam from the website with Start exam.",
    "SECURE_APP_REQUIRED",
  );
}

export async function securePolicyFor(
  chapterId: string,
): Promise<SecurePolicy> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { course: { select: { integritySnapshots: true } } },
  });
  return {
    heartbeatIntervalSeconds: SECURE_LIMITS.heartbeatIntervalSeconds,
    heartbeatGraceSeconds: SECURE_LIMITS.heartbeatGraceSeconds,
    // The course's camera switch doubles as "camera required" in secure mode.
    requireCamera:
      Boolean(chapter?.course.integritySnapshots) && cameraPhotosAvailable(),
    blockedApps: SECURE_BLOCKED_APPS,
  };
}

/** Stores consent and the pre-check result. The server applies the same rule as the app, so a skipped check is refused here too. */
export async function startSecureSession(
  user: SessionUser | undefined,
  attemptId: string,
  body: SecureStartBody,
) {
  const attempt = await requireOwnAttempt(user, attemptId);
  if (attempt.mode !== "SECURE")
    throw new BadRequestError(
      "This attempt is not a secure sitting.",
      "NOT_SECURE",
    );

  // Only the desktop app can sign this report. A browser that copies it by hand is refused here.
  requireAppProof("start", attemptId, body.proof, body.precheck);

  const policy = await securePolicyFor(attempt.chapterId);
  const verdict = evaluateSecurePrecheck(body.precheck, policy);
  if (!verdict.ok)
    throw new ForbiddenError(verdict.blockers.join(". "), "PRECHECK_FAILED");

  const now = new Date();
  const precheck = body.precheck as unknown as object;
  // A sitting whose time ran out starts again from now, the same as the app's own clock does.
  const [chapter, previous] = await Promise.all([
    prisma.chapter.findUnique({
      where: { id: attempt.chapterId },
      select: { estimatedMinutes: true },
    }),
    prisma.secureExamSession.findUnique({
      where: { attemptId },
      select: { consentedAt: true },
    }),
  ]);
  const deadline = previous
    ? sittingDeadline(previous.consentedAt, chapter?.estimatedMinutes)
    : null;
  const timeRanOut = deadline !== null && now.getTime() > deadline;
  await prisma.secureExamSession.upsert({
    where: { attemptId },
    create: {
      attemptId,
      consentedAt: now,
      platform: body.precheck.platform,
      appVersion: body.precheck.appVersion,
      precheck,
      lastHeartbeatAt: now,
    },
    // A resumed sitting (app restarted, power cut) keeps its first consent time, unless its time ran out.
    update: {
      platform: body.precheck.platform,
      appVersion: body.precheck.appVersion,
      precheck,
      lastHeartbeatAt: now,
      endedAt: null,
      ...(timeRanOut ? { consentedAt: now } : {}),
    },
  });

  // Apps that only warn are allowed but noted, so the mentor sees what was open.
  const noted: IntegrityEventInput[] = body.precheck.apps
    .filter((app) => app.action === "warn")
    .map((app) => ({
      id: eventId(),
      type: "BLOCKED_APP",
      at: now.toISOString(),
      meta: { app: app.id, label: app.label, action: "warn" },
    }));
  if (noted.length) await recordIntegrityEvents(user, attemptId, noted);
  notifyIntegrity(attemptId);

  return { started: true, warnings: verdict.warnings };
}

/**
 * One beat every few seconds from the app's main process. A long silence is stored as one
 * HEARTBEAT_GAP flag when the next beat arrives. The conditional update means two beats
 * racing each other cannot both claim the same gap.
 */
export async function recordHeartbeat(
  user: SessionUser | undefined,
  attemptId: string,
  proof?: AppProof,
): Promise<SecureHeartbeatResult> {
  await requireOwnAttempt(user, attemptId);
  requireAppProof("heartbeat", attemptId, proof);
  const session = await prisma.secureExamSession.findUnique({
    where: { attemptId },
    select: { lastHeartbeatAt: true, endedAt: true },
  });
  if (!session || session.endedAt)
    throw new ForbiddenError(
      "Start the secure exam first.",
      "SECURE_NOT_STARTED",
    );

  const now = new Date();
  const gapMs = now.getTime() - session.lastHeartbeatAt.getTime();
  const moved = await prisma.secureExamSession.updateMany({
    where: {
      attemptId,
      lastHeartbeatAt: session.lastHeartbeatAt,
      endedAt: null,
    },
    data: { lastHeartbeatAt: now, heartbeatCount: { increment: 1 } },
  });
  if (moved.count === 1) {
    await prisma.integrityAttempt.update({
      where: { id: attemptId },
      data: { lastSeenAt: now },
    });
    notifyIntegrity(attemptId, 4000);
    if (gapMs > SECURE_LIMITS.heartbeatGraceSeconds * 1000) {
      await recordIntegrityEvents(user, attemptId, [
        {
          id: eventId(),
          type: "HEARTBEAT_GAP",
          at: now.toISOString(),
          meta: { gapMs },
        },
      ]);
    }
  }

  const flagCount = await prisma.integrityEvent.count({
    where: { attemptId, type: { notIn: [...INTEGRITY_INFO_EVENTS] } },
  });
  return { nextInSeconds: SECURE_LIMITS.heartbeatIntervalSeconds, flagCount };
}

export async function finishSecureSession(
  user: SessionUser | undefined,
  attemptId: string,
  proof?: AppProof,
): Promise<{ ended: true }> {
  const attempt = await requireOwnAttempt(user, attemptId);
  // A standard-mode quiz says "done" here too. Only a Secure sitting has to prove it is the app.
  if (attempt.mode === "SECURE") requireAppProof("finish", attemptId, proof);
  const now = new Date();
  await prisma.$transaction([
    prisma.secureExamSession.updateMany({
      where: { attemptId, endedAt: null },
      data: { endedAt: now },
    }),
    prisma.integrityAttempt.update({
      where: { id: attemptId },
      data: { lastSeenAt: now },
    }),
  ]);
  notifyIntegrity(attemptId);
  return { ended: true };
}

/**
 * Secure courses take quiz answers only from a live desktop sitting. Browser-only learners
 * get a clear code (SECURE_REQUIRED) so the website can point them to the app.
 */
export async function assertSecureSitting(
  userId: string,
  chapterId: string,
): Promise<void> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      courseId: true,
      readerMode: true,
      estimatedMinutes: true,
      course: { select: { integrityMode: true } },
    },
  });
  if (
    !chapter ||
    chapter.readerMode !== "QUIZ" ||
    chapter.course.integrityMode !== "SECURE"
  )
    return;
  const live = await prisma.secureExamSession.findFirst({
    where: {
      endedAt: null,
      lastHeartbeatAt: { gt: new Date(Date.now() - LIVE_WINDOW_MS) },
      attempt: {
        chapterId,
        enrollment: { userId, courseId: chapter.courseId },
      },
    },
    select: { id: true, consentedAt: true },
  });
  if (!live)
    throw new ForbiddenError(
      "This exam must be taken in the Edorax desktop app. Open it from the website with Start exam.",
      "SECURE_REQUIRED",
    );
  // The app keeps its own clock too. This is the one the server believes.
  const deadline = sittingDeadline(live.consentedAt, chapter.estimatedMinutes);
  if (deadline !== null && Date.now() > deadline)
    throw new ForbiddenError(
      "Time is up for this exam.",
      "SECURE_TIME_UP",
    );
}
