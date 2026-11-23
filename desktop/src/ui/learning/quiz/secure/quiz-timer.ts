import { useCallback, useEffect, useRef, useState } from "react";

// The countdown for a quiz sitting. The length comes from the chapter's "estimated minutes",
// so instructors don't need a new setting. If a chapter has no minutes, the quiz simply has no timer.

/** The gate fires this when the clock hits zero. The quiz listens and saves whatever is answered. */
export const QUIZ_TIME_UP_EVENT = "buildment:quiz-time-up";
/** The quiz fires this once it has finished saving, so the gate knows it is safe to close. */
export const QUIZ_TIME_UP_DONE_EVENT = "buildment:quiz-time-up-done";

const KEY_PREFIX = "buildment:quiz-deadline:";

// We nudge the learner at these points (in seconds left) so the end never comes as a surprise.
const REMINDERS: ReadonlyArray<{ atSeconds: number; text: string }> = [
  { atSeconds: 300, text: "5 minutes left." },
  {
    atSeconds: 60,
    text: "1 minute left. Your answers will be saved for you when time is up.",
  },
];

function keyFor(chapterId: string) {
  return KEY_PREFIX + chapterId;
}

// Storage can be blocked or full, so every read and write is wrapped. A failure just means
// the timer can't survive a restart; it never breaks the quiz itself.
function readDeadline(chapterId: string): number | null {
  try {
    const raw = window.localStorage.getItem(keyFor(chapterId));
    const value = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveDeadline(chapterId: string, deadline: number) {
  try {
    window.localStorage.setItem(keyFor(chapterId), String(deadline));
  } catch {
    // Nothing to do. The timer still works for this sitting.
  }
}

function dropDeadline(chapterId: string) {
  try {
    window.localStorage.removeItem(keyFor(chapterId));
  } catch {
    // Same as above: harmless if it fails.
  }
}

/** Turns milliseconds into a clock like 07:05 or 1:02:09. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Runs the countdown while the quiz is active.
 *
 * The finish time is saved, so stepping out of the quiz and coming back does not hand out a
 * fresh clock. Once a saved finish time has passed, the next sitting starts a new one.
 */
export function useQuizTimer({
  chapterId,
  minutes,
  running,
  onExpire,
}: {
  chapterId: string;
  minutes: number | null | undefined;
  running: boolean;
  onExpire: () => void;
}) {
  const limitMs = minutes && minutes > 0 ? Math.round(minutes * 60_000) : 0;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);

  // Keep the latest callback in a ref so the interval never has to restart when the parent re-renders.
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!running || limitMs === 0) return;

    const saved = readDeadline(chapterId);
    const deadline = saved && saved > Date.now() ? saved : Date.now() + limitMs;
    saveDeadline(chapterId, deadline);

    // Skip reminders we have already passed, e.g. when someone returns with two minutes left.
    const reminded = new Set<number>();
    for (const { atSeconds } of REMINDERS) {
      if ((deadline - Date.now()) / 1000 <= atSeconds) reminded.add(atSeconds);
    }

    let reminderTimer: number | undefined;
    let expired = false;

    const tick = () => {
      const left = deadline - Date.now();
      setRemainingMs(Math.max(0, left));

      if (left <= 0) {
        if (!expired) {
          expired = true;
          window.clearInterval(interval);
          expireRef.current();
        }
        return;
      }
      for (const { atSeconds, text } of REMINDERS) {
        if (left / 1000 <= atSeconds && !reminded.has(atSeconds)) {
          reminded.add(atSeconds);
          setReminder(text);
          window.clearTimeout(reminderTimer);
          reminderTimer = window.setTimeout(() => setReminder(null), 6_000);
        }
      }
    };

    const interval = window.setInterval(tick, 250);
    tick();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(reminderTimer);
    };
  }, [running, limitMs, chapterId]);

  /** Forget the saved finish time, for when the quiz is truly over. */
  const forget = useCallback(() => dropDeadline(chapterId), [chapterId]);

  return {
    /** Null when there is no timer, or the quiz is not running. */
    remainingMs: running && limitMs > 0 ? remainingMs : null,
    reminder: running ? reminder : null,
    forget,
  };
}
