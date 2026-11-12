import type { EngagementEvent, Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import { cleanChapterSlug } from "../chapters/chapter-slug.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import {
  ENGAGEMENT_ERROR_CODES,
  type EngagementEventType,
  type EngagementPlatform,
  type EngagementServerEventType,
  type RecordedEngagementEvent,
  type TrackEventResult,
} from "../../shared/api/engagement.js";
import { LONG_AWAY_DAYS } from "../../shared/engagement/rules.js";
import { levelForXp } from "../../shared/gamification/levels.js";
import { xpKeys } from "../../shared/gamification/xp.js";
import type { TrackEventBody } from "../../validations/engagement.js";
import { gamificationFeatures } from "../gamification/flags.js";
import { settleWeeklyGoal } from "../gamification/habit.js";
import { utcDateOnly } from "../progress/heartbeat.js";
import { loadLearnerHabit } from "../progress/learner-habit.js";
import { latestQuizAttempt } from "./quiz-facts.js";

export { summarizeQuizAttempt } from "./quiz-facts.js";

// Engagement events: the learning moments the app reacts to. The browser (or the mobile app)
// reports what happened; this module checks it against the database, fills in the facts, and
// stores it. Once-only moments carry a dedupe key, so a retried request or a second report is
// stored once and comes back with `isNew: false`, which the client treats as "already reacted".
//
// Events never write UserAppActivity.lastActiveAt: that column bounds heartbeat credit, and moving
// it from here would undercount active time. "Last seen" for welcome-back reads both sources.

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * App time the learner must have today before a long-session report counts. The client reports
 * after 50 continuous minutes; heartbeats arrive about once a minute, so this leaves slack.
 */
export const LONG_SESSION_MIN_ACTIVE_SECONDS = 30 * 60;

type Draft = {
  type: EngagementEventType | EngagementServerEventType;
  courseId: string | null;
  chapterId: string | null;
  payload: Prisma.InputJsonObject;
  dedupeKey: string | null;
};

function notVerified(message: string): ConflictError {
  return new ConflictError(message, ENGAGEMENT_ERROR_CODES.NOT_VERIFIED);
}

/** Whole days between the last time the learner was seen and `now`; null when never seen. */
export function wholeDaysAway(lastSeen: Date[], now: Date): number | null {
  if (lastSeen.length === 0) return null;
  const latest = Math.max(...lastSeen.map((date) => date.getTime()));
  return Math.max(0, Math.floor((now.getTime() - latest) / DAY_MS));
}

function toRecorded(row: EngagementEvent, isNew: boolean): RecordedEngagementEvent {
  return {
    id: row.id,
    type: row.type,
    courseId: row.courseId,
    chapterId: row.chapterId,
    payload: row.payload,
    isNew,
    createdAt: row.createdAt.toISOString(),
  } as RecordedEngagementEvent;
}

async function record(userId: string, platform: EngagementPlatform, draft: Draft): Promise<RecordedEngagementEvent> {
  const [created] = await prisma.engagementEvent.createManyAndReturn({
    data: [{ userId, platform, ...draft }],
    skipDuplicates: true,
  });
  if (created) return toRecorded(created, true);
  const existing = await prisma.engagementEvent.findUniqueOrThrow({
    where: { userId_dedupeKey: { userId, dedupeKey: draft.dedupeKey! } },
  });
  return toRecorded(existing, false);
}

async function requireChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, courseId: true, readerMode: true },
  });
  if (!chapter) throw new NotFoundError("Chapter not found");
  return chapter;
}

async function requireEnrollment(userId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_userId: { courseId, userId } },
    select: { id: true, status: true, lifecycle: true, chaptersCompleted: true },
  });
  if (!enrollment || (enrollment.lifecycle !== "ACTIVE" && enrollment.lifecycle !== "COMPLETED")) {
    throw notVerified("You are not enrolled in this course.");
  }
  return enrollment;
}

async function chapterIsComplete(enrollmentId: string, chapterId: string): Promise<boolean> {
  const progress = await prisma.chapterProgress.findUnique({
    where: { enrollmentId_chapterId: { enrollmentId, chapterId } },
    select: { status: true },
  });
  return progress?.status === "COMPLETED";
}

/** UTC calendar day, e.g. "2026-10-24", for once-a-day dedupe keys. */
const dayKey = (now: Date) => utcDateOnly(now).toISOString().slice(0, 10);

/** Days since the learner was last seen before today: earlier app activity or an earlier event. */
async function daysAwayBefore(userId: string, now: Date): Promise<number | null> {
  const [day, event] = await Promise.all([
    prisma.appActivityDay.findFirst({
      where: { userId, date: { lt: utcDateOnly(now) } },
      orderBy: { date: "desc" },
      select: { lastActiveAt: true },
    }),
    prisma.engagementEvent.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return wholeDaysAway(
    [day?.lastActiveAt, event?.createdAt].filter((date): date is Date => date instanceof Date),
    now
  );
}

/** The chapter to pick up again: the next unfinished one in the course the learner last studied. */
async function resumePoint(userId: string): Promise<{ href: string; chapterTitle: string } | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, lifecycle: "ACTIVE", status: { not: "COMPLETED" } },
    orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, course: { select: { id: true, slug: true } } },
  });
  if (!enrollment) return null;
  const done = await prisma.chapterProgress.findMany({
    where: { enrollmentId: enrollment.id, status: "COMPLETED" },
    select: { chapterId: true },
  });
  const chapter = await prisma.chapter.findFirst({
    where: {
      courseId: enrollment.course.id,
      publishedAt: { not: null },
      id: { notIn: done.map((row) => row.chapterId) },
    },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    select: { slug: true, title: true },
  });
  return chapter
    ? { href: `/courses/${enrollment.course.slug}/${cleanChapterSlug(chapter.slug)}`, chapterTitle: chapter.title }
    : null;
}

type CourseMilestone = "course_first_chapter" | "course_halfway" | "course_one_left";

/** Course milestones a learner reaches with `chaptersCompleted` of `totalChapters` done. */
export function courseMilestonesFor(chaptersCompleted: number, totalChapters: number): CourseMilestone[] {
  if (totalChapters < 3 || chaptersCompleted >= totalChapters) return [];
  const reached: CourseMilestone[] = [];
  if (chaptersCompleted === 1) reached.push("course_first_chapter");
  const half = Math.ceil(totalChapters / 2);
  if (totalChapters >= 4 && chaptersCompleted >= half && chaptersCompleted < totalChapters - 1) reached.push("course_halfway");
  if (chaptersCompleted === totalChapters - 1) reached.push("course_one_left");
  return reached;
}

/** Milestones the chapter just completed reached, each recorded once per course. */
async function courseMilestones(courseId: string, chaptersCompleted: number): Promise<Draft[]> {
  const totalChapters = await prisma.chapter.count({ where: { courseId } });
  return courseMilestonesFor(chaptersCompleted, totalChapters).map((type) => ({
    type,
    courseId,
    chapterId: null,
    payload: { chaptersCompleted, totalChapters },
    dedupeKey: `${type}:${courseId}`,
  }));
}

const chapterCompleted = (courseId: string, chapterId: string): Draft => ({
  type: "chapter_completed",
  courseId,
  chapterId,
  payload: {},
  dedupeKey: `chapter_completed:${chapterId}`,
});

const courseCompleted = (courseId: string): Draft => ({
  type: "course_completed",
  courseId,
  chapterId: null,
  payload: {},
  dedupeKey: `course_completed:${courseId}`,
});

/**
 * Checks one reported moment against the database, stores it, and returns it with what it caused:
 * the events it led to (a weekly goal met, a new level) and the XP it earned.
 */
export async function trackEngagementEvent(
  userId: string,
  body: TrackEventBody,
  now: Date = new Date()
): Promise<TrackEventResult> {
  const events = await recordReportedEvent(userId, body, now);
  return addGamification(userId, body.platform, events, now);
}

/** Reported moments that can move the weekly goal (chapters done, or a new study session). */
const MOVES_WEEKLY_GOAL = new Set<RecordedEngagementEvent["type"]>(["chapter_completed", "quiz_submitted", "session_start"]);

/** The XP keys a new moment paid out under (see shared/gamification/xp.ts xpKeys). */
function xpKeysFor(event: RecordedEngagementEvent): string[] {
  if (!event.isNew) return [];
  switch (event.type) {
    case "chapter_completed":
    case "quiz_submitted":
      return event.chapterId
        ? [xpKeys.chapter(event.chapterId), xpKeys.quizPassed(event.chapterId), xpKeys.quizPerfect(event.chapterId)]
        : [];
    case "course_completed":
      return event.courseId ? [xpKeys.course(event.courseId)] : [];
    default:
      return [];
  }
}

async function addGamification(
  userId: string,
  platform: EngagementPlatform,
  reported: RecordedEngagementEvent[],
  now: Date
): Promise<TrackEventResult> {
  const features = gamificationFeatures();
  const events = [...reported];
  const keys = new Set(reported.flatMap(xpKeysFor));
  const preferences = await prisma.user.findUnique({ where: { id: userId }, select: { gamificationHidden: true } });
  const hidden = preferences?.gamificationHidden ?? false;

  if (reported.some((event) => event.isNew && MOVES_WEEKLY_GOAL.has(event.type))) {
    const settled = await settleWeeklyGoal(userId, await loadLearnerHabit(userId, { now }), platform, now);
    if (settled) {
      const recorded = toRecorded(settled, true);
      // A learner who hides game elements still hears about the goal, just not the freeze.
      if (recorded.type === "weekly_goal_met" && (hidden || !features.streakFreezes)) recorded.payload = { freezeEarned: false };
      events.push(recorded);
      if (settled.dedupeKey?.startsWith("weekly_goal_met:")) {
        keys.add(xpKeys.weeklyGoal(settled.dedupeKey.slice("weekly_goal_met:".length)));
      } else if (settled.dedupeKey?.startsWith("daily_goal_met:")) {
        keys.add(xpKeys.dailyGoal(settled.dedupeKey.slice("daily_goal_met:".length)));
      }
    }
  }

  if (!features.xp || hidden) return { events };

  const [earned, user] = await Promise.all([
    keys.size === 0
      ? Promise.resolve(null)
      : prisma.xpEntry.aggregate({ where: { userId, sourceKey: { in: [...keys] } }, _sum: { amount: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { xpTotal: true } }),
  ]);

  // The first time the learner is seen at a level, celebrate it once, whatever earned the XP.
  const level = levelForXp(user?.xpTotal ?? 0);
  if (features.levels && level > 1) {
    const levelUp = await record(userId, platform, {
      type: "level_up",
      courseId: null,
      chapterId: null,
      payload: { level },
      dedupeKey: `level_up:${level}`,
    });
    if (levelUp.isNew) events.push(levelUp);
  }

  const xp = Math.max(0, earned?._sum.amount ?? 0);
  return xp > 0 ? { events, rewards: { xp } } : { events };
}

async function recordReportedEvent(userId: string, body: TrackEventBody, now: Date): Promise<RecordedEngagementEvent[]> {
  const save = (draft: Draft) => record(userId, body.platform, draft);
  const saveAll = async (drafts: Draft[]) => {
    const saved: RecordedEngagementEvent[] = [];
    for (const draft of drafts) saved.push(await save(draft));
    return saved;
  };

  switch (body.type) {
    case "session_start": {
      const daysAway = await daysAwayBefore(userId, now);
      const resume = daysAway !== null && daysAway >= LONG_AWAY_DAYS ? await resumePoint(userId) : null;
      return [
        await save({
          type: body.type,
          courseId: null,
          chapterId: null,
          payload: resume ? { daysAway, resume } : { daysAway },
          dedupeKey: null,
        }),
      ];
    }

    case "enrolled": {
      const courseId = body.courseId!;
      await requireEnrollment(userId, courseId);
      return [await save({ type: body.type, courseId, chapterId: null, payload: {}, dedupeKey: `enrolled:${courseId}` })];
    }

    case "course_completed": {
      const courseId = body.courseId!;
      const enrollment = await requireEnrollment(userId, courseId);
      if (enrollment.status !== "COMPLETED") throw notVerified("This course is not complete yet.");
      return [await save(courseCompleted(courseId))];
    }

    case "notes_saved": {
      const chapter = await requireChapter(body.chapterId!);
      await requireEnrollment(userId, chapter.courseId);
      return [await save({ type: body.type, courseId: chapter.courseId, chapterId: chapter.id, payload: {}, dedupeKey: null })];
    }

    case "chapter_completed": {
      const chapter = await requireChapter(body.chapterId!);
      const enrollment = await requireEnrollment(userId, chapter.courseId);
      if (!(await chapterIsComplete(enrollment.id, chapter.id))) throw notVerified("This chapter is not complete yet.");
      const completed = await save(chapterCompleted(chapter.courseId, chapter.id));
      const events = [completed];
      if (enrollment.status === "COMPLETED") events.push(await save(courseCompleted(chapter.courseId)));
      else if (completed.isNew) events.push(...(await saveAll(await courseMilestones(chapter.courseId, enrollment.chaptersCompleted))));
      return events;
    }

    case "chapter_lingering": {
      const chapter = await requireChapter(body.chapterId!);
      const enrollment = await requireEnrollment(userId, chapter.courseId);
      if (await chapterIsComplete(enrollment.id, chapter.id)) throw notVerified("This chapter is already complete.");
      return [
        await save({
          type: body.type,
          courseId: chapter.courseId,
          chapterId: chapter.id,
          payload: {},
          dedupeKey: `chapter_lingering:${chapter.id}:${dayKey(now)}`,
        }),
      ];
    }

    case "long_session": {
      const today = await prisma.appActivityDay.findUnique({
        where: { userId_date: { userId, date: utcDateOnly(now) } },
        select: { activeSeconds: true },
      });
      if ((today?.activeSeconds ?? 0) < LONG_SESSION_MIN_ACTIVE_SECONDS) throw notVerified("Not enough study time today.");
      return [
        await save({ type: body.type, courseId: null, chapterId: null, payload: {}, dedupeKey: `long_session:${dayKey(now)}` }),
      ];
    }

    case "quiz_submitted": {
      const chapter = await requireChapter(body.chapterId!);
      if (chapter.readerMode !== "QUIZ") throw notVerified("This chapter is not a quiz.");
      const enrollment = await requireEnrollment(userId, chapter.courseId);
      const facts = await latestQuizAttempt(prisma, userId, chapter.id);
      if (!facts) throw notVerified("No quiz submission was found for this chapter.");

      const events = [
        await save({
          type: body.type,
          courseId: chapter.courseId,
          chapterId: chapter.id,
          payload: facts,
          dedupeKey: `quiz_submitted:${chapter.id}:${facts.attempt}`,
        }),
      ];
      if (await chapterIsComplete(enrollment.id, chapter.id)) {
        const completed = await save(chapterCompleted(chapter.courseId, chapter.id));
        events.push(completed);
        if (completed.isNew && enrollment.status !== "COMPLETED") {
          events.push(...(await saveAll(await courseMilestones(chapter.courseId, enrollment.chaptersCompleted))));
        }
      }
      if (enrollment.status === "COMPLETED") events.push(await save(courseCompleted(chapter.courseId)));
      return events;
    }
  }
}
