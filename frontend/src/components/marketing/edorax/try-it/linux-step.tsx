"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { COBALT, GREEN, INK, LINE, MONO, MUTED, TINT } from "./brand";
import { LINUX_TASKS } from "./linux-tasks";
import { StepHeading, type StepProps } from "./step-frame";
import s from "./try-it.module.css";

const LinuxTerminal = dynamic(() => import("./linux-terminal"), {
  ssr: false,
  loading: () => <div className={s.terminal} aria-busy="true" style={{ minHeight: "220px" }} />,
});

/**
 * Step 3: a quick Linux lab. Nothing starts until the visitor presses Launch lab. The
 * terminal is a practice one that runs in the page; the real shell labs run on a real
 * machine in the desktop app, and the step says so.
 */
export function LinuxStep({ onSolved, headingRef }: StepProps) {
  const [launched, setLaunched] = useState(false);
  const [done, setDone] = useState(0);
  const finished = done >= LINUX_TASKS.length;

  function onProgress(count: number) {
    setDone(count);
    if (count >= LINUX_TASKS.length) onSolved(true);
  }

  return (
    <div className={s.stepBody}>
      <StepHeading eyebrow="Shell labs, a quick one" headingRef={headingRef}>
        Your first three Linux commands.
      </StepHeading>
      <ol className={s.taskList} aria-label="Tasks">
        {LINUX_TASKS.map((task, i) => {
          const ok = i < done;
          return (
            <li key={task.command} style={{ borderColor: ok ? COBALT : LINE, background: ok ? TINT : "#FFFFFF" }}>
              <span aria-hidden="true" className={s.taskMark} style={{ background: ok ? GREEN : "#FFFFFF", borderColor: ok ? GREEN : MUTED }}>
                {ok ? (
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 6.5 L5 9 L10 3" stroke="#FFFFFF" strokeWidth="2" fill="none" />
                  </svg>
                ) : null}
              </span>
              <span style={{ flex: 1 }}>
                {task.text}
                <span className={s.srOnly}>{ok ? ", done" : ""}</span>
              </span>
              <code style={{ fontFamily: MONO, fontSize: "14px", color: COBALT, fontWeight: 700 }}>{task.command}</code>
            </li>
          );
        })}
      </ol>
      {launched ? (
        <LinuxTerminal onProgress={onProgress} />
      ) : (
        <div className={s.launchBox}>
          <button type="button" className={s.primary} onClick={() => setLaunched(true)}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24">
              <path d="M7 4v16l13-8z" fill="currentColor" />
            </svg>
            Launch lab
          </button>
          <span style={{ fontSize: "14px", color: MUTED }}>Starts a practice terminal right here. Nothing to install.</span>
          <button type="button" className={s.skip} onClick={() => onSolved(false)}>
            Skip this lab
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, color: finished ? INK : MUTED, minHeight: "23px" }}>
        {finished ? (
          <>
            Well done. The real shell labs run on a real Linux machine in the{" "}
            <Link href="/labs/shell#download" style={{ color: COBALT, fontWeight: 700 }}>
              Edorax desktop app
            </Link>
            .
          </>
        ) : launched ? (
          "A practice terminal in your browser. It knows a few commands; type help to see them."
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
