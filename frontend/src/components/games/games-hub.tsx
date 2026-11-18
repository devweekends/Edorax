"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Network, Terminal, Zap, type LucideIcon } from "lucide-react";
import { fetchDailyGames } from "@/lib/games/client";
import type { DailyGamesView } from "@/shared/api/games";
import type { GameId } from "@/shared/games";
import { cn } from "@/lib/utils";
import { StarRow } from "./celebration";

const LOOK: Record<GameId, { icon: LucideIcon; accent: string; cta: string }> = {
  sysdesign: { icon: Network, accent: "bg-sky-500/15 text-sky-700 dark:text-sky-300", cta: "Fix today's incidents" },
  linux: { icon: Terminal, accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", cta: "Start today's quests" },
  docker: { icon: Boxes, accent: "bg-orange-500/15 text-orange-700 dark:text-orange-300", cta: "Fix today's containers" },
};

function timeLeft(resetsAt: string, now: number): string {
  const ms = Math.max(0, new Date(resetsAt).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Today's three games with how far each is solved, the XP earned and the time until a new set. */
export function GamesHub() {
  const [daily, setDaily] = useState<DailyGamesView | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchDailyGames().then(setDaily).catch(() => setFailed(true));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (failed) return <p className="mt-8 rounded-md border border-border bg-card p-5">Today&apos;s games could not be loaded. Refresh the page to try again.</p>;
  if (!daily) {
    return (
      <div className="mt-8 grid gap-4 md:grid-cols-3" aria-busy aria-label="Loading today's games">
        {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-md border border-border bg-card" />)}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <Zap className="size-4 text-brand-yellow" aria-hidden />
          {daily.signedIn ? (
            <span><strong>{daily.xpToday} XP</strong> earned today, up to <strong>{daily.xpToday + daily.xpLeft}</strong> from the games.</span>
          ) : (
            <span>Play without an account. <Link href="/login" className="font-semibold underline">Sign in</Link> to save stars and earn XP.</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">New games in <strong className="text-foreground">{timeLeft(daily.resetsAt, now)}</strong></p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {daily.games.map((game) => {
          const look = LOOK[game.id];
          const Icon = look.icon;
          const solved = game.progress.length;
          return (
            <Link
              key={game.id}
              href={`/puzzles/${game.id}`}
              className="group flex flex-col rounded-md border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-secondary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className={cn("inline-flex size-11 items-center justify-center rounded-md", look.accent)}><Icon className="size-6" aria-hidden /></span>
              <h2 className="mt-4 text-xl font-bold tracking-tight">{game.title}</h2>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{game.tagline}</p>
              <ol className="mt-4 flex gap-2" aria-label={`${solved} of 3 rounds solved`}>
                {[0, 1, 2].map((i) => {
                  const done = game.progress.find((p) => p.roundIndex === i);
                  return (
                    <li key={i} className={cn("flex-1 rounded-sm border px-2 py-1.5", done ? "border-emerald-500/60 bg-emerald-500/10" : "border-border")}>
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{["Easy", "Medium", "Hard"][i]}</span>
                      {done ? <StarRow stars={done.stars} size="sm" /> : <span className="text-xs text-muted-foreground">Open</span>}
                    </li>
                  );
                })}
              </ol>
              <span className="mt-4 text-sm font-semibold text-primary group-hover:underline">
                {game.setComplete ? "All solved. Play again for practice" : solved > 0 ? "Keep going" : look.cta}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
