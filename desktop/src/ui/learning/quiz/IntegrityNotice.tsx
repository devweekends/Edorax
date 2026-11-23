import { useContext, useEffect, useRef } from "react";
import { SecureCameraContext } from "./secure/camera-context";
import { useTransientNotice } from "./useTransientNotice";
import {
  INTEGRITY_NOTES_LINE,
  INTEGRITY_QUIZ_RULES,
} from "../../../../../server/src/shared/api/integrity";
import type { QuizIntegrity } from "@buildment/learning-ui/lib/integrity/use-quiz-integrity";

export function IntegrityNotice({
  integrity,
  onExitQuiz,
  autoStart = false,
}: {
  integrity: QuizIntegrity;
  onExitQuiz?: () => void;
  /** The gate already showed the rules, so a quiz without a camera starts at once. */
  autoStart?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const intro = integrity.dialog === "intro";
  const notice = useTransientNotice(integrity.notice);
  // A secure exam that needs the camera starts it for the learner; there is no "without camera" choice.
  const cameraRequired = useContext(SecureCameraContext);
  const skipIntro =
    autoStart && intro && (!integrity.camera.enabled || cameraRequired);
  useEffect(() => {
    if (skipIntro) integrity.begin(cameraRequired && integrity.camera.enabled);
  }, [skipIntro, cameraRequired, integrity]);
  useEffect(() => {
    const show = Boolean(integrity.dialog) && !skipIntro;
    if (show && !dialog.current?.open) dialog.current?.showModal();
    if (!show && dialog.current?.open) dialog.current.close();
  }, [integrity.dialog, skipIntro]);
  function close() {
    if (intro) integrity.begin(false);
    else integrity.closeInfo();
  }
  return (
    <div className="my-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={integrity.openInfo}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
        >
          Quiz integrity · {integrity.flagCount} notes
        </button>
        <span className="text-xs text-muted-foreground">
          {INTEGRITY_NOTES_LINE}
        </span>
      </div>
      {notice && (
        <p
          role="alert"
          className="rounded-lg border border-border bg-muted p-3 text-sm"
        >
          {notice.text}
        </p>
      )}
      {integrity.fullscreenPrompt && integrity.dialog !== "intro" && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="desktop-quiz-fullscreen-exit-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 text-foreground backdrop-blur-md"
        >
          <div className="w-[min(92vw,440px)] rounded-2xl border border-border bg-card p-7 text-foreground shadow-xl">
            <h2
              id="desktop-quiz-fullscreen-exit-title"
              className="text-2xl font-semibold"
            >
              You left full screen
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              You left full screen. This is noted for your mentor. Return to
              full screen to continue the quiz, or exit the quiz for now.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={integrity.returnToFullscreen}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Continue quiz
              </button>
              <button
                onClick={() => {
                  integrity.dismissFullscreenPrompt();
                  if (onExitQuiz) onExitQuiz();
                  else window.history.back();
                }}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
              >
                Exit the quiz
              </button>
            </div>
          </div>
        </div>
      )}
      {integrity.camera.status === "ON" && (
        <div className="flex items-center gap-3">
          <video
            ref={integrity.camera.attachVideo}
            muted
            autoPlay
            playsInline
            className="w-32 rounded-lg"
          />
          {!cameraRequired && (
            <button
              onClick={integrity.camera.turnOff}
              className="text-sm underline"
            >
              Turn camera off
            </button>
          )}
        </div>
      )}
      {cameraRequired &&
        integrity.camera.enabled &&
        !intro &&
        integrity.camera.status !== "ON" && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm"
          >
            <span>This exam needs your camera, and it is off right now.</span>
            <button
              onClick={() => void integrity.camera.start()}
              className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
            >
              Turn camera on
            </button>
          </div>
        )}
      {integrity.camera.issue && (
        <p role="status" className="text-sm text-muted-foreground">
          {integrity.camera.issue}
        </p>
      )}
      <dialog
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        className="m-auto w-[min(92vw,560px)] rounded-2xl border border-border bg-card p-7 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <h2 className="text-2xl font-semibold">Before you start</h2>
        <ol className="mt-3 grid gap-2 pl-5 text-sm leading-6">
          {INTEGRITY_QUIZ_RULES.map((rule) => (
            <li key={rule} className="list-decimal marker:font-semibold">
              {rule}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm font-semibold">{INTEGRITY_NOTES_LINE}</p>
        {integrity.camera.enabled && (
          <div className="mt-5 rounded-xl bg-muted p-4">
            <h3 className="font-semibold">Camera photos are your choice</h3>
            <p className="mt-2 text-sm leading-6">
              This course requests small 320 × 240 still photos about once a
              minute. No sound or video is recorded. Course mentors and admins
              can view them, photos are deleted after{" "}
              {integrity.session?.camera.retentionDays || 30} days. You can
              continue without a camera.
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={close}
            className="rounded-lg border border-border px-4 py-2"
          >
            {intro
              ? integrity.camera.enabled
                ? "Start without camera"
                : "Start quiz"
              : "Close"}
          </button>
          {integrity.camera.enabled && integrity.camera.status !== "ON" && (
            <button
              onClick={() => {
                if (intro) integrity.begin(true);
                else {
                  void integrity.camera.start();
                  integrity.closeInfo();
                }
              }}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              Turn on camera{intro ? " and start" : ""}
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
