// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { CareerTier, LeagueTier } from "./gamification";

// The public Career Identity page (Phase 5). A learner opts in with a unique handle and the server
// exposes only safe, curated fields at /u/<handle>. XP/league/streak are hidden when the learner has
// "hide game elements" on; the career tier (verified mastery) still shows because it is the identity.

export type PublicProfileSettings = {
  profilePublic: boolean;
  publicSlug: string | null;
  headline: string | null;
  learningInPublic: boolean;
};

export type PublicProfileUpdate = {
  profilePublic?: boolean;
  headline?: string | null;
  learningInPublic?: boolean;
};

export type PublicProfileView = {
  slug: string;
  name: string;
  headline: string | null;
  learningInPublic: boolean;
  joinedAt: string;
  careerTier: CareerTier;
  coursesCompleted: number;
  /** Null when the learner hides game elements. */
  xpTotal: number | null;
  streakDays: number | null;
  leagueTier: LeagueTier | null;
  /** Equipped cosmetic visual kind, or null. */
  cosmetic: string | null;
  hidden: boolean;
  /** The learner's most recently active in-progress course, or null. */
  currentCourse: { slug: string; title: string; percentComplete: number } | null;
  /** Personal records (persistent bests), or null when game elements are hidden. */
  records: ProfileRecords | null;
  /** Achievement cards, or null when game elements are hidden. */
  achievements: AchievementView[] | null;
};

export type AchievementViewTier = { label: string; target: number };

export type AchievementView = {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  value: number;
  /** Highest achieved tier index (−1 = locked). */
  tier: number;
  nextTarget: number | null;
  /** Progress (0–1) toward the next tier; 1 when maxed. */
  progress: number;
  tiers: AchievementViewTier[];
  /** Credits already earned from the tiers reached so far. */
  earnedCredits: number;
  /** Credits the next tier pays (null when maxed). */
  nextReward: number | null;
};

/** Duolingo-style personal records: durable bests that survive a reset. */
export type ProfileRecords = {
  longestStreakDays: number;
  bestWeeklyXp: { value: number; weekKey: string } | null;
  mostXpInADay: { value: number; dayKey: string } | null;
  bestLeagueFinish: { rank: number; tier: LeagueTier; weekKey: string } | null;
  highestLeagueTier: LeagueTier | null;
  bestWeekChapters: { value: number; weekKey: string } | null;
  mostStudyMinutesInADay: { value: number; dayKey: string } | null;
  longestSessionMinutes: number;
  perfectQuizzes: number;
  activeDays: number;
};

/** The owner's view of the same page: public card + owner-only fields. */
export type OwnerProfileView = PublicProfileView & {
  isOwner: true;
  profilePublic: boolean;
  creditsBalance: number | null;
  /** Credits granted this visit from newly reached achievement tiers. */
  achievementRewards: { count: number; credits: number };
};
