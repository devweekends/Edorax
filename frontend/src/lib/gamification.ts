import type { GamificationSummary } from "@/shared/api/gamification";

/** True when the learner sees any game element at all (not hidden, and XP or freezes switched on). */
export function showsGameElements(summary: GamificationSummary): boolean {
  return !summary.hidden && (summary.xp !== null || summary.freezes !== null);
}
