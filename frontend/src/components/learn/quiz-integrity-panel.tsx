"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, CameraOff, Eye, Maximize, ShieldCheck, X } from "lucide-react";
import { Dot } from "@/components/brand/dot";
import { Button, buttonVariants } from "@/components/ui/button";
import type { QuizIntegrity } from "@/lib/integrity/use-quiz-integrity";
import {
  INTEGRITY_LIMITS,
  INTEGRITY_NOTES_LINE,
  INTEGRITY_QUIZ_RULES,
} from "@/shared/api/integrity";
import { useTransientNotice } from "@/lib/integrity/use-transient-notice";
import { cn } from "@/lib/utils";

// What the learner sees of quiz integrity: a "Proctored" badge with a count, short
// notices, a gentle full-screen banner and one dialog that says plainly what is
// noted and, when the course uses it, asks before the camera turns on. Nothing here
// stops a learner from finishing the quiz: every signal is a note for the mentor.

const NOTED = [
  "Leaving this tab, window, or full screen",
  "Copy, paste, or right-click attempts (blocked), and screenshot keys (noticed when the browser reports them)",
  "Your pointer leaving the page, or a second screen when the browser reports it",
  "Answers submitted unusually quickly",
];

const CAMERA_HELP: Record<string, string> = {
  denied:
    "Your browser blocked the camera. You can allow it for this site (the camera icon in the address bar) and try again.",
  "no-camera": "We could not find a camera on this device.",
  stopped: "Your camera stopped.",
  unsupported: "This browser cannot use a camera.",
  error: "The camera did not start.",
};

function IntegrityDialog({
  integrity,
  questionCount,
}: {
  integrity: QuizIntegrity;
  questionCount: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const params = useParams<{ courseSlug?: string }>();
  const { dialog, camera, session } = integrity;
  const open = dialog !== null && session !== null;
  const intro = dialog === "intro";
  const [useCamera, setUseCamera] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const retention =
    session?.camera.retentionDays ?? INTEGRITY_LIMITS.retentionDays;
  const details = (
    <>
      <ul className="mt-3 grid gap-2 pl-5 text-base leading-6 text-foreground marker:text-muted-foreground">
        {NOTED.map((item) => (
          <li key={item} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
      {integrity.fullscreenSupported ? (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          The quiz opens in full screen. You can leave it with Esc. That is
          noted, never blocked.
        </p>
      ) : null}
      {camera.enabled ? (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          Camera photos are small stills about once a minute, with no video or
          sound. Mentors of this course and admins can see them. They are
          deleted after {retention} days. If the camera is off or stops, the
          quiz keeps going.
        </p>
      ) : null}
    </>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby="quiz-integrity-title"
      onCancel={(event) => {
        // Esc never starts the quiz. Before the quiz it does nothing; later it closes the notes.
        event.preventDefault();
        if (!intro) integrity.closeInfo();
      }}
      className="fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-foreground/50 open:flex open:items-center open:justify-center open:p-4"
    >
      {open ? (
        <div className="flex max-h-[min(46rem,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
          <div className="min-h-0 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
            {intro ? (
              <>
                <p className="text-sm font-bold text-primary">
                  Before you start
                </p>
                <h2
                  id="quiz-integrity-title"
                  className="mt-2 text-[28px] leading-[1.15] tracking-[-0.035em]"
                >
                  Ready when you are
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {questionCount > 0 ? (
                    <span className="rounded-sm bg-secondary px-2.5 py-1 text-[15px] font-bold text-primary">
                      {questionCount} questions
                    </span>
                  ) : null}
                  <span className="rounded-sm bg-secondary px-2.5 py-1 text-[15px] font-bold text-primary">
                    No timer
                  </span>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <Dot mood="happy" size={72} />
                  <p className="border border-border bg-card px-4 py-3 text-base font-bold leading-snug">
                    Questions show up one at a time. Take your time.
                  </p>
                </div>
                <div className="mt-6">
                  <p className="flex items-center gap-2 text-base font-bold">
                    <Eye className="size-5 shrink-0 text-primary" aria-hidden />
                    Read these rules before you begin
                  </p>
                  <ol className="mt-3 grid gap-2 pl-5 text-base leading-6">
                    {INTEGRITY_QUIZ_RULES.map((rule) => (
                      <li
                        key={rule}
                        className="list-decimal marker:font-bold marker:text-primary"
                      >
                        {rule}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-base font-bold">
                    {INTEGRITY_NOTES_LINE}
                  </p>
                </div>
                {camera.enabled ? (
                  <div className="mt-4 flex min-h-14 items-center gap-3.5 border-2 border-input px-4 py-2">
                    <Camera
                      className="size-6 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span
                      id="quiz-camera-label"
                      className="flex-1 text-base font-bold"
                    >
                      Use my camera (optional)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useCamera}
                      aria-labelledby="quiz-camera-label"
                      onClick={() => setUseCamera((on) => !on)}
                      className={cn(
                        "relative h-8 w-14 shrink-0 rounded-full border-2 outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                        useCamera
                          ? "border-primary bg-primary"
                          : "border-muted-foreground bg-card",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 size-6 rounded-full transition-all",
                          useCamera
                            ? "left-[calc(100%-1.625rem)] bg-primary-foreground"
                            : "left-0.5 bg-muted-foreground",
                        )}
                      />
                    </button>
                  </div>
                ) : null}
                <details className="mt-3 group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-base font-bold text-primary underline underline-offset-4 [&::-webkit-details-marker]:hidden">
                    What gets noted?
                  </summary>
                  {details}
                </details>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-primary">
                      <ShieldCheck className="size-4" aria-hidden />
                      Proctored quiz
                    </p>
                    <h2
                      id="quiz-integrity-title"
                      className="mt-2 text-[28px] leading-[1.15] tracking-[-0.035em]"
                    >
                      What gets noted
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={integrity.closeInfo}
                    aria-label="Close"
                    className="grid size-11 shrink-0 place-items-center rounded-md text-foreground outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <p className="mt-2 text-base text-muted-foreground">
                  {INTEGRITY_NOTES_LINE}
                </p>
                {details}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-5 py-4 sm:px-8">
            {intro ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    // Full screen must be asked for inside this click, or the browser refuses.
                    void document.documentElement
                      .requestFullscreen?.()
                      .catch(() => undefined);
                    integrity.begin(camera.enabled && useCamera);
                  }}
                >
                  I understand, start the quiz
                </Button>
                <Link
                  href={
                    params.courseSlug
                      ? `/courses/${params.courseSlug}`
                      : "/my-courses"
                  }
                  className="inline-flex min-h-11 items-center justify-center text-base font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Not now, back to the course
                </Link>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {camera.enabled && camera.status === "ON" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      camera.turnOff();
                      integrity.closeInfo();
                    }}
                  >
                    <CameraOff aria-hidden />
                    Turn camera off
                  </Button>
                ) : camera.enabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void camera.start();
                      integrity.closeInfo();
                    }}
                  >
                    <Camera aria-hidden />
                    Turn camera on
                  </Button>
                ) : null}
                <Button type="button" onClick={integrity.closeInfo}>
                  Back to the quiz
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Kept mounted so the stream survives re-renders; tiny and visible while on, so the learner always knows. */
function CameraPreview({
  attach,
  visible,
}: {
  attach: (element: HTMLVideoElement | null) => void;
  visible: boolean;
}) {
  return (
    <video
      ref={attach}
      muted
      playsInline
      aria-hidden
      className={cn(
        "pointer-events-none fixed bottom-20 right-3 z-40 h-[54px] w-[72px] rounded-md border border-border bg-muted object-cover  sm:bottom-4",
        !visible && "hidden",
      )}
    />
  );
}

function FullscreenExitOverlay({
  integrity,
  onExitQuiz,
}: {
  integrity: QuizIntegrity;
  onExitQuiz?: () => void;
}) {
  const params = useParams<{ courseSlug?: string }>();
  const open =
    integrity.active &&
    integrity.fullscreenPrompt &&
    integrity.dialog !== "intro";
  if (!open) return null;

  const exitHref = params.courseSlug
    ? `/courses/${params.courseSlug}`
    : "/my-courses";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="quiz-fullscreen-exit-title"
      aria-describedby="quiz-fullscreen-exit-desc"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/90 p-4 text-foreground backdrop-blur-md"
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <Maximize className="size-4" aria-hidden />
            Full screen exited
          </p>
          <h2
            id="quiz-fullscreen-exit-title"
            className="mt-2 text-[28px] leading-[1.15] tracking-[-0.035em] text-card-foreground"
          >
            You left full screen
          </h2>
          <p
            id="quiz-fullscreen-exit-desc"
            className="mt-3 text-base leading-6 text-muted-foreground"
          >
            You left full screen. This is noted for your mentor. Return to full
            screen to continue the quiz, or exit the quiz for now.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:px-8">
          <Button
            type="button"
            size="lg"
            className="w-full gap-2"
            onClick={integrity.returnToFullscreen}
          >
            <Maximize className="size-4" aria-hidden />
            Continue quiz
          </Button>
          {onExitQuiz ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => {
                integrity.dismissFullscreenPrompt();
                onExitQuiz();
              }}
            >
              Exit the quiz
            </Button>
          ) : (
            // A link styled as the button: our Button has no asChild, which broke the build.
            <Link
              href={exitHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full",
              )}
              onClick={integrity.dismissFullscreenPrompt}
            >
              Exit the quiz
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuizIntegrityPanel({
  integrity,
  questionCount = 0,
  onExitQuiz,
}: {
  integrity: QuizIntegrity;
  questionCount?: number;
  onExitQuiz?: () => void;
}) {
  const { camera } = integrity;
  const notice = useTransientNotice(integrity.notice);
  const cameraOn = camera.status === "ON";

  return (
    <>
      <CameraPreview attach={camera.attachVideo} visible={cameraOn} />
      {integrity.active ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={integrity.openInfo}
              aria-label={`Proctored quiz. ${integrity.flagCount} ${integrity.flagCount === 1 ? "note" : "notes"} for your mentor. Show what is noted.`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-input bg-card px-3 text-sm font-bold text-foreground transition-colors hover:border-primary"
            >
              <ShieldCheck className="size-3.5 text-primary" aria-hidden />
              Proctored
              <span className="rounded-sm bg-secondary px-1.5 font-mono tabular-nums">
                {integrity.flagCount}
              </span>
            </button>
            {camera.enabled ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {cameraOn ? (
                  <Camera className="size-3.5" aria-hidden />
                ) : (
                  <CameraOff className="size-3.5" aria-hidden />
                )}
                {camera.starting
                  ? "Starting camera…"
                  : cameraOn
                    ? "Camera on"
                    : "Camera off"}
              </span>
            ) : null}
          </div>

          <p
            role="status"
            aria-live="polite"
            className={cn("text-sm text-foreground", !notice && "sr-only")}
          >
            {notice?.text ?? ""}
          </p>

          {camera.enabled && camera.status === "UNAVAILABLE" ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
            >
              <CameraOff className="size-4 text-muted-foreground" aria-hidden />
              <span className="mr-auto text-muted-foreground">
                Camera is off. You can keep going.{" "}
                {camera.issue
                  ? (CAMERA_HELP[camera.issue] ?? CAMERA_HELP.error)
                  : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void camera.start()}
              >
                Try camera again
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <FullscreenExitOverlay integrity={integrity} onExitQuiz={onExitQuiz} />
      <IntegrityDialog integrity={integrity} questionCount={questionCount} />
    </>
  );
}
