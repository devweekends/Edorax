// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { RecordedEngagementEvent } from "../api/engagement";
import type { DotClip } from "./dot-voice";
import MESSAGES from "./mascot-messages.en.json" with { type: "json" };
import type { MascotRole, MascotState } from "./mascots";

// Which moment earns which reaction. Rules are data: the engine picks the highest-priority rule
// that matches any event in a batch, then applies cooldowns. The words the mascot says live in
// mascot-messages.en.json, keyed by rule id, so wording changes never touch this logic.
// Message rules:
//   - Celebrate effort, never count failures or time away ("You're back!", not "5 days").
//   - One short line per rule, in Dot's voice: a few words, said the same way each time.
//   - A rule with a `clip` says exactly that clip's words (dot-voice.ts), so text and voice match.
//   - Lines never name a course, so they fit every course and their recorded voice clips do too.
//   - Reactions the learner did not just cause are `ambient` and wait for a page where they are not
//     reading, so nothing interrupts a chapter.
//   - Help is offered, never imposed: a reaction can carry one action, and the learner may ignore it.

/** One optional next step shown as a button in the bubble. */
export type MascotAction =
  | { label: string; href: string }
  /** Opens the "ask a mentor" dialog of the chapter the learner is reading. */
  | { label: string; intent: "ask-help" };

export type EngagementRule = {
  id: string;
  /** Higher wins when one action produces several events (a quiz that also finishes the course). */
  priority: number;
  role: MascotRole;
  state: MascotState;
  /** Casts this mascot for this rule only, ahead of the area and role maps (see resolveMascot). */
  mascot?: string;
  messages: readonly [string, ...string[]];
  /** Dot's recorded clip of this rule's line; its words must equal the line. Omit to stay silent. */
  clip?: DotClip;
  /** Minimum time between two reactions from this rule. */
  cooldownMs?: number;
  /** Not caused by an action the learner just took; held back while they read. */
  ambient?: boolean;
  matches: (event: RecordedEngagementEvent) => boolean;
  /** The bubble's button for the event that matched, if this moment has a next step. */
  action?: (event: RecordedEngagementEvent) => MascotAction | null;
};

export type MessageId = keyof typeof MESSAGES;

/** A rule's lines from mascot-messages.en.json. A misspelled id fails to compile. */
function lines(id: MessageId): readonly [string, ...string[]] {
  const messages = MESSAGES[id];
  if (!messages[0]) throw new Error(`mascot-messages.en.json has no lines for "${id}"`);
  return messages as [string, ...string[]];
}

/** The notification's own page, when it has one. */
function openMessage(event: RecordedEngagementEvent): MascotAction | null {
  return event.type === "message_received" && event.payload.url ? { label: "Open", href: event.payload.url } : null;
}

const MINUTE_MS = 60_000;
/** Days away before a visit counts as a return. */
export const WELCOME_BACK_AFTER_DAYS = 3;
/** Days away before a return also offers the chapter to pick up again. */
export const LONG_AWAY_DAYS = 14;

export const ENGAGEMENT_RULES: readonly EngagementRule[] = [
  {
    id: "course-graduation",
    priority: 100,
    role: "celebrator",
    state: "graduation",
    messages: lines("course-graduation"),
    clip: "you-did-it",
    matches: (event) => event.type === "course_completed",
  },
  {
    id: "quiz-passed-after-retry",
    priority: 80,
    role: "celebrator",
    state: "proud",
    messages: lines("quiz-passed-after-retry"),
    clip: "got-it",
    matches: (event) => event.type === "quiz_submitted" && event.payload.passed && event.payload.attempt > 1,
  },
  {
    id: "quiz-perfect",
    priority: 80,
    role: "celebrator",
    state: "perfect",
    messages: lines("quiz-perfect"),
    clip: "you-passed",
    matches: (event) => event.type === "quiz_submitted" && event.payload.passed && event.payload.score === 100,
  },
  {
    id: "course-one-left",
    priority: 78,
    role: "celebrator",
    state: "almost",
    messages: lines("course-one-left"),
    clip: "lesson-done",
    matches: (event) => event.type === "course_one_left",
  },
  {
    id: "course-halfway",
    priority: 77,
    role: "celebrator",
    state: "halfway",
    messages: lines("course-halfway"),
    clip: "lesson-done",
    matches: (event) => event.type === "course_halfway",
  },
  {
    id: "course-first-chapter",
    priority: 76,
    role: "guide",
    state: "first_step",
    messages: lines("course-first-chapter"),
    clip: "lesson-done",
    matches: (event) => event.type === "course_first_chapter",
  },
  {
    id: "chapter-completed",
    priority: 70,
    role: "celebrator",
    state: "celebrate",
    messages: lines("chapter-completed"),
    clip: "lesson-done",
    matches: (event) => event.type === "chapter_completed",
  },
  {
    id: "enrolled",
    priority: 70,
    role: "guide",
    state: "begin",
    messages: lines("enrolled"),
    matches: (event) => event.type === "enrolled",
  },
  {
    id: "quiz-first-miss",
    priority: 60,
    role: "helper",
    state: "retry",
    messages: lines("quiz-first-miss"),
    clip: "not-quite",
    matches: (event) => event.type === "quiz_submitted" && !event.payload.passed && event.payload.attempt === 1,
  },
  {
    id: "quiz-repeat-miss",
    priority: 60,
    role: "helper",
    state: "help",
    messages: lines("quiz-repeat-miss"),
    clip: "look-again",
    matches: (event) => event.type === "quiz_submitted" && !event.payload.passed && event.payload.attempt >= 2,
  },
  {
    id: "chapter-lingering",
    priority: 50,
    role: "helper",
    state: "stuck",
    messages: lines("chapter-lingering"),
    clip: "need-a-hint",
    matches: (event) => event.type === "chapter_lingering",
    action: () => ({ label: "Ask a mentor", intent: "ask-help" }),
  },
  {
    id: "career-tier-up",
    priority: 95,
    role: "celebrator",
    state: "graduation",
    messages: lines("career-tier-up"),
    matches: (event) => event.type === "career_tier_up",
    action: () => ({ label: "See your path", href: "/profile" }),
  },
  {
    id: "level-up",
    priority: 90,
    role: "celebrator",
    state: "level_up",
    messages: lines("level-up"),
    matches: (event) => event.type === "level_up",
  },
  {
    id: "weekly-goal-met-with-freeze",
    priority: 75,
    role: "celebrator",
    state: "goal",
    messages: lines("weekly-goal-met-with-freeze"),
    matches: (event) => event.type === "weekly_goal_met" && event.payload.freezeEarned,
  },
  {
    id: "weekly-goal-met",
    priority: 74,
    role: "celebrator",
    state: "goal",
    messages: lines("weekly-goal-met"),
    matches: (event) => event.type === "weekly_goal_met" && !event.payload.freezeEarned,
  },
  {
    id: "daily-goal-met",
    priority: 73,
    role: "celebrator",
    state: "goal",
    messages: lines("daily-goal-met"),
    matches: (event) => event.type === "daily_goal_met",
  },
  {
    id: "message-approved",
    priority: 65,
    role: "messenger",
    state: "message_good",
    messages: lines("message-approved"),
    matches: (event) => event.type === "message_received" && event.payload.kind === "approved",
    action: openMessage,
  },
  {
    id: "message-reply",
    priority: 65,
    role: "messenger",
    state: "message",
    messages: lines("message-reply"),
    matches: (event) => event.type === "message_received" && event.payload.kind === "reply",
    action: openMessage,
  },
  {
    id: "message-feedback",
    priority: 65,
    role: "messenger",
    state: "message_feedback",
    messages: lines("message-feedback"),
    matches: (event) => event.type === "message_received" && event.payload.kind === "feedback",
    action: openMessage,
  },
  {
    id: "message-resolved",
    priority: 65,
    role: "messenger",
    state: "message_done",
    messages: lines("message-resolved"),
    matches: (event) => event.type === "message_received" && event.payload.kind === "resolved",
    action: openMessage,
  },
  {
    id: "welcome-back-long",
    priority: 31,
    role: "guide",
    state: "reunion",
    messages: lines("welcome-back-long"),
    clip: "missed-you",
    ambient: true,
    matches: (event) =>
      event.type === "session_start" && event.payload.daysAway !== null && event.payload.daysAway >= LONG_AWAY_DAYS,
    action: (event) =>
      event.type === "session_start" && event.payload.resume ? { label: "Continue", href: event.payload.resume.href } : null,
  },
  {
    id: "welcome-back",
    priority: 30,
    role: "guide",
    state: "welcome_back",
    messages: lines("welcome-back"),
    clip: "missed-you",
    ambient: true,
    matches: (event) =>
      event.type === "session_start" &&
      event.payload.daysAway !== null &&
      event.payload.daysAway >= WELCOME_BACK_AFTER_DAYS,
  },
  {
    id: "first-visit",
    priority: 29,
    role: "guide",
    state: "begin",
    messages: lines("first-visit"),
    clip: "welcome",
    ambient: true,
    // No earlier activity or event at all: the learner's first time in the app.
    matches: (event) => event.type === "session_start" && event.payload.daysAway === null,
  },
  {
    id: "long-session",
    priority: 25,
    role: "supporter",
    state: "rest",
    messages: lines("long-session"),
    matches: (event) => event.type === "long_session",
  },
  {
    id: "notes-saved",
    priority: 20,
    role: "supporter",
    state: "encourage",
    messages: lines("notes-saved"),
    cooldownMs: 10 * MINUTE_MS,
    matches: (event) => event.type === "notes_saved",
  },
];

/** Every rule that matches a new event, highest priority first. Already-recorded events earn nothing. */
export function matchingRules(
  events: readonly RecordedEngagementEvent[],
  rules: readonly EngagementRule[] = ENGAGEMENT_RULES
): EngagementRule[] {
  const fresh = events.filter((event) => event.isNew);
  return rules.filter((rule) => fresh.some((event) => rule.matches(event))).sort((a, b) => b.priority - a.priority);
}
