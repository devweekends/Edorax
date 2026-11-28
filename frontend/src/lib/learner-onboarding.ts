import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { MenteeDashboardViewModel } from "@/shared/api/learner";
import type { CourseCategory } from "@/shared/domain/enums";

/**
 * Progressive stages for the learner home screen so brand-new users focus on starting
 * their first lesson before seeing streaks, quests, leagues and study-goal panels.
 */
export type LearnerOnboardingStage =
  | "choose_course"
  | "first_lesson"
  | "building_habit"
  | "established";

export type DashboardVisibility = {
  /** Show the full study-goal editor CTA in the page header. */
  showGoalEditorInHeader: boolean;
  /** Offer a light 1-tap daily pace picker after the learner's first chapter. */
  showQuickGoalNudge: boolean;
  /** Show the "This week" activity & momentum card alongside the primary course. */
  showWeeklySnapshot: boolean;
  /** Show weekly quests below the primary course. */
  showWeeklyQuests: boolean;
  /** Show weekly league / leaderboard opt-in below the primary course. */
  showLeagueGoal: boolean;
};

/**
 * Determine where a learner is in their onboarding journey from existing dashboard data.
 * No extra flags or schema columns are needed: every transition follows real learning activity.
 */
export function getLearnerOnboardingStage(model: MenteeDashboardViewModel): LearnerOnboardingStage {
  const activeCourses = model.courses.filter((course) => course.state !== "DROPPED");
  if (activeCourses.length === 0) return "choose_course";

  const hasEstablishedMomentum =
    model.overview.chaptersCompleted >= 3 ||
    model.overview.completedCourses > 0 ||
    model.activity.activeDays >= 2 ||
    model.habit.streakCount >= 2 ||
    (model.gamification.level?.level ?? 1) >= 2 ||
    model.gamification.leaderboardOptIn;

  if (hasEstablishedMomentum) return "established";

  const hasAnyProgress =
    model.overview.chaptersCompleted > 0 ||
    model.overview.totalSeconds > 0 ||
    model.activity.activeDays > 0 ||
    model.habit.streakCount > 0 ||
    (model.gamification.xp?.total ?? 0) > 0 ||
    Boolean(model.activity.runningSession);

  if (!hasAnyProgress) return "first_lesson";
  return "building_habit";
}

export function dashboardVisibility(stage: LearnerOnboardingStage): DashboardVisibility {
  return {
    showGoalEditorInHeader: stage === "established",
    showQuickGoalNudge: stage === "building_habit",
    showWeeklySnapshot: stage === "building_habit" || stage === "established",
    showWeeklyQuests: stage === "established",
    showLeagueGoal: stage === "established",
  };
}

function difficultyRank(difficulty: string | null): number {
  const normalized = difficulty?.trim().toLowerCase() ?? "";
  if (normalized === "beginner" || normalized === "foundations" || normalized === "introductory") return 0;
  if (normalized === "intermediate") return 1;
  if (normalized === "advanced") return 2;
  return 1;
}

/**
 * Pick starter courses for the Day-0 onboarding screen.
 * Free and beginner-friendly courses come first so new learners can jump into lesson 1 right away.
 */
export function selectStarterCourses(
  courses: readonly CatalogCourseSummary[],
  category: CourseCategory | null = null,
  limit = 6
): CatalogCourseSummary[] {
  const filtered = category ? courses.filter((course) => course.category === category) : [...courses];
  return filtered
    .sort((a, b) => {
      const aFree = a.pricingType === "FREE" ? 0 : 1;
      const bFree = b.pricingType === "FREE" ? 0 : 1;
      if (aFree !== bFree) return aFree - bFree;
      const aDiff = difficultyRank(a.difficulty);
      const bDiff = difficultyRank(b.difficulty);
      if (aDiff !== bDiff) return aDiff - bDiff;
      const aRating = a.ratingAverage ?? 0;
      const bRating = b.ratingAverage ?? 0;
      if (aRating !== bRating) return bRating - aRating;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
