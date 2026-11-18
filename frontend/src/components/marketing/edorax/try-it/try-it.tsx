"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Dot } from "@/components/brand/dot";
import { COBALT, HEADING, INK, LINE, MUTED, PAPER } from "./brand";
import { QuestionStep } from "./question-step";
import type { StepProps } from "./step-frame";
import { LIVE_STEPS, TRY_STEPS, type TryStepId } from "./steps";
import s from "./try-it.module.css";

// Only the first step ships with the page. The others load when they are needed, and
// the next one is fetched as soon as the current one is solved, so it opens at once.
const loaders = {
  order: () => import("./order-step").then((m) => m.OrderStep),
  linux: () => import("./linux-step").then((m) => m.LinuxStep),
  visual: () => import("./visual-step").then((m) => m.VisualStep),
};
const placeholder = () => <div style={{ minHeight: "320px" }} aria-busy="true" />;
const STEP_COMPONENTS: Partial<Record<TryStepId, ComponentType<StepProps>>> = {
  question: QuestionStep,
  order: dynamic(loaders.order, { loading: placeholder }),
  linux: dynamic(loaders.linux, { loading: placeholder }),
  visual: dynamic(loaders.visual, { loading: placeholder }),
};

const DONE_LINE = "Four for four. You have tried it all.";

/**
 * The landing page's try-it panel: a short run through every kind of learning on
 * Edorax. Each step opens the next one only when it is answered right. Steps marked
 * "soon" in TRY_STEPS (puzzles, voice tutors) show as slots until they are built.
 */
export function TryIt() {
  const [current, setCurrent] = useState(0);
  const [solved, setSolved] = useState<ReadonlySet<TryStepId>>(new Set());
  const moved = useRef(false);
  // Keyboard and screen reader users land on the new step's heading, not on the page top.
  // A callback ref, because later steps load on demand and mount after the step changes.
  // On a phone the Next button sits low on the screen, so bring the new step's top into view.
  const headingRef = useCallback((node: HTMLHeadingElement | null) => {
    if (!node || !moved.current) return;
    node.focus({ preventScroll: true });
    const panel = node.closest("[data-try-panel]");
    if (panel && panel.getBoundingClientRect().top < 0) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    }
  }, []);
  const progressRef = useRef<HTMLOListElement>(null);

  // Keep the current step's chip visible when the step list scrolls sideways on a phone.
  useEffect(() => {
    const list = progressRef.current;
    const chip = list?.querySelector<HTMLElement>("[aria-current='step']");
    if (!list || !chip) return;
    const chipLeft = chip.offsetLeft - list.offsetLeft;
    if (chipLeft < list.scrollLeft || chipLeft + chip.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, chipLeft - 16);
    }
  }, [current]);
  const finished = current >= LIVE_STEPS.length;
  const step = finished ? null : LIVE_STEPS[current];
  const stepSolved = step ? solved.has(step.id) : false;
  const next = LIVE_STEPS[current + 1];

  function markSolved() {
    if (!step) return;
    setSolved((prev) => new Set(prev).add(step.id));
    if (next && next.id in loaders) void loaders[next.id as keyof typeof loaders]();
  }

  function go(index: number) {
    moved.current = true;
    setCurrent(index);
  }

  const Step = step ? STEP_COMPONENTS[step.id] : undefined;
  const dotMood = finished ? "cheer" : stepSolved ? "wink" : (step?.dotMood ?? "think");
  const dotLine = finished ? DONE_LINE : stepSolved ? "You got it." : (step?.dotLine ?? "");

  return (
    <div id="try" className={s.tryIt}>
      <div className={s.dotRow}>
        <Dot mood={dotMood} size={112} />
        <div className={s.bubble}>{dotLine}</div>
      </div>
      <div className={s.panel} data-try-panel>
        <ol ref={progressRef} className={s.progress} aria-label="Try Edorax in a few steps">
          {TRY_STEPS.map((t) => {
            const live = LIVE_STEPS.findIndex((l) => l.id === t.id);
            const isCurrent = live === current;
            const done = solved.has(t.id);
            const reachable = live >= 0 && (done || isCurrent || (live > 0 && solved.has(LIVE_STEPS[live - 1].id)));
            const label = t.status === "soon" ? `${t.label}, soon` : t.label;
            const cls = `${s.chip} ${isCurrent ? s.chipCurrent : ""} ${done ? s.chipDone : ""} ${t.status === "soon" ? s.chipSoon : ""}`;
            return (
              <li key={t.id}>
                {reachable && !isCurrent ? (
                  <button type="button" className={cls} onClick={() => go(live)}>
                    {done ? <span aria-hidden="true">{"✓"}</span> : null}
                    {label}
                    <span className={s.srOnly}>{done ? ", done" : ""}</span>
                  </button>
                ) : (
                  <span className={cls} aria-current={isCurrent ? "step" : undefined}>
                    {label}
                    <span className={s.srOnly}>{isCurrent ? ", current step" : t.status === "live" ? ", opens after the step before it" : ""}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div key={step?.id ?? "done"} className={s.stepEnter}>
          {Step && step ? (
            <Step onSolved={markSolved} headingRef={headingRef} />
          ) : (
            <Finished headingRef={headingRef} onRestart={() => { setSolved(new Set()); go(0); }} />
          )}
        </div>
        {stepSolved && !finished ? (
          <div className={s.nextRow}>
            <button type="button" className={s.next} onClick={() => go(current + 1)}>
              {next ? next.nextLabel : "See what you tried"}
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
                <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" fill="none" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Finished({ headingRef, onRestart }: { headingRef: React.Ref<HTMLHeadingElement>; onRestart: () => void }) {
  const tried = LIVE_STEPS.map((t) => t.area).filter((a, i, all) => all.indexOf(a) === i);
  const soon = TRY_STEPS.filter((t) => t.status === "soon").map((t) => t.area.toLowerCase());
  return (
    <div className={s.stepBody}>
      <div>
        <div style={{ fontSize: "14px", color: MUTED }}>You tried {tried.slice(0, -1).join(", ")} and {tried[tried.length - 1]}</div>
        <h2 ref={headingRef} tabIndex={-1} className={s.stepTitle} style={{ margin: "6px 0 0", fontFamily: HEADING, fontWeight: 700, fontSize: "21px", lineHeight: 1.3, letterSpacing: "-0.02em", outline: "none" }}>
          That was Edorax in two minutes. The real thing goes much deeper.
        </h2>
      </div>
      <div className={s.finishLinks}>
        <Link href="/catalog" style={{ background: COBALT, color: PAPER }}>
          Browse courses
        </Link>
        <Link href="/labs" style={{ border: `2px solid ${INK}`, color: INK }}>
          Open the labs
        </Link>
        <Link href="/labs/shell#download" style={{ border: `2px solid ${LINE}`, color: INK }}>
          Get the desktop app
        </Link>
      </div>
      <p style={{ margin: 0, fontSize: "14px", color: MUTED }}>
        Coming to this panel soon: {soon.join(" and ")}.{" "}
        <button type="button" onClick={onRestart} className={s.textButton}>
          Start again
        </button>
      </p>
    </div>
  );
}
