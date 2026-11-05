// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { ChapterReaderMode } from "../domain/enums";
import type { CourseTrack } from "../lib/course-tracks";
import type { StreakMilestone } from "../lib/streak";
import type { HelpThreadView } from "./help";
import type { SyllabusModule } from "./syllabus";

// Wire contract for GET /api/v1/courses/:courseSlug/chapters/:chapterSlug — everything the
// chapter reader needs apart from rendering the MDX itself.

export type ReaderChapterLink = { slug: string; title: string; moduleOrder: number; order: number };

export type ReaderHighlight = {
  id: string;
  color: "YELLOW" | "GREEN" | "BLUE" | "PINK";
  quote: string;
  prefix: string | null;
  suffix: string | null;
  occurrence: number;
  note: string | null;
};

export type ChapterReaderContent = {
  /** Raw MDX (compiled when available). The web app renders it. */
  source: string;
  learningLogAnswers: Record<string, string>;
  checklistState: Record<string, boolean>;
  chapterComplete: boolean;
  canMarkComplete: boolean;
  checkpointsCompleted: number;
  checkpointsTotal: number;
  nextLocked: boolean;
  reflectionPending: boolean;
  recap: { checks: string; open: string; next: string };
  streakMilestone: StreakMilestone | null;
  headingNotes: Record<string, string>;
  highlights: ReaderHighlight[];
  predictGate: boolean;
  predictRevealed: boolean;
  helpThread: HelpThreadView | null;
  /** True when the learner finished more than half of the course, moved on, and has neither rated nor dismissed the prompt. */
  promptCourseRating?: boolean;
};

export type ChapterReaderView = {
  course: { id: string; slug: string; title: string; projectGoal: string | null };
  chapter: {
    id: string;
    slug: string;
    title: string;
    lessonLabel: string;
    estimatedMinutes: number | null;
    readerMode: ChapterReaderMode;
    isMilestone: boolean;
    blockCount: number;
  };
  prev: ReaderChapterLink | null;
  next: ReaderChapterLink | null;
  modules: SyllabusModule[];
  /** The learner's variant (for the reader theme); null for a course without a family. */
  track: CourseTrack | null;
  /** Sequential course and the previous chapter is not finished yet. */
  locked: boolean;
  /** The chapter to finish first when locked. */
  previous: { slug: string; title: string } | null;
  /** Null while locked. */
  content: ChapterReaderContent | null;
};
