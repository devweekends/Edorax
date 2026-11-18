// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// XP rewards real learning, never just showing up. Amounts are data: change a number here and every
// client shows the same thing. The server is the only place XP is awarded (inside the transaction
// that changed the learner's progress), and each award has a key, so it can happen once.

export const XP_SOURCES = [
  "chapter_completed",
  "light_chapter_completed",
  "quiz_passed",
  "quiz_perfect",
  "answer_approved",
  "course_completed",
  "weekly_goal_met",
  "daily_goal_met",
  "game_round",
  "game_set",
] as const;
export type XpSource = (typeof XP_SOURCES)[number];

export const XP_AMOUNTS = {
  /** A chapter with checkpoints (quizzes, answers, code, must-reads) completed. */
  chapter_completed: 20,
  /** A chapter with no checkpoints, finished with "Mark chapter complete": easy to farm, so less. */
  light_chapter_completed: 10,
  /** A quiz chapter passed on the first try; later tries earn less (see quizPassedXp). */
  quiz_passed: 15,
  /** Every quiz question right. */
  quiz_perfect: 5,
  /** A mentor approved an open answer. */
  answer_approved: 15,
  course_completed: 100,
  weekly_goal_met: 25,
  /** Brand daily-goal reward; no streak freeze (freezes stay on the weekly goal). */
  daily_goal_met: 10,
  /** A daily game round solved for the first time that day. Small on purpose: nine rounds a day. */
  game_round: 3,
  /** All three rounds of one daily game solved in the same day. */
  game_set: 2,
} as const satisfies Record<XpSource, number>;

/** XP for passing a quiz chapter on a given try. Retakes after passing earn nothing (one key per chapter). */
export function quizPassedXp(attempt: number): number {
  if (attempt <= 1) return XP_AMOUNTS.quiz_passed;
  if (attempt === 2) return 10;
  return 5;
}

/**
 * Most awards a source may make in one of the learner's days. Only sources a learner could repeat
 * quickly need a cap; the rest are bounded by the course itself.
 */
export const XP_DAILY_CAPS: Partial<Record<XpSource, number>> = {
  light_chapter_completed: 5,
  // 3 games x 3 rounds. The key already makes each round once-a-day; this bounds a bug or a bad client.
  game_round: 9,
  game_set: 3,
};

/** Award keys: one per moment, so retries, two tabs or a progress recompute award once. */
export const xpKeys = {
  chapter: (chapterId: string) => `chapter:${chapterId}`,
  quizPassed: (chapterId: string) => `quiz:${chapterId}`,
  quizPerfect: (chapterId: string) => `quiz_perfect:${chapterId}`,
  answerApproved: (blockId: string) => `answer:${blockId}`,
  course: (courseId: string) => `course:${courseId}`,
  weeklyGoal: (weekStartDayKey: string) => `weekly_goal:${weekStartDayKey}`,
  dailyGoal: (dayKey: string) => `daily_goal:${dayKey}`,
  gameRound: (dayKey: string, game: string, roundIndex: number) => `game_round:${dayKey}:${game}:${roundIndex}`,
  gameSet: (dayKey: string, game: string) => `game_set:${dayKey}:${game}`,
};
