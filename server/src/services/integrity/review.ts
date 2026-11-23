import { prisma } from "../../db/prisma.js";
import type { Prisma } from "../../generated/prisma/index.js";
import {
  INTEGRITY_INFO_EVENTS,
  INTEGRITY_ONLINE_WINDOW_MS,
  scoreIntegrityRisk,
  type IntegrityAttemptDetail,
  type IntegrityAttemptSummary,
  type IntegrityEventType,
  type IntegrityFlaggedAttempt,
  type IntegrityLearnerAttempt,
  type IntegrityMode,
  type IntegrityReviewDecision,
  type IntegrityReviewRecord,
} from "../../shared/api/integrity.js";
import type { SessionUser } from "../../types/auth.js";
import { NotFoundError } from "../../utils/errors.js";
import { requireCourseById } from "../teach/access.js";
import {
  signedSnapshotUrl,
  snapshotSigningAvailable,
  verifySnapshotSignature,
} from "./signed-url.js";
import { snapshotStore } from "./snapshot-store.js";

// The mentor's side of quiz integrity. Callers must have checked course access;
// learners never reach these functions (their API only returns a flag count).

const SUMMARY_LIMIT = 60;

const summarySelect = {
  id: true,
  chapterId: true,
  attempt: true,
  startedAt: true,
  lastSeenAt: true,
  cameraStatus: true,
  droppedEvents: true,
  snapshotCount: true,
  mode: true,
  secureSession: { select: { endedAt: true } },
  chapter: { select: { title: true } },
  review: {
    select: {
      decision: true,
      note: true,
      reviewerName: true,
      reviewedAt: true,
    },
  },
} satisfies Prisma.IntegrityAttemptSelect;

type SummaryRow = Prisma.IntegrityAttemptGetPayload<{
  select: typeof summarySelect;
}>;

function toSummary(
  row: SummaryRow,
  counts: Partial<Record<IntegrityEventType, number>>,
): IntegrityAttemptSummary {
  const flagCount = Object.entries(counts).reduce(
    (total, [type, count]) =>
      INTEGRITY_INFO_EVENTS.has(type as IntegrityEventType)
        ? total
        : total + (count ?? 0),
    0,
  );
  return {
    id: row.id,
    chapterId: row.chapterId,
    chapterTitle: row.chapter.title,
    attempt: row.attempt,
    startedAt: row.startedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    cameraStatus: row.cameraStatus,
    flagCount,
    droppedEvents: row.droppedEvents,
    counts,
    snapshotCount: row.snapshotCount,
    mode: row.mode,
    // A finished secure sitting is never "online", even in the seconds after its last report.
    online:
      row.secureSession?.endedAt == null &&
      Date.now() - row.lastSeenAt.getTime() < INTEGRITY_ONLINE_WINDOW_MS,
    risk: scoreIntegrityRisk(counts),
    review: row.review
      ? {
          decision: row.review.decision,
          note: row.review.note,
          reviewerName: row.review.reviewerName,
          reviewedAt: row.review.reviewedAt.toISOString(),
        }
      : null,
  };
}

async function countsByAttempt(attemptIds: string[]) {
  const grouped = attemptIds.length
    ? await prisma.integrityEvent.groupBy({
        by: ["attemptId", "type"],
        where: { attemptId: { in: attemptIds } },
        _count: { _all: true },
      })
    : [];
  const byAttempt = new Map<
    string,
    Partial<Record<IntegrityEventType, number>>
  >();
  for (const row of grouped) {
    const counts = byAttempt.get(row.attemptId) ?? {};
    counts[row.type] = row._count._all;
    byAttempt.set(row.attemptId, counts);
  }
  return byAttempt;
}

/** Newest attempts first, optionally for one chapter. Attempts with nothing to report are kept so mentors see clean runs too. */
export async function loadIntegritySummaries(
  enrollmentId: string,
  chapterId?: string,
): Promise<IntegrityAttemptSummary[]> {
  const rows = await prisma.integrityAttempt.findMany({
    where: { enrollmentId, ...(chapterId ? { chapterId } : {}) },
    orderBy: { startedAt: "desc" },
    take: SUMMARY_LIMIT,
    select: summarySelect,
  });
  const counts = await countsByAttempt(rows.map((row) => row.id));
  return rows.map((row) => toSummary(row, counts.get(row.id) ?? {}));
}

/** Every stored event and snapshot of one attempt, for anyone on the course team. */
export async function loadIntegrityAttemptDetail(
  user: SessionUser,
  attemptId: string,
): Promise<IntegrityAttemptDetail> {
  const row = await prisma.integrityAttempt.findUnique({
    where: { id: attemptId },
    select: {
      ...summarySelect,
      enrollment: { select: { courseId: true } },
      events: {
        orderBy: { at: "asc" },
        select: { id: true, type: true, at: true, blockId: true, meta: true },
      },
      snapshots: {
        orderBy: { takenAt: "asc" },
        select: { id: true, takenAt: true, deletedAt: true },
      },
    },
  });
  if (!row) throw new NotFoundError("Quiz attempt not found");
  await requireCourseById(
    user,
    row.enrollment.courseId,
    "SUBMISSION_EVALUATOR",
  );

  const counts: Partial<Record<IntegrityEventType, number>> = {};
  for (const event of row.events)
    counts[event.type] = (counts[event.type] ?? 0) + 1;

  const now = Date.now();
  let expiresAt: Date | null = null;
  const snapshots = row.snapshots.map((snapshot) => {
    if (snapshot.deletedAt || !snapshotSigningAvailable())
      return {
        id: snapshot.id,
        takenAt: snapshot.takenAt.toISOString(),
        url: null,
      };
    const signed = signedSnapshotUrl(snapshot.id, now);
    expiresAt = signed.expiresAt;
    return {
      id: snapshot.id,
      takenAt: snapshot.takenAt.toISOString(),
      url: signed.url,
    };
  });

  return {
    ...toSummary(row, counts),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      at: event.at.toISOString(),
      blockId: event.blockId,
      meta: (event.meta as Record<string, unknown> | null) ?? null,
    })),
    snapshots,
    snapshotUrlExpiresAt: (expiresAt as Date | null)?.toISOString() ?? null,
  };
}

/** Streams one snapshot for a valid signed link. Anything else is a plain 404. */
export async function readSignedSnapshot(
  snapshotId: string,
  exp: unknown,
  sig: unknown,
): Promise<Buffer> {
  if (!verifySnapshotSignature(snapshotId, exp, sig))
    throw new NotFoundError("Snapshot not found");
  const snapshot = await prisma.integritySnapshot.findUnique({
    where: { id: snapshotId },
    select: { storageKey: true, deletedAt: true },
  });
  if (!snapshot || snapshot.deletedAt)
    throw new NotFoundError("Snapshot not found");
  return snapshotStore().get(snapshot.storageKey);
}

export async function updateCourseIntegritySettings(
  user: SessionUser,
  courseId: string,
  patch: { integritySnapshots?: boolean; integrityMode?: IntegrityMode },
) {
  await requireCourseById(user, courseId);
  return prisma.course.update({
    where: { id: courseId },
    data: {
      integritySnapshots: patch.integritySnapshots,
      integrityMode: patch.integrityMode,
    },
    select: { integritySnapshots: true, integrityMode: true },
  });
}

/**
 * Attempts worth a mentor's time, most risky first, then ones nobody has looked at yet.
 * The risk number only orders the list. A clean attempt stays out; a reviewed one stays in
 * so the decision is visible.
 */
export async function loadFlaggedAttempts(
  user: SessionUser,
  courseId: string,
): Promise<IntegrityFlaggedAttempt[]> {
  await requireCourseById(user, courseId, "SUBMISSION_EVALUATOR");
  const rows = await prisma.integrityAttempt.findMany({
    where: { enrollment: { courseId }, eventCount: { gt: 0 } },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: {
      ...summarySelect,
      enrollmentId: true,
      enrollment: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  const counts = await countsByAttempt(rows.map((row) => row.id));
  return rows
    .map((row) => ({
      ...toSummary(row, counts.get(row.id) ?? {}),
      enrollmentId: row.enrollmentId,
      learner: {
        id: row.enrollment.user?.id ?? "",
        name: row.enrollment.user?.name ?? null,
      },
    }))
    .filter(
      (attempt) => attempt.risk.level !== "LOW" || attempt.review !== null,
    )
    .sort(
      (a, b) =>
        Number(a.review !== null) - Number(b.review !== null) ||
        b.risk.score - a.risk.score,
    )
    .slice(0, SUMMARY_LIMIT);
}

/** The mentor's decision. This is the only place a verdict is ever written, and it needs a person. */
export async function reviewIntegrityAttempt(
  user: SessionUser,
  attemptId: string,
  input: { decision: IntegrityReviewDecision; note?: string | null },
): Promise<IntegrityReviewRecord> {
  const attempt = await prisma.integrityAttempt.findUnique({
    where: { id: attemptId },
    select: { enrollment: { select: { courseId: true } } },
  });
  if (!attempt) throw new NotFoundError("Quiz attempt not found");
  await requireCourseById(
    user,
    attempt.enrollment.courseId,
    "SUBMISSION_EVALUATOR",
  );
  const data = {
    decision: input.decision,
    note: input.note?.trim() || null,
    reviewerId: user.id,
    reviewerName: (user.name || user.email || "Mentor").slice(0, 120),
    reviewedAt: new Date(),
  };
  const saved = await prisma.integrityReview.upsert({
    where: { attemptId },
    create: { attemptId, ...data },
    update: data,
  });
  return {
    decision: saved.decision,
    note: saved.note,
    reviewerName: saved.reviewerName,
    reviewedAt: saved.reviewedAt.toISOString(),
  };
}

/** One attempt as the mentor sees it, read fresh from the database. Used to push live updates. */
export async function loadAttemptForLive(attemptId: string) {
  const row = await prisma.integrityAttempt.findUnique({
    where: { id: attemptId },
    select: {
      ...summarySelect,
      enrollmentId: true,
      enrollment: { select: { courseId: true } },
    },
  });
  if (!row) return null;
  const counts = (await countsByAttempt([row.id])).get(row.id) ?? {};
  return {
    attempt: toSummary(row, counts),
    enrollmentId: row.enrollmentId,
    courseId: row.enrollment.courseId,
  };
}

/** Everything one learner did in this course's quizzes. The polling fallback of the live panel. */
export async function loadMenteeIntegrity(
  user: SessionUser,
  courseId: string,
  enrollmentId: string,
): Promise<IntegrityAttemptSummary[]> {
  await requireCourseById(user, courseId, "SUBMISSION_EVALUATOR");
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { courseId: true },
  });
  if (!enrollment || enrollment.courseId !== courseId)
    throw new NotFoundError("Enrollment not found");
  return loadIntegritySummaries(enrollmentId);
}

/** Sittings that reported in during the last 24 hours, newest first, for the live board. */
export async function loadRecentAttempts(
  user: SessionUser,
  courseId: string,
): Promise<IntegrityLearnerAttempt[]> {
  await requireCourseById(user, courseId, "SUBMISSION_EVALUATOR");
  const rows = await prisma.integrityAttempt.findMany({
    where: {
      enrollment: { courseId },
      lastSeenAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { lastSeenAt: "desc" },
    take: SUMMARY_LIMIT,
    select: {
      ...summarySelect,
      enrollmentId: true,
      enrollment: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  const counts = await countsByAttempt(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...toSummary(row, counts.get(row.id) ?? {}),
    enrollmentId: row.enrollmentId,
    learner: {
      id: row.enrollment.user?.id ?? "",
      name: row.enrollment.user?.name ?? null,
    },
  }));
}
