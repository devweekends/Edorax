import type { AchievementView } from "@/shared/api/public-profile";
import type { CareerRequirement, CareerTier } from "@/shared/api/gamification";
import { CAREER_TIER_LABELS } from "@/shared/gamification/career";

// Pure presentation helpers for the profile page, kept apart from the JSX so they can be tested.

export type CareerNodeState = "done" | "current" | "next" | "locked";

export function careerNodeState(index: number, currentIndex: number): CareerNodeState {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return index === currentIndex + 1 ? "next" : "locked";
}

/** "5 courses · 72% average", or a starter line for the first tier. */
export function careerRequirementLine(requirement: CareerRequirement): string {
  if (requirement.courses === 0 && requirement.minScore === 0) return "Where every learner starts.";
  const courses = `${requirement.courses} ${requirement.courses === 1 ? "course" : "courses"}`;
  return requirement.minScore > 0 ? `${courses} · ${requirement.minScore}% average` : courses;
}

/**
 * What the learner still needs for the next tier. With the owner's own numbers it names the gap;
 * without them (the public page, which never carries the quiz average) it states the rule.
 */
export function nextStepCopy(
  next: CareerTier,
  requirement: CareerRequirement,
  mastery: { completedCourses: number; avgScore: number } | null,
): string {
  const label = CAREER_TIER_LABELS[next];
  if (!mastery) {
    return `${label} needs ${requirement.courses} completed ${requirement.courses === 1 ? "course" : "courses"} and a ${requirement.minScore}% average quiz score.`;
  }
  const remaining = Math.max(0, requirement.courses - mastery.completedCourses);
  const parts: string[] = [];
  if (remaining > 0) parts.push(`complete ${remaining} more ${remaining === 1 ? "course" : "courses"}`);
  if (mastery.avgScore < requirement.minScore) {
    parts.push(`raise your average quiz score from ${mastery.avgScore}% to ${requirement.minScore}%`);
  } else if (remaining > 0) {
    parts.push(`keep your average quiz score at ${requirement.minScore}% or higher`);
  }
  if (parts.length === 0) return `You meet the ${label} requirements. Your tier updates when you next finish a course.`;
  const sentence = parts.join(" and ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/**
 * The achievements to show large: ones with credits waiting to be claimed first, then those closest
 * to their next tier. Maxed ones with nothing to claim are left out.
 */
export function featuredAchievements(achievements: AchievementView[], count = 2, claimable: ReadonlySet<string> = new Set()): AchievementView[] {
  return achievements
    .filter((achievement) => achievement.nextTarget !== null || claimable.has(achievement.id))
    .map((achievement, order) => ({ achievement, order, claim: claimable.has(achievement.id) ? 1 : 0 }))
    .sort(
      (a, b) =>
        b.claim - a.claim || b.achievement.progress - a.achievement.progress || b.achievement.tier - a.achievement.tier || a.order - b.order,
    )
    .slice(0, count)
    .map(({ achievement }) => achievement);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2026" from an ISO timestamp, in UTC so the server and browser agree. */
export function monthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Oct 26" from a "2026-10-26" day or week key. */
export function shortDate(key: string): string {
  const [, month, day] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}`;
}
