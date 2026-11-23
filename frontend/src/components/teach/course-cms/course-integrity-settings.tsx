"use client";

import { useState, useTransition } from "react";
import { Camera, ShieldCheck } from "lucide-react";
import { updateCourseIntegrity } from "@/server/actions/modules";
import {
  INTEGRITY_LIMITS,
  INTEGRITY_MODE_LABELS,
  INTEGRITY_MODES,
  type IntegrityMode,
} from "@/shared/api/integrity";

// Quiz integrity signals are always on in quiz chapters. The camera is the one
// part an instructor opts into, per course. It stays off by default and is never required.

export function CourseIntegritySettings({
  courseId,
  integritySnapshots,
  integrityMode = "STANDARD",
}: {
  courseId: string;
  integritySnapshots: boolean;
  integrityMode?: IntegrityMode;
}) {
  const [mode, setMode] = useState<IntegrityMode>(integrityMode);

  const [enabled, setEnabled] = useState(integritySnapshots);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCourseIntegrity({
        courseId,
        integritySnapshots: next,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setEnabled(previous);
        setError(result.errors[0] ?? "Could not save. Try again.");
      }
    });
  };
  // The integrity mode is a course-wide setting that controls how strict the signals are. It is not per-learner, and it is not per-quiz. The instructor can change it at any time, and it applies to all learners in the course.
  const changeMode = (next: IntegrityMode) => {
    const previous = mode;
    setMode(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCourseIntegrity({
        courseId,
        integrityMode: next,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setMode(previous);
        setError(result.errors[0] ?? "Could not save. Try again.");
      }
    });
  };

  return (
    <section
      id="quiz-integrity"
      aria-labelledby="quiz-integrity-title"
      className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex items-start gap-3 border-b bg-muted/15 px-5 py-4 sm:px-6">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div>
          <h2 id="quiz-integrity-title" className="text-base font-semibold">
            Quiz integrity
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quiz chapters always note tab switches, leaving full screen, blocked
            copy and paste, and similar signals for mentors. Nothing fails a
            quiz automatically.
          </p>
        </div>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {/* Exam mode */}
        <fieldset
          className="space-y-2 rounded-xl border bg-muted/25 p-4"
          disabled={pending}
        >
          <legend className="px-1 text-sm font-medium">Exam mode</legend>
          {INTEGRITY_MODES.map((option) => (
            <label key={option} className="flex items-start gap-3">
              <input
                type="radio"
                name="integrity-mode"
                checked={mode === option}
                onChange={() => changeMode(option)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="text-sm">
                <span className="font-medium">
                  {INTEGRITY_MODE_LABELS[option]}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {option === "STANDARD"
                    ? "Quick quizzes in the browser: full screen, tab-switch notes, blocked copy and paste."
                    : "Final exams in the Edorax desktop app: pre-check for restricted apps, extra screens and virtual machines, full lockdown, and a heartbeat. Learners need the app, and a camera if photos are on. Answers from the browser are refused."}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-3 rounded-xl border bg-muted/25 p-4">
          <input
            type="checkbox"
            checked={enabled}
            disabled={pending}
            onChange={(event) => change(event.target.checked)}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Camera className="size-4" aria-hidden />
              Ask learners for camera photos during quizzes
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Learners choose yes or no on a consent screen before each quiz. A
              small {INTEGRITY_LIMITS.snapshotWidth} x{" "}
              {INTEGRITY_LIMITS.snapshotHeight} still is taken about once a
              minute (around 10 KB, fine on weak connections). Only this
              course&apos;s mentors and admins can see the photos, and they are
              deleted after {INTEGRITY_LIMITS.retentionDays} days. No camera, or
              saying no, never blocks the quiz. The mentor sees &quot;camera
              off&quot;.
            </span>
          </span>
        </label>
        <p role="status" aria-live="polite" className="min-h-5 text-xs">
          {pending ? (
            <span className="text-muted-foreground">Saving…</span>
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : saved ? (
            <span className="text-muted-foreground">Saved.</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}
