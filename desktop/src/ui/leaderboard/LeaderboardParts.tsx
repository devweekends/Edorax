import type { ReactNode } from 'react';
import {
  LEAGUE_TIER_LABELS,
  formatNumber,
  formatScore,
  initials,
  nextLeagueTier,
  prevLeagueTier,
  resetLabel,
  type LeaderboardHubEntry,
  type LeagueInfo,
} from '../../domain/leaderboard';

const MEDAL: Record<number, string> = {
  1: 'bg-brand-yellow text-foreground',
  2: 'bg-muted text-foreground',
  3: 'bg-brand-yellow/40 text-foreground',
};

const PILL = {
  outline: 'border border-border text-foreground',
  muted: 'border border-border text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  destructive: 'bg-destructive/10 text-destructive',
} as const;

export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone]}`}>{children}</span>;
}

export function Rank({ rank, highlight }: { rank: number; highlight?: boolean }) {
  const tone = MEDAL[rank] ?? (highlight ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground');
  return (
    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${tone}`}>
      {rank}
    </span>
  );
}

export function ProgressTrack({ score, best, label }: { score: number; best: number; label: string }) {
  const percent = Math.min(100, Math.round((score / best) * 100));
  return (
    <div
      className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.min(score, best)}
      aria-valuemin={0}
      aria-valuemax={best}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function BestScore({ score, best, metricLabel, label }: { score: number; best: number; metricLabel: string; label: string }) {
  const beaten = score > best;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className={beaten ? 'font-medium text-primary' : 'font-medium text-foreground'}>
          {beaten ? 'New personal best!' : label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(score)} / {formatNumber(best)} {metricLabel}
        </span>
      </div>
      <ProgressTrack score={score} best={best} label={label} />
    </div>
  );
}

export function StandingCard({
  context,
  rank,
  groupSize,
  score,
  bestScore,
  metricLabel,
  bestLabel,
  resetsAt,
}: {
  context: string;
  rank: number;
  groupSize: number;
  score: number;
  bestScore: number | null;
  metricLabel: string;
  bestLabel: string;
  resetsAt: string | null;
}) {
  const best = bestScore ?? 0;
  return (
    <section aria-labelledby="standing-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">Your place{context ? ` in ${context}` : ''}</p>
        <h2 id="standing-heading" className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">#{rank}</span>
          <span className="text-base text-muted-foreground">of {formatNumber(groupSize)} learners</span>
        </h2>
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{metricLabel}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{formatScore(score, metricLabel)}</p>
          </div>
          {resetsAt ? <p className="text-sm tabular-nums text-muted-foreground">{resetLabel(resetsAt)}</p> : null}
        </div>
        {best > 0 ? (
          <BestScore score={score} best={best} metricLabel={metricLabel} label={bestLabel} />
        ) : (
          <p className="text-sm text-muted-foreground">Your first week on this board. Every chapter counts.</p>
        )}
      </div>
    </section>
  );
}

function LeagueOutcome({ league }: { league: LeagueInfo }) {
  const last = league.lastWeek;
  if (!last) return null;
  const box = 'rounded-xl border px-4 py-2.5 text-sm font-medium';
  if (last.outcome === 'PROMOTED') {
    const to = nextLeagueTier(last.fromTier);
    return (
      <p className={`${box} border-primary/30 bg-primary/10 text-primary`}>
        Promoted to {to ? LEAGUE_TIER_LABELS[to] : 'a higher league'} last week.
      </p>
    );
  }
  if (last.outcome === 'DEMOTED') {
    const to = prevLeagueTier(last.fromTier);
    return (
      <p className={`${box} border-destructive/30 bg-destructive/10 text-destructive`}>
        Demoted to {to ? LEAGUE_TIER_LABELS[to] : 'a lower league'} last week.
      </p>
    );
  }
  return (
    <p className={`${box} border-border bg-muted/40 text-muted-foreground`}>
      You held {LEAGUE_TIER_LABELS[league.tier]} League last week.
    </p>
  );
}

export function LeagueCard({
  league,
  score,
  metricLabel,
  bestScore,
  resetsAt,
}: {
  league: LeagueInfo;
  score: number;
  metricLabel: string;
  bestScore: number | null;
  resetsAt: string | null;
}) {
  const promoteCount = league.promotionZone;
  const next = nextLeagueTier(league.tier);
  const prev = prevLeagueTier(league.tier);
  const isPromoting = promoteCount > 0 && league.rank <= promoteCount && Boolean(next);
  const demoteCount = league.demotionZone <= league.groupSize ? Math.max(0, league.groupSize - league.demotionZone + 1) : 0;
  const isDemoting = demoteCount > 0 && league.rank >= league.demotionZone && Boolean(prev);
  const best = bestScore ?? 0;
  const label = 'This week compared with your best week';

  return (
    <section aria-labelledby="league-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="outline">{LEAGUE_TIER_LABELS[league.tier]} League</Pill>
            {isPromoting ? (
              <Pill tone="primary">Promotion zone</Pill>
            ) : isDemoting ? (
              <Pill tone="destructive">Demotion zone</Pill>
            ) : (
              <Pill tone="muted">Safe zone</Pill>
            )}
          </div>
          {resetsAt ? <span className="text-sm tabular-nums text-muted-foreground">{resetLabel(resetsAt)}</span> : null}
        </div>
        <div className="mt-3">
          <p className="text-sm font-medium text-muted-foreground">Your place in {LEAGUE_TIER_LABELS[league.tier]}</p>
          <h2 id="league-heading" className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">#{league.rank}</span>
            <span className="text-base text-muted-foreground">of {formatNumber(league.groupSize)} learners</span>
          </h2>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{metricLabel === 'XP' ? 'XP this week' : metricLabel}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">{formatScore(score, metricLabel)}</p>
          </div>
          {next && promoteCount > 0 ? (
            <p className="text-sm font-medium text-primary">
              Top {promoteCount} promote to {LEAGUE_TIER_LABELS[next]}
            </p>
          ) : prev && demoteCount > 0 ? (
            <p className="text-sm font-medium text-destructive">
              Bottom {demoteCount} demote to {LEAGUE_TIER_LABELS[prev]}
            </p>
          ) : league.tier === 'DIAMOND' ? (
            <p className="text-sm text-muted-foreground">Top league. No higher tier to promote to.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Base league. Protected from demotion.</p>
          )}
        </div>

        {best > 0 ? (
          <div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className={score > best ? 'font-semibold text-primary' : 'font-medium text-foreground'}>
                {score > best ? 'New personal best!' : 'Beat your best week'}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatNumber(score)} / {formatNumber(best)} XP
              </span>
            </div>
            <ProgressTrack score={score} best={best} label={label} />
          </div>
        ) : null}

        <LeagueOutcome league={league} />
      </div>
    </section>
  );
}

export function StandingsList({
  entries,
  metricLabel,
  league,
}: {
  entries: LeaderboardHubEntry[];
  metricLabel: string;
  league: LeagueInfo | null;
}) {
  if (entries.length === 0) return null;

  const zoneFor = (rank: number): 'promote' | 'demote' | null => {
    if (!league) return null;
    if (nextLeagueTier(league.tier) && league.promotionZone > 0 && rank <= league.promotionZone) return 'promote';
    if (prevLeagueTier(league.tier) && league.demotionZone <= league.groupSize && rank >= league.demotionZone) return 'demote';
    return null;
  };

  return (
    <section aria-labelledby="standings-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="standings-heading" className="text-lg font-semibold tracking-tight">
        Standings
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {league ? `Learners nearest your rank in ${LEAGUE_TIER_LABELS[league.tier]} League.` : 'Learners nearest your rank.'}
      </p>

      <ol className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {entries.map((entry) => {
          const zone = zoneFor(entry.rank);
          const tone = entry.isYou
            ? 'bg-primary/5'
            : zone === 'promote'
              ? 'bg-primary/[0.04]'
              : zone === 'demote'
                ? 'bg-destructive/[0.04]'
                : '';
          return (
            <li
              key={`${entry.rank}-${entry.name}`}
              aria-current={entry.isYou ? 'true' : undefined}
              className={`flex items-center gap-3 px-3.5 py-3.5 sm:px-4 ${tone}`}
            >
              <Rank rank={entry.rank} highlight={entry.isYou} />
              <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${entry.isYou ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                {initials(entry.name)}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className={`truncate text-base text-foreground ${entry.isYou ? 'font-semibold' : 'font-medium'}`}>
                  {entry.name || 'You'}
                </span>
                {entry.isYou ? <Pill tone="muted">You</Pill> : null}
                {zone === 'promote' ? <Pill tone="primary">Promote</Pill> : zone === 'demote' ? <Pill tone="destructive">Demote</Pill> : null}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {formatScore(entry.score, metricLabel)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function LastWeekWinners({ winners, metricLabel }: { winners: LeaderboardHubEntry[]; metricLabel: string }) {
  return (
    <section aria-labelledby="last-week-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="last-week-heading" className="text-lg font-semibold tracking-tight">
        Last week&apos;s winners
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Top three from the board that just closed.</p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {winners.map((winner) => (
          <li
            key={winner.rank}
            className={`flex flex-col items-center rounded-xl border px-3 py-5 text-center ${
              winner.isYou ? 'border-brand-yellow bg-brand-yellow/15' : 'border-border bg-muted/30'
            }`}
          >
            <Rank rank={winner.rank} />
            <span className={`mt-3 w-full truncate text-sm ${winner.isYou ? 'font-semibold' : 'font-medium'}`}>
              {winner.isYou ? (winner.name ? `${winner.name} (You)` : 'You') : winner.name}
            </span>
            <span className="mt-1 text-sm tabular-nums text-muted-foreground">{formatScore(winner.score, metricLabel)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
