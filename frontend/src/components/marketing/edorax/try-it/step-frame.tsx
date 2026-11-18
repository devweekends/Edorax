import type { ReactNode, Ref } from "react";
import { HEADING, MUTED } from "./brand";
import s from "./try-it.module.css";

export interface StepProps {
  /** Call once the visitor gets the step right; the panel then offers the next step. */
  onSolved: () => void;
  /** The step's heading, focused when the step opens so keyboard users land on it. */
  headingRef: Ref<HTMLHeadingElement>;
}

export function StepHeading({ eyebrow, children, headingRef }: { eyebrow: string; children: ReactNode; headingRef: Ref<HTMLHeadingElement> }) {
  return (
    <div>
      <div style={{ fontSize: "14px", color: MUTED }}>{eyebrow}</div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className={s.stepTitle}
        style={{ margin: "6px 0 0", fontFamily: HEADING, fontWeight: 700, fontSize: "21px", lineHeight: 1.3, letterSpacing: "-0.02em", outline: "none" }}
      >
        {children}
      </h2>
    </div>
  );
}
