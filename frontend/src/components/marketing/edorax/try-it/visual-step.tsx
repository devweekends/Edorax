"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import type { RunScore } from "@buildment/learning-ui/labs/HldBoard";
import { COBALT, INK, MUTED, PAPER, TINT } from "./brand";
import { StepHeading, type StepProps } from "./step-frame";
import s from "./try-it.module.css";

// The real board and its drawing library load only after Launch visual lab is pressed.
const RealVisualLab = dynamic(() => import("./real-visual-lab"), {
  ssr: false,
  loading: () => (
    <div className={s.labLoading} role="status">
      Opening the lab...
    </div>
  ),
});

/**
 * Step 4: the real Edorax visual lab, full screen. The visitor sizes a three-tier
 * system for exam week, presses Run tests and reads every check. The step is solved
 * when a run passes every check; the board's own hints and Solution button help.
 */
export function VisualStep({ onSolved, headingRef }: StepProps) {
  const [open, setOpen] = useState(false);
  const launchRef = useRef<HTMLButtonElement>(null);
  const [best, setBest] = useState<RunScore | null>(null);
  const passed = best?.allPass === true;

  // Any finished run opens the next step, so nobody is stuck here; a full pass counts as right.
  function onRunDone(score: RunScore) {
    setBest((prev) => (!prev || score.passed > prev.passed ? score : prev));
    onSolved(score.allPass);
  }

  return (
    <div className={s.stepBody}>
      <StepHeading eyebrow="Visual labs, the real thing" headingRef={headingRef}>
        Exam week: 10,000 students at once. Make the system hold.
      </StepHeading>
      <div className={s.labPreview}>
        <svg viewBox="0 0 270 110" width="100%" role="img" aria-label="The lab board: users, a load balancer, an app server and a database, with one zone going down" style={{ display: "block", maxWidth: "300px" }}>
          <path d="M60 30 H100 M160 30 H200 M230 46 V74 M200 90 H160" stroke={INK} strokeWidth="2.5" fill="none" />
          <rect x="4" y="14" width="56" height="32" fill={COBALT} />
          <text x="32" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={PAPER}>Users</text>
          <rect x="100" y="14" width="60" height="32" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <text x="130" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>Balancer</text>
          <rect x="200" y="14" width="60" height="32" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
          <text x="230" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>App</text>
          <rect x="100" y="74" width="60" height="32" fill={INK} />
          <text x="130" y="94" textAnchor="middle" fontSize="11" fontWeight="700" fill={PAPER}>Database</text>
          <rect x="200" y="74" width="60" height="32" fill="#FFFFFF" stroke="#B42318" strokeWidth="2" strokeDasharray="4 3" />
          <text x="230" y="94" textAnchor="middle" fontSize="10" fontWeight="700" fill="#B42318">Zone down</text>
        </svg>
        <ul className={s.labPoints}>
          <li>Size each part and spread it over two zones</li>
          <li>Press Run tests and watch the traffic</li>
          <li>Pass every check: speed, uptime and budget</li>
        </ul>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
        <button ref={launchRef} type="button" className={s.primary} onClick={() => setOpen(true)} aria-haspopup="dialog">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          {best ? "Open the lab again" : "Launch visual lab"}
        </button>
        <span style={{ fontSize: "14px", color: MUTED }}>Opens full screen. Press Esc to come back.</span>
        {!best ? (
          <button type="button" className={s.skip} onClick={() => onSolved(false)}>
            Skip this lab
          </button>
        ) : null}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, color: passed ? INK : MUTED, minHeight: "23px", background: passed ? TINT : "transparent", padding: passed ? "10px 12px" : 0 }}>
        {passed && best ? (
          <>
            All {best.total} checks passed, on the same board the system design course uses.{" "}
            <Link href="/labs/visual" style={{ color: COBALT, fontWeight: 700 }}>
              See all visual labs
            </Link>
          </>
        ) : best ? (
          `Best run so far: ${best.passed} of ${best.total} checks. Try again, open the board's Solution, or move on.`
        ) : (
          ""
        )}
      </p>
      {open ? <RealVisualLab
          onClose={() => {
            setOpen(false);
            // Back from full screen, keyboard users carry on from the button that opened it.
            requestAnimationFrame(() => launchRef.current?.focus());
          }}
          onRunDone={onRunDone}
        /> : null}
    </div>
  );
}
