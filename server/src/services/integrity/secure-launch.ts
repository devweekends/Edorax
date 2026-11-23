import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { SECURE_DEEP_LINK_SCHEME, SECURE_LIMITS, type SecureExchangeResult, type SecureLaunch } from "../../shared/api/integrity.js";
import type { SessionUser } from "../../types/auth.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { requireBlockSubmissionAccess } from "../enrollment/api-learn-access.js";
import { openIntegrityAttempt } from "./attempts.js";
import { securePolicyFor } from "./secure-session.js";

// "Start exam" on the website makes a one-time link for the desktop app. The link is a random
// 256-bit value (only its hash is stored), tied to one learner and one exam, and it works once,
// for two minutes. It opens nothing by itself: the app must already be signed in as the same
// learner, so a link that leaks from a browser history is useless to anyone else.

const prefix = "exam-launch:";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identifierFor = (chapterId: string, userId: string) => `${prefix}${chapterId}:${userId}`;

export async function createSecureLaunch(user: SessionUser | undefined, chapterId: string): Promise<SecureLaunch> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId, archivedAt: null },
    select: { courseId: true, slug: true, readerMode: true, course: { select: { slug: true, integrityMode: true } } },
  });
  if (!chapter || chapter.readerMode !== "QUIZ") throw new NotFoundError("Quiz chapter not found");
  if (chapter.course.integrityMode !== "SECURE") throw new BadRequestError("This exam does not use the desktop app.", "SECURE_NOT_REQUIRED");
  await requireBlockSubmissionAccess(chapter.courseId, user);
  const learner = user!;

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SECURE_LIMITS.launchTokenTtlSeconds * 1000);
  const identifier = identifierFor(chapterId, learner.id);
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: prefix }, expires: { lt: new Date() } } });
  // One live link per learner and exam: clicking again replaces the old one.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token: hash(token), expires } });

  // The slugs only tell the app which lesson to open; the token is what carries the permission.
  const query = new URLSearchParams({ token, course: chapter.course.slug, chapter: chapter.slug });
  return { token, expiresAt: expires.toISOString(), courseSlug: chapter.course.slug, chapterSlug: chapter.slug, deepLink: `${SECURE_DEEP_LINK_SCHEME}://exam/${chapterId}?${query.toString()}` };
}

/** Called by the desktop app. Conditional deletion makes the link single-use even under concurrent calls. */
export async function exchangeSecureLaunch(user: SessionUser | undefined, chapterId: string, token: string): Promise<SecureExchangeResult> {
  if (!user) throw new ForbiddenError("Sign in to continue.");
  const consumed = await prisma.verificationToken.deleteMany({
    where: { token: hash(token), identifier: identifierFor(chapterId, user.id), expires: { gt: new Date() } },
  });
  if (consumed.count !== 1) {
    throw new BadRequestError("This exam link has expired or was already used. Start the exam again from the website.", "EXAM_LINK_INVALID");
  }
  const attempt = await openIntegrityAttempt(user, chapterId);
  if (attempt.mode !== "SECURE") throw new BadRequestError("This exam no longer uses the desktop app.", "SECURE_NOT_REQUIRED");
  return { chapterId, attempt, policy: await securePolicyFor(chapterId) };
}
