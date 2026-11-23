import type { ResponseStatus, ReviewVerdict } from "../domain/enums.js";
import type { SanitizedCodeConfig } from "../blocks/code/schema.js";
import type { SanitizedOpenQuestionConfig } from "../blocks/open-question/schema.js";
import type { SanitizedPredictConfig } from "../blocks/predict/schema.js";
import type { SanitizedQuizConfig } from "../blocks/quiz/schema.js";
import type { OpenQuestionGroupPosition } from "../blocks/open-question/group-position.js";
import type { StepsConfig } from "../blocks/steps/schema.js";
import type { VideoConfig } from "../blocks/video/schema.js";
import type { ChapterRecapConfig } from "../blocks/chapter-recap/schema.js";
import type { LearningObjectivesConfig } from "../blocks/learning-objectives/schema.js";
import type { ProjectPreviewConfig } from "../blocks/project-preview/schema.js";
import type { RoadmapConfig } from "../blocks/roadmap/schema.js";
import type { VisualDiagramConfig } from "../blocks/visual-diagram/schema.js";
import type { VisualWalkthroughConfig } from "../blocks/visual-walkthrough/schema.js";
import type { SanitizedAiInterviewConfig } from "../blocks/ai-interview/schema.js";
import type { AiInterviewInitialState } from "./ai.js";
import type { SanitizedCapstoneCheckConfig } from "../blocks/capstone-check/schema.js";
import type { CapstoneCheckState } from "../blocks/capstone-check/report.js";

// Wire contract for GET /api/v1/blocks/:blockId/state: the client-safe config plus
// the caller's latest answer, shaped for each block's client component.

export type QuizBlockState = {
  type: "QUIZ";
  config: SanitizedQuizConfig;
  initialState: {
    selected: string[];
    isCorrect: boolean | null;
    score: number | null;
    maxScore: number | null;
    explanation?: string;
  } | null;
};

export type PredictBlockState = {
  type: "PREDICT";
  config: SanitizedPredictConfig;
  initialState: {
    selected: string;
    isCorrect: boolean | null;
    score: number | null;
    maxScore: number | null;
    explanation?: string;
  } | null;
};

export type CodeBlockState = {
  type: "CODE";
  config: SanitizedCodeConfig;
  initialState: { source: string; isCorrect: boolean | null } | null;
};

export type OpenQuestionBlockState = {
  type: "OPEN_QUESTION";
  config: SanitizedOpenQuestionConfig;
  group: { position: OpenQuestionGroupPosition; index: number; total: number };
  /**
   * BYOK readiness for LLM-graded shorts. Omitted / unused for mentor-reviewed
   * open questions. `configured` is false when the server cannot store keys.
   */
  ai?: { configured: boolean; hasKey: boolean };
  initialState: {
    status: ResponseStatus;
    attempt: number;
    text: string;
    url: string | null;
    feedback: string | null;
    verdict: ReviewVerdict | null;
    /** Present after an LLM grade attempt. */
    isCorrect?: boolean | null;
    explanation?: string | null;
    hint?: string | null;
    guidance?: string | null;
  } | null;
};

export type MustReadBlockState = {
  type: "MUST_READ";
  config: {
    title: string;
    url: string;
    description: string;
    source?: string;
    readMinutes?: number;
  };
  /** False for an optional read: it never gates the chapter, so the card says so. */
  required: boolean;
  initialRead: boolean;
};

export type AiInterviewBlockState = {
  type: "AI_INTERVIEW";
  config: SanitizedAiInterviewConfig;
  initialState: AiInterviewInitialState;
};

export type CapstoneCheckBlockState = {
  type: "CAPSTONE_CHECK";
  config: SanitizedCapstoneCheckConfig;
  /** Null for a signed-out reader. */
  initialState: CapstoneCheckState | null;
};

/** Presentation blocks carry no answer; the reader only needs their config. */
export type ContentBlockState =
  | { type: "STEPS"; config: StepsConfig }
  | { type: "VIDEO"; config: VideoConfig }
  | { type: "CHAPTER_RECAP"; config: ChapterRecapConfig }
  | { type: "LEARNING_OBJECTIVES"; config: LearningObjectivesConfig }
  | { type: "PROJECT_PREVIEW"; config: ProjectPreviewConfig }
  | { type: "ROADMAP"; config: RoadmapConfig }
  | { type: "VISUAL_DIAGRAM"; config: VisualDiagramConfig }
  | { type: "VISUAL_WALKTHROUGH"; config: VisualWalkthroughConfig };

export type BlockState =
  | QuizBlockState
  | PredictBlockState
  | CodeBlockState
  | OpenQuestionBlockState
  | MustReadBlockState
  | AiInterviewBlockState
  | CapstoneCheckBlockState
  | ContentBlockState;

/** Quiz-mode chapter: every question's last answer, for the wizard's initial state. */
export type QuizChapterState = {
  /** SECURE means the quiz opens only from a live Edorax desktop sitting. Absent on older servers. */
  integrityMode?: "STANDARD" | "SECURE";
  /** The course takes optional camera photos during this quiz. */
  integrityCamera?: boolean;
  /** Set when the camera is not offered. Says why, so it can be fixed. */
  integrityCameraReason?: string;
  /** Set only when there are no questions. Says why, from what this server holds. */
  emptyReason?: string;
  steps: Array<{
    id: string;
    type: "QUIZ" | "OPEN_QUESTION" | "PREDICT" | "CODE";
  }>;
  blockIds: string[];
  initialAnswers: Record<string, string[]>;
  initialBlockGrades: Record<string, { selected: string[]; isCorrect: boolean | null; explanation?: string; correctOptionIds?: string[] }>;
  initialScoreSummary: { score: number; maxScore: number; questions: number } | null;
  assessment: {
    score: number;
    maxScore: 100;
    passingScore: number;
    passed: boolean;
    allAttempted: boolean;
    deterministic: {
      score: number;
      weight: number;
      attempted: number;
      total: number;
    } | null;
    ai: {
      score: number;
      weight: number;
      attempted: number;
      total: number;
    } | null;
  } | null;
};
