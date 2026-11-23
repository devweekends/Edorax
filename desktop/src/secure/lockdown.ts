import {
  clipboard,
  powerSaveBlocker,
  screen,
  type BrowserWindow,
} from "electron";
import { SECURE_LIMITS } from "../../../server/src/shared/api/integrity";
import { isBlockedShortcut } from "./shortcuts";

// What the protected window enforces while a quiz runs. The app notices window switches, leaving
// full screen and screenshot keys itself, so it never depends on the page. The shared quiz hook may
// report the same moments, and the server keeps only one note of two that land together.
// Only the app can also block capture, keep the window on top, replace a screenshot on the
// clipboard, refuse developer tools and watch the screens.
//
// Windows and Mac differ here. Alt+Tab and Cmd+Tab belong to the operating system, so they
// are detected (the window loses focus) and logged, not blocked. Content protection hides the
// window from screenshots and screen sharing on Windows 10 2004+ and macOS; other systems ignore it.

export type LockdownHooks = {
  event(
    type:
      | "SECOND_SCREEN"
      | "WINDOW_BLUR"
      | "FULLSCREEN_EXIT"
      | "SCREENSHOT_KEY",
    meta: Record<string, string | number>,
  ): void;
  notice(text: string): void;
  /** The learner pressed the window's close button. Resolves true once they confirmed and the sitting was ended. */
  requestLeave(): Promise<boolean>;
};

export function enterLockdown(
  window: BrowserWindow,
  hooks: LockdownHooks,
): () => void {
  const contents = window.webContents;
  const wasFullScreen = window.isFullScreen();
  clipboard.clear();
  window.setFullScreen(true);
  window.setAlwaysOnTop(true, "floating");
  window.setContentProtection(true);
  const sleepBlocker = powerSaveBlocker.start("prevent-display-sleep");

  const NOTICE = "Screenshots are not allowed during the exam.";
  // A screenshot lands on the clipboard a moment after the key. Replacing it means pasting later
  // shows this sentence and never the picture.
  const replaceScreenshot = () => {
    // Electron 45's clipboard writes are promises: a refused write must not become an unhandled rejection.
    const write = () => {
      void clipboard.writeText(NOTICE).catch(() => undefined);
    };
    write();
    for (const delay of [150, 600, 1500]) setTimeout(write, delay);
  };
  const onInput = (event: Electron.Event, input: Electron.Input) => {
    if (input.type === "keyDown" && isBlockedShortcut(input))
      event.preventDefault();
    if (input.type === "keyUp" && input.key === "PrintScreen") {
      hooks.event("SCREENSHOT_KEY", { combo: "PrintScreen" });
      hooks.notice(NOTICE);
      replaceScreenshot();
    }
  };
  // Snipping tools (Win+Shift+S, Cmd+Shift+4) also copy a picture. Look for one a few times a second.
  // Electron 45 has no clipboard.readImage(); asking whether a picture is there is enough to know.
  let checkingClipboard = false;
  const clipboardWatch = setInterval(() => {
    if (checkingClipboard) return;
    checkingClipboard = true;
    void clipboard
      .has("image/png")
      .then(async (hasPicture) => {
        if (!hasPicture) return;
        await clipboard.writeText(NOTICE);
        hooks.event("SCREENSHOT_KEY", { via: "clipboard" });
        hooks.notice(NOTICE);
      })
      .catch(() => {
        /* Skipped. The next check tries again. */
      })
      .finally(() => {
        checkingClipboard = false;
      });
  }, 400);
  let blurredAt: number | null = null;
  const onBlur = () => {
    blurredAt = Date.now();
  };
  const onLeaveFullScreen = () => {
    hooks.event("FULLSCREEN_EXIT", {});
    hooks.notice("You left full screen. Your mentor can see this.");
    if (!window.isDestroyed()) window.setFullScreen(true);
  };
  const onDevTools = () => {
    contents.closeDevTools();
    hooks.notice("Developer tools are not available during the exam.");
  };
  const onDisplays = () => {
    const displays = screen.getAllDisplays().length;
    if (displays <= SECURE_LIMITS.maxDisplays) return;
    hooks.event("SECOND_SCREEN", { displays });
    hooks.notice(
      "A second screen was detected. This is noted for your mentor.",
    );
  };
  // Anything copied elsewhere is gone by the time the learner is back, and the away time is a real note.
  const onFocus = () => {
    clipboard.clear();
    if (blurredAt === null) return;
    const awayMs = Date.now() - blurredAt;
    blurredAt = null;
    hooks.event("WINDOW_BLUR", { awayMs });
    hooks.notice("You left the quiz window. Your mentor can see this.");
  };
  let leaving = false;
  const onClose = (event: Electron.Event) => {
    if (leaving) return;
    event.preventDefault();
    void hooks.requestLeave().then((confirmed) => {
      if (!confirmed || window.isDestroyed()) return;
      leaving = true;
      window.close();
    });
  };

  contents.on("before-input-event", onInput);
  contents.on("devtools-opened", onDevTools);
  screen.on("display-added", onDisplays);
  screen.on("display-metrics-changed", onDisplays);
  window.on("focus", onFocus);
  window.on("blur", onBlur);
  window.on("leave-full-screen", onLeaveFullScreen);
  window.on("close", onClose);
  onDisplays();

  return () => {
    contents.removeListener("before-input-event", onInput);
    contents.removeListener("devtools-opened", onDevTools);
    screen.removeListener("display-added", onDisplays);
    screen.removeListener("display-metrics-changed", onDisplays);
    window.removeListener("focus", onFocus);
    window.removeListener("blur", onBlur);
    window.removeListener("leave-full-screen", onLeaveFullScreen);
    window.removeListener("close", onClose);
    clearInterval(clipboardWatch);
    powerSaveBlocker.stop(sleepBlocker);
    if (window.isDestroyed()) return;
    window.setContentProtection(false);
    window.setAlwaysOnTop(false);
    window.setFullScreen(wasFullScreen);
  };
}
