import type { PracticeQuizQuestion } from "@/shared/api/chapters";

export const PRACTICE_QUIZ_COUNT = 3;
export const PRACTICE_FOCUS_MAX = 300;
export const RECENT_PROMPTS_MAX = 15;

const SKIPPED_HEADINGS = /^(summary|recap|key takeaways?|next steps?|references?|further reading|checklist)$/i;
const HEADING_MAX = 60;

/** Toggle an option inside a practice question, enforcing single vs multi-select behavior. */
export function toggleOptionSelection(
  current: readonly string[],
  optionId: string,
  quizType: PracticeQuizQuestion["quizType"]
): string[] {
  if (quizType === "multiple") {
    return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  }
  return [optionId];
}

/** True when every question in the current batch has at least one selected option. */
export function allQuestionsAnswered(
  questions: readonly PracticeQuizQuestion[],
  selections: Record<string, string[]>
): boolean {
  return questions.length > 0 && questions.every((q) => (selections[q.id]?.length ?? 0) > 0);
}

/** Keeps the newest unique prompts up to RECENT_PROMPTS_MAX so follow-up generations avoid repeats. */
export function mergeRecentPrompts(
  existing: readonly string[],
  generated: readonly Pick<PracticeQuizQuestion, "prompt">[]
): string[] {
  const merged = [...existing];
  for (const item of generated) {
    const clean = item.prompt.trim().slice(0, PRACTICE_FOCUS_MAX);
    if (clean && !merged.includes(clean)) merged.push(clean);
  }
  return merged.slice(-RECENT_PROMPTS_MAX);
}

/** Up to three short focus chips derived from the chapter's headings. */
export function practiceFocusChips(headings: readonly { text: string }[]): string[] {
  const chips: string[] = [];
  for (const { text } of headings) {
    const heading = text.replace(/[:.]+$/, "").trim();
    if (!heading || heading.length > HEADING_MAX || SKIPPED_HEADINGS.test(heading)) continue;
    if (!chips.includes(heading)) chips.push(heading);
    if (chips.length === 3) break;
  }
  return chips;
}

const GENERIC_QUIZ_FAILURE = "We could not generate a practice quiz just now. Please try again in a moment.";

/** Maps API errors to safe, learner-friendly messages. */
export function friendlyPracticeQuizError(error: unknown): string {
  const { status, code, message } = (error ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof status !== "number") return GENERIC_QUIZ_FAILURE;
  if (code === "QA_PAUSED") return "Practice quizzes are paused for today. Please try again tomorrow.";
  if (code === "QA_UNAVAILABLE") return "Practice quizzes are not available right now.";
  if (code === "PRACTICE_QUIZ_REFUSED" && typeof message === "string") return message;
  if (code === "PRACTICE_QUIZ_EXPIRED" && typeof message === "string") return message;
  if (status === 429 && typeof message === "string") return message;
  if (status === 403 && code === "CHAPTER_LOCKED" && typeof message === "string") return message;
  if (status === 401) return "Sign in again to generate a practice quiz.";
  if (status === 400) return "Could not check that quiz. Please try generating a fresh set.";
  return GENERIC_QUIZ_FAILURE;
}
