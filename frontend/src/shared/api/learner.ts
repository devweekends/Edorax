// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { EnrollStatus, HelpThreadStatus, ProgressStatus, BlockType } from "../domain/enums";
import type { InstructorAccessView } from "../lib/instructor-access";
import type { LearnerHabit, StreakMilestone } from "../lib/streak";
import type { GamificationSummary } from "./gamification";

// Wire contract for /api/v1/learner. Dates travel as ISO strings.

export type { LearnerHabit, StreakMilestone, InstructorAccessView };

/** Counts the learner workspace shell shows in its sidebar. */
export type LearnerWorkspace = {
  instructorAccess: InstructorAccessView;
  assignedCourses: number;
  pendingReviews: number;
  openHelpRequests: number;
};

export type DashboardDay = { day: string; seconds: number };

export type DashboardAction = {
  id: string;
  kind: "REVISION" | "CONTINUE" | "HELP" | "START" | "FEEDBACK" | "PENDING_REVIEW" | "REVIEW";
  title: string;
  context: string;
  reason: string;
  statusLabel: string;
  href: string;
  occurredAt: string | null;
  unread?: boolean;
};

export type DashboardCourse = {
  /** The enrollment id. */
  id: string;
  courseId: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  enrollmentStatus: EnrollStatus;
  state:
    | "PAYMENT_REQUIRED"
    | "NOT_STARTED"
    | "IN_PROGRESS"
    | "NEEDS_REVISION"
    | "AWAITING_REVIEW"
    | "COMPLETED"
    | "DROPPED";
  percentComplete: number;
  chaptersCompleted: number;
  chaptersTotal: number;
  pendingReviews: number;
  totalScore: number;
  maxScore: number;
  totalStudySeconds: number;
  lastActiveAt: string | null;
  currentModule: string | null;
  /** XP earned in this course; null when XP is off or the learner hides game elements. */
  xp: number | null;
  /** "Stage 2 of 5": the module holding the next chapter, counted among modules with chapters. Null when levels are off. */
  stage: { current: number; total: number; title: string } | null;
  targetChapter: { title: string; slug: string; status: ProgressStatus; blocksCompleted: number; blocksTotal: number } | null;
  href: string;
  overviewHref: string;
  actionLabel: string;
  actionReason: string;
  priority: number;
};

export type DashboardEvent = {
  id: string;
  type: "CHAPTER_STARTED" | "CHAPTER_COMPLETED" | "SUBMISSION" | "REVIEW" | "REVISION" | "HELP_CREATED" | "HELP_RESOLVED" | "STUDY_SESSION";
  title: string;
  context: string;
  occurredAt: string;
  href: string;
};

export type MenteeDashboardViewModel = {
  learner: { name: string };
  primaryCourse: DashboardCourse | null;
  actions: DashboardAction[];
  courses: DashboardCourse[];
  overview: {
    assignedCourses: number;
    inProgressCourses: number;
    completedCourses: number;
    chaptersCompleted: number;
    chaptersTotal: number;
    todaySeconds: number;
    weekSeconds: number;
    totalSeconds: number;
    pendingReviews: number;
    openHelpRequests: number;
  };
  activity: {
    week: DashboardDay[];
    activeDays: number;
    maxDaySeconds: number;
    lastActiveAt: string | null;
    recentChapter: { title: string; courseTitle: string; href: string } | null;
    runningSession: { chapterTitle: string; courseTitle: string; href: string; startedAt: string } | null;
  };
  latestFeedback: DashboardAction | null;
  help: {
    openCount: number;
    latest: { title: string; courseTitle: string; status: HelpThreadStatus; href: string; updatedAt: string } | null;
  };
  recentEvents: DashboardEvent[];
  habit: LearnerHabit;
  gamification: GamificationSummary;
};

export type LearnerProgressModule = {
  id: string;
  order: number;
  title: string;
  completed: number;
  total: number;
  score: number;
  maxScore: number;
};

export type LearnerProgressCourse = {
  course: { id: string; slug: string; title: string };
  percentComplete: number;
  chaptersCompleted: number;
  totalChapters: number;
  totalScore: number;
  maxScore: number;
  pendingReviews: number;
  lastActiveAt: string | null;
  activeDays: number;
  weekSeconds: number;
  totalStudySeconds: number;
  dailyActivity: DashboardDay[];
  continueHref: string | null;
  modules: LearnerProgressModule[];
};

/** A scored checkpoint that counted on a wrong answer because retry was off. */
export type ClosedWrongCheckpoint = {
  blockId: string;
  type: BlockType;
  chapter: { slug: string; title: string };
  course: { slug: string; title: string };
};

export type LearnerProgressView = {
  courses: LearnerProgressCourse[];
  closedWrong: ClosedWrongCheckpoint[];
  overall: {
    chaptersCompleted: number;
    totalChapters: number;
    score: number;
    maxScore: number;
    weekSeconds: number;
    pendingReviews: number;
    /** Aggregated daily study seconds for the selected calendar year (for the activity grid). */
    yearActivity: DashboardDay[];
    /** The calendar year the grid is showing. */
    year: number;
    /** Years that have any recorded activity (for the year switcher). */
    activityYears: number[];
  };
};

export type WeeklyGoalInput = {
  period?: "DAILY" | "WEEKLY";
  kind: "SESSIONS" | "CHAPTERS" | "MINUTES";
  target: number;
  note?: string;
  dailyReminder?: boolean;
};

export type LearnerProfile = {
  name: string | null;
  email: string;
  image: string | null;
  timezone: string;
  skills: string[];
  /** Most recently active course, used as the settings page cover. */
  featuredCourse: { title: string; coverUrl: string | null } | null;
};

export type ProfileUpdateInput = { name: string; timezone: string; skills: string[] };

/** GET /api/v1/learner/streak-popup — once-per-local-day streak celebration. */
export type StreakPopupDayView = {
  day: string;
  weekday: string;
  status: "completed" | "missed" | "today";
  seconds: number;
};

export type StreakPopupView = {
  show: boolean;
  streakCount: number;
  todayActive: boolean;
  today: string;
  week: StreakPopupDayView[];
  seenOn: string | null;
};

export const INSTRUCTOR_ACCESS_ERROR_CODES = {
  ALREADY_INSTRUCTOR: "ALREADY_INSTRUCTOR",
  REQUEST_PENDING: "REQUEST_PENDING",
} as const;
