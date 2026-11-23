import { prisma } from "../../db/prisma.js";
import { cameraPhotosAvailable } from "./snapshot-store.js";
import type {
  IntegrityLiveUpdate,
  IntegrityOverview,
} from "../../shared/api/integrity.js";
import type { SessionUser } from "../../types/auth.js";
import { logger } from "../../utils/logger.js";
import { isOnline, openConnectionCount, publish } from "../realtime/hub.js";
import { requireCourseBySlug } from "../teach/access.js";
import {
  loadAttemptForLive,
  loadFlaggedAttempts,
  loadRecentAttempts,
} from "./review.js";

// Pushes real attempt changes to the people who review them. Nothing here invents data: each push
// carries the attempt exactly as the database holds it a moment after the change.
//
// A burst of changes (several notes in a second) becomes one push, and a push is only built when a
// mentor of that course actually has a live stream open, so an idle course costs nothing.

const timers = new Map<string, NodeJS.Timeout>();
const lastSent = new Map<string, number>();
const recipientCache = new Map<string, { ids: string[]; at: number }>();
const RECIPIENT_TTL_MS = 60_000;

async function recipientsFor(courseId: string): Promise<string[]> {
  const cached = recipientCache.get(courseId);
  if (cached && Date.now() - cached.at < RECIPIENT_TTL_MS) return cached.ids;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { mentorId: true, instructors: { select: { userId: true } } },
  });
  const ids = course
    ? [
        ...new Set([
          course.mentorId,
          ...course.instructors.map((item) => item.userId),
        ]),
      ]
    : [];
  recipientCache.set(courseId, { ids, at: Date.now() });
  return ids;
}

async function push(attemptId: string): Promise<void> {
  try {
    const live = await loadAttemptForLive(attemptId);
    if (!live) return;
    const listening = (await recipientsFor(live.courseId)).filter((id) =>
      isOnline(id),
    );
    if (!listening.length) return;
    const payload: IntegrityLiveUpdate = {
      enrollmentId: live.enrollmentId,
      courseId: live.courseId,
      attempt: live.attempt,
    };
    for (const userId of listening) publish(userId, "integrity-live", payload);
  } catch (error) {
    logger.warn({ err: error, attemptId }, "[integrity] live push failed");
  }
}

/** Tell the course's mentors that this attempt changed. Safe to call often. */
export function notifyIntegrity(attemptId: string, minGapMs = 600): void {
  if (timers.has(attemptId)) return;
  const wait = Math.max(
    0,
    minGapMs - (Date.now() - (lastSent.get(attemptId) ?? 0)),
  );
  const timer = setTimeout(() => {
    timers.delete(attemptId);
    lastSent.set(attemptId, Date.now());
    if (lastSent.size > 2000) lastSent.clear();
    void push(attemptId);
  }, wait);
  timer.unref?.();
  timers.set(attemptId, timer);
}

/** The course-level live board and review queue. */
export async function loadIntegrityOverview(
  user: SessionUser,
  courseSlug: string,
): Promise<IntegrityOverview> {
  const course = await requireCourseBySlug(
    user,
    courseSlug,
    "SUBMISSION_EVALUATOR",
  );
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [
    live,
    flagged,
    answered,
    total,
    latest,
    settings,
    eventsLastHour,
    lastEvent,
  ] = await Promise.all([
    loadRecentAttempts(user, course.id),
    loadFlaggedAttempts(user, course.id),
    // Quizzes worth comparing: written answers a learner actually submitted, with how many learners.
    prisma.response.findMany({
      where: {
        status: { not: "DRAFT" },
        block: {
          type: "OPEN_QUESTION",
          archivedAt: null,
          chapter: {
            courseId: course.id,
            readerMode: "QUIZ",
            archivedAt: null,
          },
        },
      },
      select: {
        userId: true,
        block: {
          select: {
            chapterId: true,
            chapter: { select: { title: true, order: true } },
          },
        },
      },
      take: 20_000,
    }),
    prisma.integrityAttempt.count({
      where: { enrollment: { courseId: course.id } },
    }),
    prisma.integrityAttempt.findFirst({
      where: { enrollment: { courseId: course.id } },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    }),
    prisma.course.findUnique({
      where: { id: course.id },
      select: { integrityMode: true, integritySnapshots: true },
    }),
    prisma.integrityEvent.count({
      where: {
        at: { gt: hourAgo },
        attempt: { enrollment: { courseId: course.id } },
      },
    }),
    prisma.integrityEvent.findFirst({
      where: { attempt: { enrollment: { courseId: course.id } } },
      orderBy: { at: "desc" },
      select: { at: true },
    }),
  ]);

  const byQuiz = new Map<
    string,
    { title: string; order: number; users: Set<string> }
  >();
  for (const row of answered) {
    const entry = byQuiz.get(row.block.chapterId) ?? {
      title: row.block.chapter.title,
      order: row.block.chapter.order,
      users: new Set<string>(),
    };
    entry.users.add(row.userId);
    byQuiz.set(row.block.chapterId, entry);
  }
  const quizChapters = [...byQuiz]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, entry]) => ({
      id,
      title: entry.title,
      learners: entry.users.size,
    }));

  return {
    course: { id: course.id, slug: course.slug, title: course.title },
    totals: {
      attempts: total,
      lastSeenAt: latest?.lastSeenAt.toISOString() ?? null,
    },
    live,
    flagged,
    quizChapters,
    health: {
      mode: settings?.integrityMode ?? "STANDARD",
      cameraOn: Boolean(settings?.integritySnapshots),
      cameraAvailable: cameraPhotosAvailable(),
      eventsLastHour,
      lastEventAt: lastEvent?.at.toISOString() ?? null,
      streamsOpen: openConnectionCount(user.id),
    },
  };
}
