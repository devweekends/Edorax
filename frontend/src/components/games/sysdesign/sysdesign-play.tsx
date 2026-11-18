"use client";

// System Design Runner. A production incident on the platform's own lab board: the player fixes a
// broken AWS design and presses Run tests, exactly like in a lab. When every check passes, the
// design is handed to the shell, which replays it with the shared engine (the same one the server
// uses) before it gives stars and XP.
import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";
import { HldBoard } from "@buildment/learning-ui/labs/HldBoard";
import { writeNameMode } from "@buildment/learning-ui/labs/aws-names";
import type { ChallengeReport } from "@buildment/learning-ui/labs/challenge";
import type { Board } from "@buildment/learning-ui/labs/types";
import { cn } from "@/lib/utils";
import { sysdesignEngine, type SysdesignRound, type SysdesignSubmission } from "@/shared/games/sysdesign/engine";
import { FrameButton, GameFrame } from "../game-frame";
import type { GamePlayProps } from "../types";

const LEVELS = ["EASY", "MEDIUM", "HARD"] as const;
const STEPS = [
  "Read the incident and look at the red parts of the board",
  "Change the design: size parts, add a cache, add a second zone",
  "Press Run tests until every check passes",
];
/** A short pause after the last check turns green, so the player sees the pass before the result opens. */
const BEAT_MS = 900;
const NAMES_KEY = "lab-names";

type Status = { tone: "idle" | "fail" | "pass" | "rejected"; text: string };

/** The first time a player opens a lab board here, show the real AWS service names. Their own choice is never overwritten. */
function preferAwsNames() {
  try {
    if (window.localStorage.getItem(NAMES_KEY) === null) writeNameMode("aws");
  } catch {
    // Storage can be blocked. The board then keeps plain names, which still work.
  }
}

export default function SysdesignPlay({ round, roundIndex, locked, sounds, onFinish }: GamePlayProps<SysdesignRound, SysdesignSubmission>) {
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Nothing has run yet. Press Run tests on the board." });
  const [hintsShown, setHintsShown] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);
  const spec = round.spec;
  const hints = spec.hints;

  // The shell remounts this component for every round and every retry, so the board starts fresh.
  useEffect(() => {
    preferAwsNames();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onRunComplete = useCallback(
    (report: ChallengeReport, board: Board) => {
      if (locked || finished.current) return;
      if (!report.allPass) {
        sounds.error();
        const first = report.checks.find((c) => !c.pass);
        setStatus({ tone: "fail", text: `${report.passed} of ${report.total} checks pass. The results panel shows what fails${first ? `, starting with "${first.label}"` : ""}.` });
        return;
      }
      // The lab lets you type any number; the game checks the board against its own rules as well.
      const local = sysdesignEngine.verify(round, { board });
      if (!local.passed) {
        sounds.error();
        setStatus({ tone: "rejected", text: local.message });
        return;
      }
      finished.current = true;
      sounds.ok();
      setStatus({ tone: "pass", text: `All ${report.total} checks pass.` });
      timer.current = setTimeout(() => {
        setStatus({ tone: "pass", text: `All ${report.total} checks pass. Your result is below.` });
        onFinish({ board });
      }, BEAT_MS);
    },
    [locked, round, sounds, onFinish],
  );

  function showHint() {
    sounds.key();
    setHintsShown((n) => Math.min(hints.length, n + 1));
  }

  return (
    <GameFrame
      level={LEVELS[roundIndex] ?? "EASY"}
      levelNumber={roundIndex + 1}
      title={round.title}
      steps={STEPS}
      brief={round.brief}
      actions={
        hints.length > 0 ? (
          <FrameButton onClick={showHint} disabled={hintsShown >= hints.length} title="Show the next hint">
            <Lightbulb className="size-3.5" aria-hidden /> {hintsShown === 0 ? "Hint" : `Hint ${hintsShown} of ${hints.length}`}
          </FrameButton>
        ) : null
      }
      below={
        <div className="space-y-3">
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "text-sm font-medium",
              status.tone === "pass" && "text-emerald-700 dark:text-emerald-400",
              (status.tone === "fail" || status.tone === "rejected") && "text-red-700 dark:text-red-400",
              status.tone === "idle" && "text-muted-foreground",
            )}
          >
            {status.text}
          </p>
          {hintsShown > 0 ? (
            <ol className="space-y-1.5 border-l-2 border-primary pl-3 text-sm" aria-label="Hints">
              {hints.slice(0, hintsShown).map((hint, i) => (
                <li key={i}>
                  <span className="mr-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hint {i + 1}</span>
                  {hint}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      }
    >
      <HldBoard spec={spec} onRunComplete={onRunComplete} />
    </GameFrame>
  );
}
