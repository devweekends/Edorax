"use client";

import { CheckCircle2, Circle, Lightbulb, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MissionGoal = { label: string; met: boolean | null };

type Props = {
  title: string;
  goals: MissionGoal[];
  /** The count line, for example "3 commands, par 3". */
  counter: { label: string; value: number; par: number; limit: number; text?: string };
  hints: string[];
  hintsUsed: number;
  onHint: () => void;
  onReset: () => void;
  onFinish: () => void;
  finishLabel: string;
  canFinish: boolean;
  ready: boolean;
  locked: boolean;
};

/** The objective checklist, the command counter against par, the hints and the reset and finish buttons. */
export function MissionPanel({ title, goals, counter, hints, hintsUsed, onHint, onReset, onFinish, finishLabel, canFinish, ready, locked }: Props) {
  const pace = counter.value <= counter.par + 1 ? "text-emerald-600 dark:text-emerald-400" : counter.value <= counter.par + 4 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const fill = Math.min(100, Math.round((counter.value / Math.max(1, counter.par + 4)) * 100));
  const more = hintsUsed < hints.length;
  return (
    <section aria-label="Mission" className="rounded-md border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
        <p className={cn("text-sm font-semibold tabular-nums", pace)} aria-live="polite">
          {counter.text ?? `${counter.value} ${counter.label}, par ${counter.par}`}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-all duration-300", counter.value <= counter.par + 1 ? "bg-emerald-500" : counter.value <= counter.par + 4 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${fill}%` }} />
      </div>

      <ul className="mt-3 space-y-1.5" aria-label="Objectives">
        {goals.map((g) => (
          <li key={g.label} className="flex items-start gap-2 text-sm">
            {g.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500 motion-safe:animate-[bm-pop_0.3s_ease-out_both]" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <span className={cn(g.met && "text-foreground", g.met === false || g.met === null ? "text-muted-foreground" : "")}>
              {g.label}
              <span className="sr-only">{g.met ? " (done)" : " (not done)"}</span>
            </span>
          </li>
        ))}
      </ul>

      {hintsUsed > 0 ? (
        <ol className="mt-3 space-y-1.5 rounded-md border border-brand-yellow/50 bg-brand-yellow/10 p-2.5 text-sm" aria-label="Hints used">
          {hints.slice(0, hintsUsed).map((h, i) => (
            <li key={i}><span className="font-bold">Hint {i + 1}.</span> {h}</li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={locked || !more} onClick={onHint} aria-label={more ? `Show hint ${hintsUsed + 1} of ${hints.length}. Each hint can cost a star.` : "No more hints"}>
          <Lightbulb className="mr-1.5 size-4" aria-hidden /> {more ? (hintsUsed === 0 ? `Hint (1 of ${hints.length})` : `Next hint (${hintsUsed + 1} of ${hints.length})`) : "No more hints"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={onReset}>
          <RotateCcw className="mr-1.5 size-4" aria-hidden /> Reset
        </Button>
        <Button type="button" size="sm" disabled={locked || !canFinish} onClick={onFinish} className={cn("ml-auto", ready && "motion-safe:animate-pulse")}>
          <Send className="mr-1.5 size-4" aria-hidden /> {finishLabel}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Hints cost stars: no hints and few {counter.label} give three stars.</p>
    </section>
  );
}
