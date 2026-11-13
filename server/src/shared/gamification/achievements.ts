// Achievement catalog (Duolingo-style collectible badges). Each achievement is multi-level with a
// one-year horizon: tiers escalate so a consistent learner has meaningful goals across ~12 months.
// Each tier pays Build Credits once (rewardFor), granted idempotently through the credit ledger.

export type AchievementCategory = "career" | "streak" | "xp" | "courses" | "quizzes" | "league" | "study";
export type AchievementMetric = "xp" | "streak" | "courses" | "chapters" | "perfect" | "league" | "studyHours" | "nightOwl" | "earlyBird" | "weekends";

export type AchievementTier = { label: string; target: number };

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  metric: AchievementMetric;
  icon: string;
  tiers: AchievementTier[];
};

/** Credits paid for reaching tier index `i` (0-based). Once per tier, per learner. */
export function rewardForTier(i: number): number {
  return 20 + 10 * i;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "chapters",
    title: "Chapter Climber",
    description: "Complete chapters across your courses.",
    category: "courses",
    metric: "chapters",
    icon: "book",
    tiers: [
      { label: "1 chapter", target: 1 },
      { label: "5 chapters", target: 5 },
      { label: "10 chapters", target: 10 },
      { label: "25 chapters", target: 25 },
      { label: "50 chapters", target: 50 },
      { label: "100 chapters", target: 100 },
      { label: "200 chapters", target: 200 },
      { label: "400 chapters", target: 400 },
    ],
  },
  {
    id: "courses",
    title: "Course Finisher",
    description: "Complete courses end to end.",
    category: "courses",
    metric: "courses",
    icon: "cap",
    tiers: [
      { label: "1 course", target: 1 },
      { label: "3 courses", target: 3 },
      { label: "5 courses", target: 5 },
      { label: "10 courses", target: 10 },
      { label: "20 courses", target: 20 },
      { label: "30 courses", target: 30 },
      { label: "40 courses", target: 40 },
    ],
  },
  {
    id: "streak",
    title: "Wildfire",
    description: "Keep a daily learning streak.",
    category: "streak",
    metric: "streak",
    icon: "flame",
    tiers: [
      { label: "3 days", target: 3 },
      { label: "7 days", target: 7 },
      { label: "14 days", target: 14 },
      { label: "30 days", target: 30 },
      { label: "50 days", target: 50 },
      { label: "100 days", target: 100 },
      { label: "180 days", target: 180 },
      { label: "275 days", target: 275 },
      { label: "365 days", target: 365 },
    ],
  },
  {
    id: "xp",
    title: "XP Collector",
    description: "Earn lifetime XP.",
    category: "xp",
    metric: "xp",
    icon: "zap",
    tiers: [
      { label: "100 XP", target: 100 },
      { label: "500 XP", target: 500 },
      { label: "1k XP", target: 1000 },
      { label: "5k XP", target: 5000 },
      { label: "10k XP", target: 10000 },
      { label: "25k XP", target: 25000 },
      { label: "50k XP", target: 50000 },
      { label: "100k XP", target: 100000 },
    ],
  },
  {
    id: "perfect",
    title: "Sharpshooter",
    description: "Ace quizzes with a perfect score.",
    category: "quizzes",
    metric: "perfect",
    icon: "target",
    tiers: [
      { label: "1 perfect", target: 1 },
      { label: "5 perfect", target: 5 },
      { label: "10 perfect", target: 10 },
      { label: "25 perfect", target: 25 },
      { label: "50 perfect", target: 50 },
      { label: "100 perfect", target: 100 },
      { label: "200 perfect", target: 200 },
      { label: "365 perfect", target: 365 },
    ],
  },
  {
    id: "league",
    title: "League Climber",
    description: "Reach higher weekly leagues.",
    category: "league",
    metric: "league",
    icon: "trophy",
    tiers: [
      { label: "Silver", target: 1 },
      { label: "Gold", target: 2 },
      { label: "Platinum", target: 3 },
      { label: "Diamond", target: 4 },
    ],
  },
  {
    id: "scholar",
    title: "Scholar",
    description: "Spend time learning.",
    category: "study",
    metric: "studyHours",
    icon: "calendar",
    tiers: [
      { label: "1 hour", target: 1 },
      { label: "10 hours", target: 10 },
      { label: "25 hours", target: 25 },
      { label: "50 hours", target: 50 },
      { label: "100 hours", target: 100 },
      { label: "200 hours", target: 200 },
      { label: "365 hours", target: 365 },
    ],
  },
  {
    id: "nightOwl",
    title: "Night Owl",
    description: "Study late in the evening.",
    category: "study",
    metric: "nightOwl",
    icon: "moon",
    tiers: [
      { label: "3 sessions", target: 3 },
      { label: "10 sessions", target: 10 },
      { label: "25 sessions", target: 25 },
      { label: "50 sessions", target: 50 },
      { label: "100 sessions", target: 100 },
      { label: "200 sessions", target: 200 },
    ],
  },
  {
    id: "earlyBird",
    title: "Early Bird",
    description: "Study before the day gets busy.",
    category: "study",
    metric: "earlyBird",
    icon: "sun",
    tiers: [
      { label: "3 sessions", target: 3 },
      { label: "10 sessions", target: 10 },
      { label: "25 sessions", target: 25 },
      { label: "50 sessions", target: 50 },
      { label: "100 sessions", target: 100 },
      { label: "200 sessions", target: 200 },
    ],
  },
  {
    id: "weekendWarrior",
    title: "Weekend Warrior",
    description: "Study on both Saturday and Sunday.",
    category: "study",
    metric: "weekends",
    icon: "trophy",
    tiers: [
      { label: "1 weekend", target: 1 },
      { label: "4 weekends", target: 4 },
      { label: "12 weekends", target: 12 },
      { label: "26 weekends", target: 26 },
      { label: "52 weekends", target: 52 },
    ],
  },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Highest achieved tier index (−1 = none), the next target, and progress (0–1) toward it. */
export function achievementProgress(
  value: number,
  tiers: AchievementTier[]
): { tier: number; nextTarget: number | null; progress: number } {
  let tier = -1;
  for (let i = 0; i < tiers.length; i++) {
    if (value >= tiers[i]!.target) tier = i;
    else break;
  }
  const next = tier + 1 < tiers.length ? tiers[tier + 1]! : null;
  const base = tier >= 0 ? tiers[tier]!.target : 0;
  const progress = next ? Math.max(0, Math.min(1, (value - base) / Math.max(1, next.target - base))) : 1;
  return { tier, nextTarget: next ? next.target : null, progress };
}
