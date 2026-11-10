import type {
  LeaderboardCategory,
  LeaderboardScope,
  LeagueTier,
} from '../../../server/src/shared/api/gamification';

export type {
  LeaderboardCategory,
  LeaderboardHubEntry,
  LeaderboardHubView,
  LeaderboardScope,
  LeagueInfo,
  LeagueTier,
} from '../../../server/src/shared/api/gamification';

export type LeaderboardSelection = {
  category: LeaderboardCategory;
  scope: LeaderboardScope;
  courseId: string | null;
};

export type LeaderboardCourse = { courseId: string; title: string };

export type LeaderboardContext = {
  courses: LeaderboardCourse[];
  featuresEnabled: boolean;
  initialCourseId: string | null;
};

export const LEADERBOARD_CATEGORIES: { id: LeaderboardCategory; label: string }[] = [
  { id: 'weekly_xp', label: 'Weekly XP' },
  { id: 'all_time_xp', label: 'All-time XP' },
  { id: 'speed', label: 'Speed' },
  { id: 'streak', label: 'Streak' },
];

const CATEGORY_IDS: string[] = LEADERBOARD_CATEGORIES.map((category) => category.id);

/** Guards the request coming over IPC before it is sent to the server. */
export function isLeaderboardSelection(value: unknown): value is LeaderboardSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Record<string, unknown>;
  const categoryOk = typeof selection.category === 'string' && CATEGORY_IDS.includes(selection.category);
  const scopeOk = selection.scope === 'course' || selection.scope === 'global';
  const courseOk =
    selection.courseId === null ||
    (typeof selection.courseId === 'string' && selection.courseId.length > 0 && selection.courseId.length <= 200);
  return categoryOk && scopeOk && courseOk;
}

export const LEAGUE_TIER_ORDER: LeagueTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

export const LEAGUE_TIER_LABELS: Record<LeagueTier, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
  DIAMOND: 'Diamond',
};

export function nextLeagueTier(tier: LeagueTier): LeagueTier | null {
  const index = LEAGUE_TIER_ORDER.indexOf(tier);
  return index >= 0 && index < LEAGUE_TIER_ORDER.length - 1 ? LEAGUE_TIER_ORDER[index + 1]! : null;
}

export function prevLeagueTier(tier: LeagueTier): LeagueTier | null {
  const index = LEAGUE_TIER_ORDER.indexOf(tier);
  return index > 0 ? LEAGUE_TIER_ORDER[index - 1]! : null;
}

const numberFormat = new Intl.NumberFormat();

/** "1,234 XP", "12 chapters", "5-day streak". The server sends the metric label per board. */
export function formatScore(score: number, metricLabel: string): string {
  if (metricLabel === 'day streak') return `${score}-day streak`;
  return `${numberFormat.format(score)} ${metricLabel}`;
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** "Ada L." becomes "AL". The server only sends first name and last initial. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

export function resetLabel(resetsAt: string): string {
  const ms = Date.parse(resetsAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Resets soon';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `Resets in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `Resets in ${hours} hour${hours === 1 ? '' : 's'}`;
}

export function boardContext(scope: LeaderboardScope, category: LeaderboardCategory, courseTitle: string | null): string {
  if (scope === 'course') return courseTitle ?? 'Course';
  switch (category) {
    case 'weekly_xp':
      return 'Global Weekly XP';
    case 'all_time_xp':
      return 'All-time XP';
    case 'speed':
      return 'Speed';
    case 'streak':
      return 'Streak';
  }
}
