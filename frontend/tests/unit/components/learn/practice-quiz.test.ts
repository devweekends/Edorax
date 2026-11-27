import { describe, expect, it } from "vitest";
import {
  RECENT_PROMPTS_MAX,
  allQuestionsAnswered,
  friendlyPracticeQuizError,
  mergeRecentPrompts,
  practiceFocusChips,
  toggleOptionSelection,
} from "@/lib/practice-quiz";

describe("toggleOptionSelection", () => {
  it("replaces selection for single and true-false questions", () => {
    expect(toggleOptionSelection(["a"], "b", "single")).toEqual(["b"]);
    expect(toggleOptionSelection(["a"], "b", "true-false")).toEqual(["b"]);
  });

  it("toggles options in and out for multiple-choice questions", () => {
    expect(toggleOptionSelection(["a"], "b", "multiple")).toEqual(["a", "b"]);
    expect(toggleOptionSelection(["a", "b"], "a", "multiple")).toEqual(["b"]);
  });
});

describe("allQuestionsAnswered", () => {
  const questions = [
    { id: "pq1", quizType: "single" as const, prompt: "Q1", options: [] },
    { id: "pq2", quizType: "multiple" as const, prompt: "Q2", options: [] },
  ];

  it("returns true only when every question has at least one option selected", () => {
    expect(allQuestionsAnswered([], {})).toBe(false);
    expect(allQuestionsAnswered(questions, { pq1: ["a"] })).toBe(false);
    expect(allQuestionsAnswered(questions, { pq1: ["a"], pq2: [] })).toBe(false);
    expect(allQuestionsAnswered(questions, { pq1: ["a"], pq2: ["b", "c"] })).toBe(true);
  });
});

describe("mergeRecentPrompts", () => {
  it("deduplicates and bounds recent prompts to RECENT_PROMPTS_MAX", () => {
    const existing = Array.from({ length: RECENT_PROMPTS_MAX }, (_, i) => `Prompt ${i}`);
    const merged = mergeRecentPrompts(existing, [{ prompt: "Prompt 2" }, { prompt: "New prompt" }]);
    expect(merged).toHaveLength(RECENT_PROMPTS_MAX);
    expect(merged[merged.length - 1]).toBe("New prompt");
    expect(merged[0]).toBe("Prompt 1");
  });
});

describe("practiceFocusChips", () => {
  it("picks up to 3 useful headings and skips generic recap sections", () => {
    const chips = practiceFocusChips([
      { text: "Summary" },
      { text: "Idempotency keys:" },
      { text: "Retry backoff" },
      { text: "Dead-letter queues" },
      { text: "Extra heading" },
    ]);
    expect(chips).toEqual(["Idempotency keys", "Retry backoff", "Dead-letter queues"]);
  });
});

describe("friendlyPracticeQuizError", () => {
  it("maps known codes and falls back safely for unexpected errors", () => {
    expect(friendlyPracticeQuizError({ status: 422, code: "PRACTICE_QUIZ_REFUSED", message: "Refused" })).toBe("Refused");
    expect(friendlyPracticeQuizError({ status: 400, code: "PRACTICE_QUIZ_EXPIRED", message: "Expired" })).toBe("Expired");
    expect(friendlyPracticeQuizError({ status: 503, code: "QA_PAUSED" })).toMatch(/paused for today/);
    expect(friendlyPracticeQuizError({ status: 401 })).toMatch(/Sign in again/);
    expect(friendlyPracticeQuizError({ status: 500, message: "secret trace" })).toBe(
      "We could not generate a practice quiz just now. Please try again in a moment."
    );
  });
});
