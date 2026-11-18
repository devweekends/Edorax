"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckList, type FrameCheck } from "../game-frame";
import { linuxCheatSheet, type LinuxRound } from "@/shared/games/linux/engine";

export type MissionStats = {
  done: boolean[];
  commands: number;
  hints: number;
  hintsTotal: number;
  /** Objectives that just turned done, for a short tick animation. */
  flash: number[];
};

/** How many stars the player can still reach with this many commands and hints. */
export function starsNow(round: LinuxRound, commands: number, hints: number): 1 | 2 | 3 {
  if (hints === 0 && commands <= round.par) return 3;
  if (hints <= 1 && commands <= round.par + 4) return 2;
  return 1;
}

/** The objectives as checks: Wait until done, Pass when done. */
export function missionChecks(round: LinuxRound, stats: MissionStats): FrameCheck[] {
  const last = round.objectives.length - 1;
  return round.objectives.map((label, i) => ({
    id: String(i),
    label,
    state: stats.done[i] ? "pass" : "wait",
    flash: stats.flash.includes(i),
    detail: i === last && round.kind === "answer" && !stats.done[i] ? "Finish with: submit <your answer>" : undefined,
  }));
}

/** Commands used against par, in plain words, with the stars still in reach. */
export function CommandCount({ round, stats }: { round: LinuxRound; stats: MissionStats }) {
  const stars = starsNow(round, stats.commands, stats.hints);
  return (
    <section aria-label="Commands and stars">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Commands</h3>
      <div className="mt-2 border border-border bg-card px-3 py-2.5">
        <p className="text-sm font-medium">
          <span className="tabular-nums">{stats.commands}</span> {stats.commands === 1 ? "command" : "commands"}, par {round.par}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You can still get {stars} {stars === 1 ? "star" : "stars"}. For 3 stars, stay within par and use no hints. Each hint lowers your stars. help, man and history do not count.
        </p>
      </div>
    </section>
  );
}

/** "What works here": a closed list that opens on demand. Plain words, one line per command. */
export function CheatSheet() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="What works here">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="linux-cheat-sheet"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 border border-border bg-card px-3 text-left hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What works here</span>
        <ChevronDown className={cn("size-4 text-muted-foreground motion-safe:transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id="linux-cheat-sheet" className="max-h-80 space-y-4 overflow-y-auto border border-t-0 border-border bg-card p-3">
          {linuxCheatSheet().map((group) => (
            <div key={group.group}>
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{group.group}</p>
              <dl className="mt-1.5 divide-y divide-border">
                {group.items.map((item) => (
                  <div key={item.name} className="py-1.5">
                    <dt className="break-words font-mono text-[13px] font-bold">{item.usage}</dt>
                    <dd className="text-sm text-muted-foreground">{item.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            These also work: pipes (|), redirects (&gt; and &gt;&gt;), quotes, &amp;&amp;, $HOME and *. Press Tab to finish a name. Press the up arrow to repeat a command.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** The right-hand column: the checks, the command count and the cheat sheet. */
export function MissionPanel({ round, stats }: { round: LinuxRound; stats: MissionStats }) {
  return (
    <div className="min-w-0 space-y-5">
      <CheckList title="Checks" checks={missionChecks(round, stats)} />
      <CommandCount round={round} stats={stats} />
      <CheatSheet />
    </div>
  );
}
