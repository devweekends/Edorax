"use client";

import { useState } from "react";
import { BookOpen, Check, ChevronDown, Lightbulb, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StarRow } from "../celebration";
import { linuxCheatSheet, type LinuxRound } from "@/shared/games/linux/engine";

export type MissionStats = {
  done: boolean[];
  commands: number;
  hints: number;
  hintsTotal: number;
  /** Objectives that just ticked, for a short animation. */
  flash: number[];
};

/** How many stars the player can still reach with this many commands and hints. */
export function starsNow(round: LinuxRound, commands: number, hints: number): 1 | 2 | 3 {
  if (hints === 0 && commands <= round.par) return 3;
  if (hints <= 1 && commands <= round.par + 4) return 2;
  return 1;
}

/** The command counter against par: a bar that fills and changes colour as stars are lost. */
export function Counter({ round, stats, compact = false }: { round: LinuxRound; stats: MissionStats; compact?: boolean }) {
  const stars = starsNow(round, stats.commands, stats.hints);
  const width = Math.min(100, Math.round((stats.commands / Math.max(1, round.par + 4)) * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold" aria-label={`${stats.commands} commands, par ${round.par}`}>
          <span className="tabular-nums">{stats.commands}</span>
          <span className="text-muted-foreground"> / par {round.par}</span>
        </span>
        {compact ? null : <StarRow stars={stars} size="sm" />}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-300",
            stars === 3 ? "bg-emerald-500" : stars === 2 ? "bg-amber-500" : "bg-red-500",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/** The mission checklist. A tick pops in when an objective is done. */
export function Checklist({ round, stats }: { round: LinuxRound; stats: MissionStats }) {
  return (
    <ol className="space-y-2" aria-label="Objectives">
      {round.objectives.map((label, i) => {
        const done = stats.done[i] ?? false;
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent",
                stats.flash.includes(i) && "motion-safe:animate-[bm-pop_0.5s_ease-out_both]",
              )}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span
              className={cn(
                "leading-snug transition-colors",
                done ? "text-muted-foreground line-through decoration-emerald-500/60" : "text-foreground",
                stats.flash.includes(i) && "font-semibold",
              )}
            >
              {label}
              <span className="sr-only">{done ? " (done)" : " (not done yet)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A small "what works" list that opens on demand. */
export function CheatSheet() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="linux-cheat-sheet"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-secondary/60"
      >
        <span className="inline-flex items-center gap-2">
          <BookOpen className="size-4" aria-hidden /> What works here
        </span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id="linux-cheat-sheet" className="max-h-72 space-y-3 overflow-y-auto border-t border-border p-3 text-xs">
          {linuxCheatSheet().map((group) => (
            <div key={group.group}>
              <p className="mb-1 font-bold uppercase tracking-widest text-muted-foreground">{group.group}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <code className="break-words rounded-sm bg-secondary px-1 py-0.5 font-mono text-[11px]">{item.usage}</code>
                    <span className="text-muted-foreground"> {item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-muted-foreground">Pipes (|), redirects (&gt; and &gt;&gt;), quotes, &amp;&amp;, $HOME and * all work. Tab finishes names. Arrow up repeats a command.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Hint and reset buttons. */
export function Controls({ stats, disabled, onHint, onReset }: { stats: MissionStats; disabled: boolean; onHint: () => void; onReset: () => void }) {
  const left = stats.hintsTotal - stats.hints;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="xs" disabled={disabled || left <= 0} onClick={onHint} aria-label={`Show the next hint, ${left} left`}>
        <Lightbulb aria-hidden /> Hint ({stats.hints}/{stats.hintsTotal})
      </Button>
      <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={onReset} aria-label="Reset this mission and start over">
        <RotateCcw aria-hidden /> Reset
      </Button>
    </div>
  );
}

export function MissionPanel({ round, stats, disabled, onHint, onReset }: { round: LinuxRound; stats: MissionStats; disabled: boolean; onHint: () => void; onReset: () => void }) {
  const doneCount = stats.done.filter(Boolean).length;
  return (
    <aside className="min-w-0 space-y-4 rounded-md border border-border bg-card p-4" aria-label="Mission">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Mission · {round.kind === "answer" ? "answer with submit" : "fix the server"}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{round.story}</p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <span>Objectives</span>
          <span aria-label={`${doneCount} of ${round.objectives.length} done`}>
            {doneCount}/{round.objectives.length}
          </span>
        </div>
        <Checklist round={round} stats={stats} />
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">Commands</p>
        <Counter round={round} stats={stats} />
        <p className="mt-1.5 text-xs text-muted-foreground">3 stars: finish within par and use no hints. Help, history and man are free.</p>
      </div>
      <Controls stats={stats} disabled={disabled} onHint={onHint} onReset={onReset} />
      <CheatSheet />
    </aside>
  );
}
