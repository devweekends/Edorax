"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { fetchDailyGames, submitGameRound } from "@/lib/games/client";
import { gameSounds, isSoundEnabled, setSoundEnabled } from "@/lib/games/audio";
import { engineFor, ROUNDS_PER_DAY, type GameId, type VerifyResult } from "@/shared/games";
import type { DailyGameView, DailyGamesView, SubmitRoundResult } from "@/shared/api/games";
import { cn } from "@/lib/utils";
import { ConfettiBurst, StarRow, XpChip } from "./celebration";
import { GAME_PLAYS } from "./registry";

const TIER_LABEL = ["Easy", "Medium", "Hard"] as const;

type Outcome = {
  local: VerifyResult;
  server: SubmitRoundResult | null;
  /** Set when the server could not be reached or the learner is not signed in. */
  note: string | null;
  burst: string;
};

/**
 * One daily game: loads today's rounds, shows the three round tabs, hosts the game's play
 * component, checks a finished round with the shared engine, and shows the result with sound,
 * stars and confetti. A signed-in learner's round is also replayed and recorded on the server.
 */
export function GameHost({ game }: { game: GameId }) {
  const [daily, setDaily] = useState<DailyGamesView | null>(null);
  const [failed, setFailed] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  // The sound switch lives in localStorage, so it can only be read after the page has mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSoundOn(isSoundEnabled()), []);

  const load = useCallback(() => {
    fetchDailyGames().then(setDaily).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const view: DailyGameView | undefined = daily?.games.find((g) => g.id === game);
  const Play = GAME_PLAYS[game];
  const engine = useMemo(() => engineFor(game), [game]);

  // Open on the first round that is not solved yet.
  useEffect(() => {
    if (!view) return;
    const open = [0, 1, 2].find((i) => !view.progress.some((p) => p.roundIndex === i));
    // Open on the first round that is not solved, once today's progress has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoundIndex(open ?? 0);
  }, [view?.id, daily?.dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(
    async (submission: unknown) => {
      if (!view || busy) return;
      const round = view.rounds[roundIndex]!;
      const parsed = engine.parseSubmission(submission);
      const local: VerifyResult = parsed === null
        ? { passed: false, stars: 0, score: 0, message: "That did not look like a finished round." }
        : engine.verify(round, parsed);
      const burst = `${roundIndex}-${attempt}-${Date.now()}`;
      if (!local.passed) {
        gameSounds.lose();
        setOutcome({ local, server: null, note: null, burst });
        return;
      }
      gameSounds.win(local.stars);
      setOutcome({ local, server: null, note: null, burst });
      if (!daily?.signedIn) {
        setOutcome({ local, server: null, note: "Sign in to save your stars and earn XP.", burst });
        return;
      }
      setBusy(true);
      try {
        const server = await submitGameRound(game, roundIndex, submission);
        if (server.xpAwarded > 0) gameSounds.coin();
        if (server.setBonus > 0) setTimeout(() => gameSounds.fanfare(), 500);
        setOutcome({ local, server, note: null, burst });
        load();
      } catch (error) {
        const note = error instanceof ApiError && error.status === 401 ? "Sign in to save your stars and earn XP." : "Solved. We could not save it just now, so no XP this time.";
        setOutcome({ local, server: null, note, burst });
      } finally {
        setBusy(false);
      }
    },
    [view, busy, roundIndex, attempt, engine, daily?.signedIn, game, load],
  );

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) gameSounds.ok();
  }

  function pick(index: number) {
    setOutcome(null);
    setAttempt((n) => n + 1);
    setRoundIndex(index);
  }

  if (failed) {
    return (
      <div className="rounded-md border border-border bg-card p-6">
        <p className="font-medium">Today&apos;s games could not be loaded.</p>
        <Button className="mt-4" onClick={() => { setFailed(false); load(); }}>Try again</Button>
      </div>
    );
  }
  if (!daily || !view) return <div className="h-96 animate-pulse rounded-md border border-border bg-card" aria-busy aria-label="Loading today's game" />;

  const round = view.rounds[roundIndex]!;
  const solved = (i: number) => view.progress.find((p) => p.roundIndex === i);
  const passed = outcome?.local.passed ?? false;
  const stars = outcome?.local.stars ?? 0;
  const last = roundIndex >= ROUNDS_PER_DAY - 1;
  const setDone = outcome?.server?.setComplete;

  return (
    <div className="space-y-5">
      {outcome?.local.passed ? <ConfettiBurst stars={setDone ? 3 : stars} burstKey={outcome.burst} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/puzzles" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> All daily games
        </Link>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          {soundOn ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          Sound {soundOn ? "on" : "off"}
        </button>
      </div>

      <div role="tablist" aria-label="Today&apos;s rounds" className="grid grid-cols-3 gap-px border border-border bg-border">
        {[0, 1, 2].map((i) => {
          const done = solved(i);
          return (
            <button
              key={i}
              role="tab"
              aria-selected={i === roundIndex}
              type="button"
              onClick={() => pick(i)}
              className={cn(
                "flex min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                i === roundIndex ? "bg-secondary" : "bg-card hover:bg-secondary/60",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={cn("font-mono text-[11px] font-bold uppercase tracking-wider", i === roundIndex ? "text-primary" : "text-muted-foreground")}>
                  {i + 1}. {TIER_LABEL[i]}
                </span>
                {done ? <StarRow stars={done.stars} size="sm" /> : <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Open</span>}
              </span>
              <span className="line-clamp-1 text-sm font-semibold">{view.rounds[i]!.title}</span>
            </button>
          );
        })}
      </div>

      <div className={cn(outcome && !passed && "motion-safe:animate-[feedback-shake_420ms_both]")}>
        <Suspense fallback={<div className="h-80 animate-pulse rounded-md border border-border bg-card" />}>
          <Play key={`${roundIndex}-${attempt}`} round={round} roundIndex={roundIndex} attempt={attempt} locked={busy} sounds={gameSounds} onFinish={finish} />
        </Suspense>
      </div>

      {outcome ? (
        <div
          role="status"
          className={cn(
            "border p-5 motion-safe:animate-[bm-pop_0.35s_ease-out_both]",
            passed ? "border-emerald-500/60 bg-emerald-500/10" : "border-border bg-card",
          )}
        >
          <div className="flex flex-wrap items-center gap-4">
            {passed ? <StarRow stars={stars} /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Result</p>
              <p className="text-xl font-bold tracking-tight">{passed ? (setDone ? "All three solved today" : "Solved") : "Not yet"}</p>
              <p className="text-sm text-muted-foreground">{outcome.local.message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <XpChip amount={outcome.server?.xpAwarded ?? 0} />
              <XpChip amount={outcome.server?.setBonus ?? 0} label="set bonus" />
            </div>
          </div>
          {outcome.note ? <p className="mt-3 text-sm font-medium">{outcome.note} {!daily.signedIn ? <Link href="/login" className="underline">Sign in</Link> : null}</p> : null}
          {outcome.server?.alreadySolved ? <p className="mt-3 text-sm text-muted-foreground">You solved this one earlier today, so it is practice and gives no more XP.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!passed || last ? (
              <Button variant="outline" onClick={() => { setOutcome(null); setAttempt((n) => n + 1); }}>
                <RotateCcw className="mr-1.5 size-4" aria-hidden /> {passed ? "Play it again" : "Try again"}
              </Button>
            ) : null}
            {passed && !last ? (
              <Button onClick={() => pick(roundIndex + 1)}>
                Next round <ArrowRight className="ml-1.5 size-4" aria-hidden />
              </Button>
            ) : null}
            {passed && last ? <Link href="/puzzles" className={buttonVariants()}>Back to today&apos;s games</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
