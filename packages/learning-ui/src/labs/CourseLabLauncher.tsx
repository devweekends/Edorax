"use client";

import { useState } from "react";
import type { HldLabSpec } from "./types";
import { HldBoard } from "./HldBoard";
import { BOARD_CSS, colorOf, tint } from "./board-style";
import { COMPONENT_CATALOG } from "./catalog";
import { KindGlyph } from "./Glyph";

/**
 * Course chapters introduce a lab in prose first. Keep the reader compact until
 * the learner deliberately starts, then put the actual board in its focused
 * workspace. Gallery and authoring views continue to render the full board.
 */
export function CourseLabLauncher({ spec }: { spec: HldLabSpec }) {
  const [launched, setLaunched] = useState(false);
  const [hasLaunched, setHasLaunched] = useState(false);
  const previewNodes = (spec.startingBoard?.nodes ?? []).slice(0, 4);
  const targets = spec.levels[0]?.targets;
  const targetSummary = targets
    ? [
        typeof targets.rps === "number" ? { label: "Traffic", value: `${targets.rps.toLocaleString()} req/s` } : null,
        typeof targets.p99Ms === "number" ? { label: "Speed", value: `p99 < ${targets.p99Ms} ms` } : null,
        typeof targets.availability === "number" ? { label: "Availability", value: `${(targets.availability * 100).toFixed(1)}%` } : null,
        typeof targets.budgetPerHour === "number" ? { label: "Budget", value: `< $${targets.budgetPerHour.toFixed(2)}/hr` } : null,
      ].filter((target): target is { label: string; value: string } => target !== null)
    : [];

  const launch = () => {
    setHasLaunched(true);
    setLaunched(true);
  };

  return (
    <figure className="lab-board not-prose my-8 overflow-hidden rounded-[12px] border-[1.5px] border-border bg-[color:var(--lab-module)] text-[color:var(--lab-ink)] shadow-[0_3px_0_0_var(--lab-edge-shadow)]">
      <style>{BOARD_CSS}</style>

      <div className="flex items-center justify-between gap-3 bg-[color:var(--lab-inspector)] px-4 py-3 text-slate-100">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="lab-mono shrink-0 rounded-[4px] border border-sky-300/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-200">
            Hands-on lab
          </span>
          {/* A long title wraps on a phone, where one line would cut it off; from sm up there is room to keep one line. */}
          <span className="lab-display min-w-0 text-sm font-semibold sm:truncate">{spec.title}</span>
        </div>
        <span className="lab-mono hidden shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400 sm:inline">
          Focused workspace
        </span>
      </div>

      <div className="grid border-b border-border bg-[color:var(--lab-module)] sm:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0 px-5 py-4 sm:px-6">
          <div className="lab-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--lab-accent)]">Your task</div>
          <p className="mb-0 mt-1.5 text-sm leading-6 text-[color:var(--lab-ink2)]">{spec.purpose}</p>
        </div>
        {targetSummary.length > 0 ? (
          <div className="grid grid-cols-2 gap-px border-t border-border bg-[color:var(--lab-grid)] sm:border-l sm:border-t-0">
            {targetSummary.map((target) => (
              <div key={target.label} className="bg-[color:var(--lab-recessed)] px-3 py-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--lab-ink2)]">{target.label}</div>
                <div className="lab-mono mt-1 whitespace-nowrap text-[11px] font-bold text-[color:var(--lab-ink)]">{target.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative overflow-hidden bg-[color:var(--lab-canvas)]" aria-hidden="true">
        <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(circle,var(--lab-grid)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex items-center justify-between border-b border-border/70 px-4 py-2">
          <span className="lab-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--lab-ink2)]">Starting architecture</span>
          <span className="text-[10px] text-[color:var(--lab-ink2)]">Tune each tier, then run the checks</span>
        </div>
        <div className="custom-scrollbar relative overflow-x-auto px-5 py-7">
          <div className="mx-auto flex min-w-[560px] max-w-[680px] items-center justify-center">
            {previewNodes.map((node, index) => {
              const color = colorOf(node.kind);
              const component = COMPONENT_CATALOG[node.kind];
              return (
                <div key={node.id} className="contents">
                  {index > 0 ? (
                    <div className="relative mx-2 h-[2px] min-w-5 flex-1 bg-[color:var(--lab-grid)]">
                      <span className="absolute -right-0.5 -top-[3px] size-2 rotate-45 border-r-2 border-t-2 border-[color:var(--lab-grid)]" />
                    </div>
                  ) : null}
                  <div className="relative z-10 w-[112px] shrink-0 rounded-[7px] border-[1.5px] border-border bg-[color:var(--lab-module)] p-2.5 shadow-[0_3px_0_0_var(--lab-edge-shadow)]">
                    <div className="flex items-center gap-2">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-[5px]"
                        style={{ color, backgroundColor: tint(color, 14) }}
                      >
                        <KindGlyph kind={node.kind} size={17} />
                      </span>
                      <span className="min-w-0 text-[11px] font-bold leading-tight text-[color:var(--lab-ink)]">
                        {component.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5">
                      <span className="lab-mono text-[8px] font-bold uppercase tracking-wider text-[color:var(--lab-ink2)]">Configure</span>
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-700 bg-[color:var(--lab-inspector-2)] px-4 py-3.5 text-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold text-white">Build it without the lesson getting in the way.</p>
          <p className="m-0 mt-0.5 text-[11px] text-slate-400">Your work is kept when you exit and reopen the focused lab.</p>
        </div>
        <button
          type="button"
          onClick={launch}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[6px] border-b-2 border-sky-950 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-sky-500 active:translate-y-[2px] active:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        >
          <span>Open full-screen lab</span>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      {hasLaunched ? (
        <HldBoard
          spec={spec}
          fullscreenActive={launched}
          hideWhenInline
          onExitFullscreen={() => setLaunched(false)}
        />
      ) : null}
    </figure>
  );
}
