// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { CareerTier } from "./gamification";

// Wire contract for engagement events (POST /api/v1/events): the learning moments the app reacts
// to, mascot reactions today. The client only names what happened and where; the server checks it
// against the database and fills in the facts (quiz attempt and score, days away, first time), so
// a reaction is never based on numbers the browser made up.
//
// A "chapter" is the unit a learner completes (a Module only groups chapters), and a quiz is a
// chapter in quiz mode, so quiz events carry the chapter id.

export const ENGAGEMENT_EVENT_TYPES = [
  "session_start",
  "enrolled",
  "chapter_completed",
  "notes_saved",
  "quiz_submitted",
  "course_completed",
  /** The learner has spent a long while on a chapter they have not finished. */
  "chapter_lingering",
  /** A long stretch of continuous study, reported at a natural pause. */
  "long_session",
] as const;
export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

/**
 * Moments only the server records, never a client: they come back alongside a reported event
 * (a chapter that crossed a level, a weekly goal the learner just met).
 */
export const ENGAGEMENT_SERVER_EVENT_TYPES = [
  "level_up",
  "weekly_goal_met",
  "daily_goal_met",
  "course_first_chapter",
  "course_halfway",
  "course_one_left",
  /** The learner reached a new career tier (shared/gamification/career.ts) for the first time. */
  "career_tier_up",
] as const;
export type EngagementServerEventType = (typeof ENGAGEMENT_SERVER_EVENT_TYPES)[number];

/**
 * Moments a client builds itself from data the server already sent it (a live notification), so
 * they are never reported or stored; they only run through the same rules.
 */
export const ENGAGEMENT_LOCAL_EVENT_TYPES = ["message_received"] as const;
export type EngagementLocalEventType = (typeof ENGAGEMENT_LOCAL_EVENT_TYPES)[number];

export const ENGAGEMENT_PLATFORMS = ["web", "ios", "android"] as const;
export type EngagementPlatform = (typeof ENGAGEMENT_PLATFORMS)[number];

/** Which id each event type must name. */
export const ENGAGEMENT_EVENT_TARGET: Record<EngagementEventType, "course" | "chapter" | null> = {
  session_start: null,
  enrolled: "course",
  chapter_completed: "chapter",
  notes_saved: "chapter",
  quiz_submitted: "chapter",
  course_completed: "course",
  chapter_lingering: "chapter",
  long_session: null,
};

export const ENGAGEMENT_ERROR_CODES = {
  /** The database does not show the moment the client reported (e.g. a chapter that is not complete). */
  NOT_VERIFIED: "ENGAGEMENT_EVENT_NOT_VERIFIED",
} as const;

export type TrackEventRequest = {
  type: EngagementEventType;
  courseId?: string;
  chapterId?: string;
  platform?: EngagementPlatform;
};

export type QuizSubmittedFacts = {
  /** Every question satisfied, the same rule that completes the chapter. */
  passed: boolean;
  /** How many times this quiz chapter has been submitted, counting this one. */
  attempt: number;
  /** 0–100. */
  score: number;
};

export type LevelUpFacts = { level: number };

export type CareerTierUpFacts = { tier: CareerTier };

export type WeeklyGoalMetFacts = {
  /** A streak freeze came with it (the learner had room for one and freezes are on). */
  freezeEarned: boolean;
  period?: "DAILY" | "WEEKLY";
};

export type DailyGoalMetFacts = {
  freezeEarned: false;
  period: "DAILY";
};

export type SessionStartFacts = {
  /** Whole days since the learner was last seen before this visit; null for a first visit. */
  daysAway: number | null;
  /** After a long time away, the chapter to pick up again (see LONG_AWAY_DAYS). */
  resume?: { href: string; chapterTitle: string } | null;
};

/** Where the learner stands in the course after the chapter that caused a course milestone. */
export type CourseMilestoneFacts = { chaptersCompleted: number; totalChapters: number };

/** What a live notification told the learner, for the messenger mascot. */
export type MessageReceivedFacts = {
  kind: "reply" | "approved" | "feedback" | "resolved";
  /** App-relative link the notification opens. */
  url: string | null;
};

type RecordedBase = {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  /** False when this moment was already recorded (a retry, or a second report of a once-only event). */
  isNew: boolean;
  createdAt: string;
};

export type RecordedEngagementEvent = RecordedBase &
  (
    | { type: "session_start"; payload: SessionStartFacts }
    | { type: "quiz_submitted"; payload: QuizSubmittedFacts }
    | { type: "level_up"; payload: LevelUpFacts }
    | { type: "career_tier_up"; payload: CareerTierUpFacts }
    | { type: "weekly_goal_met"; payload: WeeklyGoalMetFacts }
    | { type: "daily_goal_met"; payload: DailyGoalMetFacts }
    | { type: "course_first_chapter" | "course_halfway" | "course_one_left"; payload: CourseMilestoneFacts }
    | { type: "message_received"; payload: MessageReceivedFacts }
    | {
        type: "enrolled" | "chapter_completed" | "notes_saved" | "course_completed" | "chapter_lingering" | "long_session";
        payload: Record<string, never>;
      }
  );

/**
 * The reported event followed by any it caused, in the order they happened: a quiz submission that
 * finished the chapter, and with it the course, returns all three.
 */
export type TrackEventResult = {
  events: RecordedEngagementEvent[];
  /** XP this moment earned, when XP is on and the learner shows game elements. */
  rewards?: { xp: number };
};
