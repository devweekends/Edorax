"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Network, Terminal, Zap, type LucideIcon } from "lucide-react";
import { fetchDailyGames } from "@/lib/games/client";
import type { DailyGamesView } from "@/shared/api/games";
import type { GameId } from "@/shared/games";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { StarRow } from "./celebration";

const LOOK: Record<GameId, { icon: LucideIcon; label: string; does: string; cta: string }> = {
  sysdesign: { icon: Network, label: "System design", does: "A live system is breaking. Change the design on the lab board until every check passes.", cta: "Start" },
  linux: { icon: Terminal, label: "Linux", does: "Type real commands on a made-up server to find, count or fix something.", cta: "Start" },
  docker: { icon: Boxes, label: "Docker", does: "Repair a broken container with commands, or put a Dockerfile together from pieces.", cta: "Start" },
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
      <ol className="grid gap-px border border-border bg-border sm:grid-cols-3" aria-label="How it works">
        {[
          ["Pick a game", "Each game has three rounds today: easy, medium and hard."],
          ["Solve a round", "Do what the round asks. Press Check when you think you are done."],
          ["Collect XP", "A solved round gives 3 XP. All three rounds in one game give 2 more."],
        ].map(([title, body], i) => (
          <li key={title} className="flex items-start gap-3 bg-card px-4 py-3">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">{i + 1}</span>
            <span className="text-sm leading-snug"><strong className="block">{title}</strong><span className="text-muted-foreground">{body}</span></span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
        <p className="flex items-center gap-2 text-sm">
          <Zap className="size-4 text-brand-yellow" aria-hidden />
          {daily.signedIn ? (
            <span><strong>{daily.xpToday} XP</strong> earned today. Up to <strong>{daily.xpToday + daily.xpLeft}</strong> are possible.</span>
          ) : (
            <span>You can play now. <Link href="/login" className="font-semibold underline">Sign in</Link> to save your stars and earn XP.</span>
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
            <article key={game.id} className="flex flex-col overflow-hidden border border-border bg-card">
              <header className="flex items-center gap-2.5 bg-[#0f1b33] px-4 py-2.5 text-slate-100">
                <Icon className="size-4 text-sky-300" aria-hidden />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider">{look.label}</span>
                <span className="ml-auto font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300">{solved}/3</span>
              </header>
              <div className="flex flex-1 flex-col p-4">
                <h2 className="text-xl font-bold leading-tight tracking-tight">{game.title}</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{look.does}</p>
                <ol className="mt-4 grid grid-cols-3 gap-px border border-border bg-border" aria-label={`${solved} of 3 rounds solved`}>
                  {[0, 1, 2].map((i) => {
                    const done = game.progress.find((p) => p.roundIndex === i);
                    return (
                      <li key={i} className={cn("px-2 py-1.5", done ? "bg-emerald-500/10" : "bg-card")}>
                        <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{["Easy", "Medium", "Hard"][i]}</span>
                        {done ? <StarRow stars={done.stars} size="sm" /> : <span className="text-xs text-muted-foreground">Open</span>}
                      </li>
                    );
                  })}
                </ol>
                <Link
                  href={`/puzzles/${game.id}`}
                  className={cn(buttonVariants({ variant: game.setComplete ? "outline" : "default", size: "lg" }), "mt-4 w-full font-mono text-xs font-bold uppercase tracking-wider")}
                >
                  {game.setComplete ? "Play again for practice" : solved > 0 ? "Continue" : look.cta}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
