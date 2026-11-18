"use client";

import { useState } from "react";
import { COBALT, INK, LINE, PAPER, TINT } from "./brand";
import { StepHeading, type StepProps } from "./step-frame";
import s from "./try-it.module.css";

type Answer = { key: "A" | "B" | "C"; label: string; feedback: string };

const ANSWERS: Answer[] = [
  { key: "A", label: "Asks a name server where edorax.com lives", feedback: "Right. Your phone asks DNS for the address first." },
  { key: "B", label: "Connects straight to the website", feedback: "Not quite. The answer is A: to connect, your phone first needs an address, and it only knows the name, so it asks DNS." },
  { key: "C", label: "Downloads the page from Google", feedback: "Not quite. The answer is A: Google is not involved. Your phone asks DNS for the address that goes with the name." },
];

// Step 1, a taste of a course chapter: one question from the networking course. One try:
// a wrong pick shows the right answer and the reason, then the visitor moves on.
export function QuestionStep({ onSolved, headingRef }: StepProps) {
  const [picked, setPicked] = useState<Answer["key"] | null>(null);
  const answer = ANSWERS.find((a) => a.key === picked);

  function pick(key: Answer["key"]) {
    if (picked) return;
    setPicked(key);
    onSolved(key === "A");
  }

  return (
    <div className={s.stepBody}>
      <StepHeading eyebrow="Computer networking, chapter 3" headingRef={headingRef}>
        You type edorax.com and press Go. What does your phone do first?
      </StepHeading>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {ANSWERS.map((a) => {
          const chosen = a.key === picked;
          // Once answered, the right answer is always marked, even if they picked another.
          const isAnswer = picked !== null && a.key === "A";
          return (
            <button
              key={a.key}
              type="button"
              className={s.answer}
              aria-pressed={chosen}
              aria-disabled={picked !== null}
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
                background: isAnswer ? TINT : chosen ? PAPER : "#FFFFFF",
                border: `2px solid ${isAnswer ? COBALT : chosen ? INK : LINE}`,
                cursor: picked ? "default" : "pointer",
              }}
            >
              <span style={{ fontWeight: 700, color: COBALT }}>{a.key}</span>
              <span style={{ flex: 1 }}>{a.label}</span>
              {isAnswer ? <span style={{ fontSize: "13px", fontWeight: 700, color: COBALT }}>Answer</span> : null}
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, minHeight: "23px", color: INK }}>
        {answer?.feedback ?? ""}
      </p>
    </div>
  );
}
