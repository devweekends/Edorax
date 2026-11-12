export type HomeStage = { current: number; total: number; title: string };

export type HomeCourse = {
  courseId: string;
  slug: string;
  title: string;
  state: string;
  percentComplete: number;
  chaptersCompleted: number;
  chaptersTotal: number;
  pendingReviews: number;
  /** Title of the chapter the learner should pick up next. */
  targetChapter: string | null;
  stage: HomeStage | null;
  /** XP earned in this course; null when game elements are off. */
  xp: number | null;
  totalStudySeconds: number;
  lastActiveAt: string | null;
  currentModule: string | null;
};

export type HomeCareer = {
  title: string;
  tierIndex: number;
  totalTiers: number;
  nextTitle: string | null;
  completedCourses: number;
  avgScore: number;
  requiredForNext: { courses: number; minScore: number } | null;
};

export type HomeEvent = { id: string; title: string; context: string; occurredAt: string; type: string };

export type HomeAction = { id: string; title: string; context: string; statusLabel: string; kind: string; href: string | null };

export type HomeGoal = {
  period: 'DAILY' | 'WEEKLY';
  kind: 'SESSIONS' | 'CHAPTERS' | 'MINUTES';
  target: number;
  progress: number;
  note: string | null;
  dailyReminder: boolean;
};

export type HomeSummary = {
  name: string;
  primary: HomeCourse | null;
  courses: HomeCourse[];
  streak: number;
  freezes: { available: number; max: number } | null;
  level: { level: number; percent: number; toNext: number; totalXp: number } | null;
  xp: { thisWeek: number; total: number } | null;
  career: HomeCareer | null;
  week: { day: string; seconds: number }[];
  weekSeconds: number;
  activeDays: number;
  chaptersCompleted: number;
  chaptersTotal: number;
  pendingReviews: number;
  events: HomeEvent[];
  actions: HomeAction[];
  goal: HomeGoal | null;
  /** Set when the learner reached a streak milestone they have not celebrated yet. */
  streakMilestone: number | null;
};

export const STATE_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  NEEDS_REVISION: 'Needs revision',
  AWAITING_REVIEW: 'Awaiting review',
  COMPLETED: 'Completed',
  PAYMENT_REQUIRED: 'Payment required',
  DROPPED: 'Dropped',
};

export function timeAgo(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
