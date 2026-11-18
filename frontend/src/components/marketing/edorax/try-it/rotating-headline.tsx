"use client";

import { useEffect, useState } from "react";
import s from "./try-it.module.css";

const WORDS = ["hands-on labs", "interactive labs", "learning", "practice"] as const;
const INTERVAL_MS = 2600;
// Two full cycles, then it rests on the first word, so the headline never moves forever.
const MAX_TICKS = WORDS.length * 2;

/**
 * "The number one platform for ..." with the last words cycling. Screen readers get
 * the whole sentence once; the moving words are hidden from them. It pauses while the
 * pointer or focus is on it, and with reduced motion the words swap without moving.
 */
export function RotatingHeadline({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || tick >= MAX_TICKS) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [paused, tick]);

  const word = WORDS[tick % WORDS.length];

  return (
    <h1
      className={className}
      style={style}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span className={s.srOnly}>The number one platform for hands-on labs, interactive labs, learning and practice.</span>
      <span aria-hidden="true">
        The number one platform for
        <span className={s.rotor}>
          <span key={word} className={s.rotorWord}>
            {word}
            <span style={{ color: "#FFC933" }}>.</span>
          </span>
        </span>
      </span>
    </h1>
  );
}
