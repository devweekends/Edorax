"use client";

import { useEffect, useState } from "react";
import s from "./try-it.module.css";

const WORDS = ["hands-on labs", "interactive labs", "learning", "practice"] as const;
const TYPE_MS = 70;
const DELETE_MS = 35;
const HOLD_MS = 1600;
const GAP_MS = 300;
// Two full cycles, then it rests on the first word, so the headline never moves forever.
const MAX_WORDS = WORDS.length * 2;

type Phase = "typing" | "holding" | "deleting";

/**
 * "The #1 platform for ..." with the last words typed out, held, deleted and typed
 * again. Screen readers get the whole sentence once; the typed words are hidden from
 * them. It pauses while the pointer is on it. With reduced motion the words swap whole,
 * with no typing and no blinking cursor.
 */
export function RotatingHeadline({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(0);
  const [chars, setChars] = useState<number>(WORDS[0].length);
  const [phase, setPhase] = useState<Phase>("holding");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const word = WORDS[shown % WORDS.length];
  const done = shown >= MAX_WORDS;

  useEffect(() => {
    if (paused || done) return;
    let delay: number;
    let step: () => void;
    if (reduced) {
      // Whole words, no typing.
      delay = HOLD_MS + 600;
      step = () => {
        const next = shown + 1;
        setShown(next);
        setChars(WORDS[next % WORDS.length].length);
      };
    } else if (phase === "typing") {
      if (chars < word.length) {
        delay = TYPE_MS;
        step = () => setChars((c) => c + 1);
      } else {
        delay = 0;
        step = () => setPhase("holding");
      }
    } else if (phase === "holding") {
      delay = HOLD_MS;
      step = () => setPhase("deleting");
    } else if (chars > 0) {
      delay = DELETE_MS;
      step = () => setChars((c) => c - 1);
    } else {
      delay = GAP_MS;
      step = () => {
        setShown((n) => n + 1);
        setPhase("typing");
      };
    }
    const id = window.setTimeout(step, delay);
    return () => window.clearTimeout(id);
  }, [paused, done, reduced, phase, chars, word, shown]);

  // At rest, show the first word in full.
  const text = done ? WORDS[0] : word.slice(0, chars);
  const typing = !reduced && !done;

  return (
    <h1 className={className} style={style} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <span className={s.srOnly}>The #1 platform for hands-on labs, interactive labs, learning and practice.</span>
      <span aria-hidden="true">
        The #1 platform for
        <span className={s.rotor}>
          {text}
          {typing ? <span className={s.caret} /> : <span style={{ color: "#FFC933" }}>.</span>}
        </span>
      </span>
    </h1>
  );
}
