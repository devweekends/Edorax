"use client";

import { useState } from "react";
import { COBALT, INK, LINE, MUTED, PAPER, TINT } from "./brand";
import { StepHeading, type StepProps } from "./step-frame";
import s from "./try-it.module.css";

type Answer = { key: "A" | "B" | "C"; label: string; feedback: string };

const ANSWERS: Answer[] = [
  { key: "A", label: "Asks a name server where edorax.com lives", feedback: "Right. Your phone asks DNS for the address first." },
  { key: "B", label: "Connects straight to the website", feedback: "Not quite. To connect, your phone first needs an address, and it only knows the name." },
  { key: "C", label: "Downloads the page from Google", feedback: "Not quite. Google is not involved here. Your phone first needs the address for the name." },
];

// Step 1, a taste of a course chapter: one question from the networking course.
export function QuestionStep({ onSolved, headingRef }: StepProps) {
  const [picked, setPicked] = useState<Answer["key"] | null>(null);
  const answer = ANSWERS.find((a) => a.key === picked);
  const right = picked === "A";

  function pick(key: Answer["key"]) {
    setPicked(key);
    if (key === "A") onSolved();
  }

  return (
    <div className={s.stepBody}>
      <StepHeading eyebrow="Computer networking, chapter 3" headingRef={headingRef}>
        You type edorax.com and press Go. What does your phone do first?
      </StepHeading>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {ANSWERS.map((a) => {
          const chosen = a.key === picked;
          return (
            <button
              key={a.key}
              type="button"
              className={s.answer}
              aria-pressed={chosen}
              onClick={() => pick(a.key)}
              style={{
                minHeight: "52px",
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "16px",
                display: "flex",
                gap: "14px",
                alignItems: "center",
                color: INK,
                background: chosen ? (right ? TINT : PAPER) : "#FFFFFF",
                border: `2px solid ${chosen ? (right ? COBALT : INK) : LINE}`,
              }}
            >
              <span style={{ fontWeight: 700, color: COBALT }}>{a.key}</span>
              {a.label}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, minHeight: "23px", color: right ? INK : MUTED }}>
        {answer?.feedback ?? ""}
      </p>
    </div>
  );
}
