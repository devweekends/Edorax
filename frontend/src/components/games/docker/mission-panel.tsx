"use client";

import type { ReactNode } from "react";
import { CheckList, FrameButton, type FrameCheck } from "../game-frame";
import { cn } from "@/lib/utils";

export const LEVELS = ["EASY", "MEDIUM", "HARD"] as const;

export function levelOf(roundIndex: number): { level: string; levelNumber: number } {
  const i = Math.min(Math.max(roundIndex, 0), LEVELS.length - 1);
  return { level: LEVELS[i]!, levelNumber: i + 1 };
}

export type Primary = { label: string; onClick: () => void; disabled?: boolean; pulse?: boolean };

type ActionProps = {
  hints: string[];
  hintsUsed: number;
  onHint: () => void;
  onReset: () => void;
  primary: Primary;
  locked: boolean;
};

/** The buttons in the dark header bar: Hint, Reset and one green primary action. */
export function HeaderActions({ hints, hintsUsed, onHint, onReset, primary, locked }: ActionProps) {
  const left = hints.length - hintsUsed;
  return (
    <>
      <FrameButton
        onClick={onHint}
        disabled={locked || left <= 0}
        className="min-h-11 sm:min-h-9"
        title="Each hint can cost a star"
      >
        {left > 0 ? `Hint (${left} left)` : "No hints left"}
      </FrameButton>
      <FrameButton onClick={onReset} disabled={locked} className="min-h-11 sm:min-h-9">
        Reset
      </FrameButton>
      {/* On a phone the primary action sits in the bar at the bottom, so it is always in reach. */}
      <FrameButton tone="primary" onClick={primary.onClick} disabled={locked || primary.disabled} pulse={primary.pulse} className="hidden sm:inline-flex">
        {primary.label}
      </FrameButton>
    </>
  );
}

/** Phone only: the same primary action, pinned to the bottom of the screen while the game is in view. */
export function MobileBar({ primary, passed, total, locked }: { primary: Primary; passed: number; total: number; locked: boolean }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border border-border bg-card px-3 py-2 sm:hidden">
      <p className="flex-1 font-mono text-[12px] font-bold uppercase tracking-wider text-muted-foreground" aria-hidden>
        {passed}/{total} pass
      </p>
      <FrameButton tone="primary" onClick={primary.onClick} disabled={locked || primary.disabled} pulse={primary.pulse} className="min-h-11 min-w-32 justify-center">
        {primary.label}
      </FrameButton>
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {right ? <span className="font-mono text-[11px] font-bold text-muted-foreground">{right}</span> : null}
    </div>
  );
}

type PanelProps = {
  checks: FrameCheck[];
  counter: { noun: string; value: number; par: number; threeStarsAt: number };
  hints: string[];
  hintsUsed: number;
};

/** The checks (Wait or Pass), the count against par, and the hints already used. */
export function MissionPanel({ checks, counter, hints, hintsUsed }: PanelProps) {
  const { noun, value, par, threeStarsAt } = counter;
  const tone = value <= par ? "text-emerald-700 dark:text-emerald-400" : value <= threeStarsAt ? "text-foreground" : "text-amber-700 dark:text-amber-400";
  return (
    <div className="space-y-4">
      <CheckList checks={checks} />

      <section aria-label="Par" className="border border-border bg-card px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{noun} used</span>
          <span className="font-mono text-sm font-bold tabular-nums" aria-live="polite">
            <span className={tone}>{value}</span>
            <span className="text-muted-foreground"> / par {par}</span>
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">Three stars: no hints and {threeStarsAt} {noun} or fewer.</p>
      </section>

      {hintsUsed > 0 ? (
        <section aria-label="Hints used">
          <SectionLabel>Hints</SectionLabel>
          <ol className="mt-2 divide-y divide-border border border-border bg-card">
            {hints.slice(0, hintsUsed).map((h, i) => (
              <li key={i} className="flex gap-3 px-3 py-2.5 text-sm">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{i + 1}</span>
                <span>{h}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

export type StripTone = "good" | "bad" | "info";

const STRIP: Record<StripTone, string> = {
  good: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
  bad: "border-l-red-500 bg-red-50 dark:bg-red-950/40",
  info: "border-l-slate-400 bg-secondary",
};
const STRIP_TAG: Record<StripTone, string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-background text-muted-foreground",
};

/** A flat one-line message with a small tag, used for results and for order feedback. */
export function Strip({ tone, tag, children, role }: { tone: StripTone; tag: string; children: ReactNode; role?: "status" | "alert" }) {
  return (
    <div role={role} className={cn("flex items-start gap-3 border border-border border-l-4 px-3 py-2.5 text-sm", STRIP[tone])}>
      <span className={cn("mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider", STRIP_TAG[tone])}>{tag}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}
