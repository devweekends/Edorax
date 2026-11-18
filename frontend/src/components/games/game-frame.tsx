"use client";

import type { ReactNode } from "react";
import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";

// The frame every daily game sits in. It copies the lab board's look (a dark header bar with a
// level tag and the action button, a bench below, and a "checks" list with PASS and WAIT badges),
// so a game feels like part of the platform and learners already know where to look.

export type CheckState = "wait" | "pass" | "fail";
export type FrameCheck = { id: string; label: string; state: CheckState; detail?: string; /** Set for a moment when the check has just turned Pass, for a small tick animation. */ flash?: boolean };

type FrameButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** "primary" is the one thing to press next. There should be one per screen. */
  tone?: "primary" | "ghost";
  pulse?: boolean;
  title?: string;
  className?: string;
  "aria-pressed"?: boolean;
};

/** Buttons for the dark header bar. */
export function FrameButton({ children, onClick, disabled, tone = "ghost", pulse = false, title, className, ...rest }: FrameButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={rest["aria-pressed"]}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-[4px] px-3 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300",
        tone === "primary"
          ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:hover:bg-emerald-400"
          : "border border-slate-500/70 text-slate-200 hover:bg-white/10",
        pulse && tone === "primary" && "motion-safe:animate-pulse",
        className,
      )}
    >
      {children}
    </button>
  );
}

const STATE_LOOK: Record<CheckState, { label: string; pill: string; icon: ReactNode }> = {
  wait: { label: "Wait", pill: "bg-secondary text-muted-foreground", icon: <Circle className="size-3" aria-hidden /> },
  pass: { label: "Pass", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", icon: <Check className="size-3" aria-hidden /> },
  fail: { label: "Miss", pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", icon: <X className="size-3" aria-hidden /> },
};

/** The list of things to get done, each Wait until it is Pass. The same idea as the lab's checks. */
export function CheckList({ title = "Checks", checks }: { title?: string; checks: FrameCheck[] }) {
  const passed = checks.filter((c) => c.state === "pass").length;
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <span className="font-mono text-[11px] font-bold text-muted-foreground">{passed}/{checks.length}</span>
      </div>
      <ul className="mt-2 divide-y divide-border border border-border bg-card">
        {checks.map((check) => {
          const look = STATE_LOOK[check.state];
          return (
            <li key={check.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className={cn("mt-0.5 inline-flex min-w-14 items-center justify-center gap-1 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider", look.pill, check.flash && "motion-safe:animate-[bm-pop_0.4s_ease-out_both]")}>
                {look.icon}
                {look.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", check.state === "pass" ? "text-muted-foreground line-through decoration-emerald-500/60" : "font-medium text-foreground")}>{check.label}</span>
                {check.detail ? <span className="block text-xs text-muted-foreground">{check.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Three short steps that say what to do, shown at the top of every game. */
export function HowToPlay({ steps }: { steps: string[] }) {
  return (
    <ol className="grid gap-x-6 gap-y-2 border-b border-border bg-secondary/50 px-4 py-3 sm:grid-cols-3" aria-label="How to play">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm leading-snug">
          <span className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">{i + 1}</span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

type FrameProps = {
  /** "EASY", "MEDIUM" or "HARD". */
  level: string;
  levelNumber: number;
  title: string;
  /** What the player does, in 3 short steps. */
  steps: string[];
  /** Buttons for the header bar, right side. */
  actions?: ReactNode;
  /** The story of the round: what is wrong or what to do, in plain words. */
  brief: string;
  children: ReactNode;
  /** Shown under the play area. */
  below?: ReactNode;
  className?: string;
};

export function GameFrame({ level, levelNumber, title, steps, actions, brief, children, below, className }: FrameProps) {
  return (
    <section className={cn("overflow-hidden border border-border bg-card", className)} aria-label={`${level} round: ${title}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#0f1b33] px-4 py-3 text-slate-100">
        <span className="rounded-[4px] border border-slate-500/70 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-sky-300">
          LVL {levelNumber} · {level}
        </span>
        <h2 className="min-w-0 flex-1 text-base font-bold leading-tight tracking-tight">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </header>
      <HowToPlay steps={steps} />
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">The brief</p>
        <p className="mt-1 max-w-3xl text-[15px] leading-relaxed">{brief}</p>
      </div>
      <div className="p-4">{children}</div>
      {below ? <div className="border-t border-border bg-secondary/30 p-4">{below}</div> : null}
    </section>
  );
}
