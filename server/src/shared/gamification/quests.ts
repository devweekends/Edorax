// Weekly quests (mission board). Two fixed "core" quests every week plus three rotating quests
// selected deterministically from a pool by the week key, so everyone sees the same set for a given
// week and it varies week to week. Progress resets every Monday (UTC). Rewards are Build Credits paid
// once per quest per week through the credit ledger.

export type QuestMetric = "chapters" | "assessments" | "studyDays" | "xp";

export type Quest = {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  rewardCredits: number;
  core?: boolean;
};

export const CORE_QUESTS: Quest[] = [
  { id: "first-move", title: "Make your first move", description: "Complete two chapters this week.", metric: "chapters", target: 2, rewardCredits: 15, core: true },
  { id: "xp-150", title: "Earn 150 XP", description: "Earn 150 XP this week.", metric: "xp", target: 150, rewardCredits: 25, core: true },
];

// One rotating quest is chosen per metric each week; the higher variant is a step up in effort.
const ROTATING: Record<QuestMetric, Quest[]> = {
  chapters: [
    { id: "practice-4", title: "Practice makes progress", description: "Complete 4 chapters this week.", metric: "chapters", target: 4, rewardCredits: 25 },
    { id: "practice-7", title: "Deep work", description: "Complete 7 chapters this week.", metric: "chapters", target: 7, rewardCredits: 35 },
  ],
  assessments: [
    { id: "mastery-2", title: "Show mastery", description: "Pass 2 assessments this week.", metric: "assessments", target: 2, rewardCredits: 35 },
    { id: "mastery-4", title: "Sharp shooter", description: "Pass 4 assessments this week.", metric: "assessments", target: 4, rewardCredits: 50 },
  ],
  studyDays: [
    { id: "study-4-days", title: "Keep your streak flexible", description: "Study on 4 different days this week.", metric: "studyDays", target: 4, rewardCredits: 20 },
    { id: "study-6-days", title: "Steady week", description: "Study on 6 different days this week.", metric: "studyDays", target: 6, rewardCredits: 30 },
  ],
  xp: [
    { id: "xp-300", title: "Go further", description: "Earn 300 XP this week.", metric: "xp", target: 300, rewardCredits: 35 },
    { id: "xp-700", title: "Power week", description: "Earn 700 XP this week.", metric: "xp", target: 700, rewardCredits: 50 },
  ],
};

export const ALL_QUESTS: Quest[] = [CORE_QUESTS, ...Object.values(ROTATING)].flat();
export const QUEST_BY_ID = new Map(ALL_QUESTS.map((q) => [q.id, q]));

const ROTATING_METRICS: QuestMetric[] = ["chapters", "assessments", "studyDays", "xp"];

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The five quests for a given week key (e.g. "2026-11-02"): 2 core + 3 rotating, deterministic. */
export function questsForWeek(weekKey: string): Quest[] {
  let state = hashSeed(weekKey);
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const metrics = [...ROTATING_METRICS];
  for (let i = metrics.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [metrics[i], metrics[j]] = [metrics[j]!, metrics[i]!];
  }
  const picked: Quest[] = [];
  for (const metric of metrics.slice(0, 3)) {
    const variants = ROTATING[metric];
    picked.push(variants[Math.floor(rand() * variants.length)]!);
  }
  return [...CORE_QUESTS, ...picked];
}
