// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Wire contract for learner chapter actions under /api/v1/chapters/:chapterId.

export type LearningLogSaveResult = { savedAt: string };

/** One question the learner answered in an earlier chapter, with the answer they submitted. */
export type EarlierAnswer = {
  /** Learning-log question id or open-question block id. */
  id: string;
  kind: "learning_log" | "open_question";
  question: string;
  answer: string;
  /** ISO time of the last save. */
  answeredAt: string;
};

export type EarlierAnswersChapter = {
  chapterId: string;
  chapterSlug: string;
  chapterTitle: string;
  answers: EarlierAnswer[];
};

/** Everything the learner already answered before the current chapter, oldest chapter first. */
export type EarlierAnswersResponse = { chapters: EarlierAnswersChapter[] };

export const CHAPTER_ERROR_CODES = {
  CHAPTER_LOCKED: "CHAPTER_LOCKED",
  CHECKPOINTS_INCOMPLETE: "CHECKPOINTS_INCOMPLETE",
  REFLECTION_INCOMPLETE: "REFLECTION_INCOMPLETE",
} as const;

export type PracticeQuizOption = {
  id: string;
  label: string;
};

export type PracticeQuizQuestion = {
  id: string;
  quizType: "single" | "multiple" | "true-false";
  prompt: string;
  options: PracticeQuizOption[];
};

export type PracticeQuizGenerateResponse = {
  questions: PracticeQuizQuestion[];
  answerToken: string;
  remaining: number;
  dailyLimit: number;
};

export type PracticeQuizCheckItemResult = {
  id: string;
  selected: string[];
  isCorrect: boolean;
  correctOptionIds: string[];
  explanation: string;
};

export type PracticeQuizCheckResponse = {
  score: number;
  maxScore: number;
  results: PracticeQuizCheckItemResult[];
};

