"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type {
  IntegrityEventInput,
  IntegrityEventType,
} from "@/shared/api/integrity";

// Protection while a quiz is open in the browser. It does two jobs on its own, so they never
// depend on anything else working:
//   1. It makes the page hard to copy from: no text selection, no copy, cut, paste, drag or
//      right-click, and a replaced clipboard so a stale screenshot or old text cannot be pasted
//      back as if it were the answer.
//   2. It tells the server what happened, with real timestamps, and says "still here" every few
//      seconds so the mentor's online light is true.
// The shared quiz hook may report the same moments too. The server keeps only one of two notes of
// the same kind that land within about a second and a half.
//
// A browser cannot block screenshots, so those are only noticed when a key is pressed.

export const GUARD_NOTICES = {
  copy: "Copying is not allowed during the quiz.",
  paste: "Pasting is not allowed during the quiz.",
  menu: "Right-click is not allowed during the quiz.",
  screenshot: "Screenshots are not allowed during the quiz.",
  drag: "Dragging text is not allowed during the quiz.",
} as const;

const FLUSH_MS = 2_000;
const PING_MS = 8_000;
const MAX_QUEUE = 100;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

function newId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "")
      : String(Math.random()).slice(2) + Date.now();
  return random.slice(0, 24);
}

export function useQuizGuard({
  enabled,
  attemptId,
  blockId,
}: {
  enabled: boolean;
  attemptId: string | null;
  blockId: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef({ attemptId, blockId });
  latest.current = { attemptId, blockId };

  useEffect(() => {
    if (!enabled) return;
    const queue: IntegrityEventInput[] = [];
    let noticeTimer: number | undefined;
    let hiddenAt: number | null = null;
    let blurredAt: number | null = null;

    const say = (text: string) => {
      setNotice(text);
      window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => setNotice(null), 4_000);
    };

    const record = (
      type: IntegrityEventType,
      meta?: Record<string, string | number | boolean>,
    ) => {
      queue.push({
        id: newId(),
        type,
        at: new Date().toISOString(),
        blockId: latest.current.blockId,
        meta,
      });
      if (queue.length > MAX_QUEUE) queue.shift();
    };

    const flush = async () => {
      const id = latest.current.attemptId;
      if (!id || !queue.length) return;
      const batch = queue.splice(0, 40);
      try {
        await apiFetch(
          `/api/v1/integrity/attempts/${encodeURIComponent(id)}/events`,
          { method: "POST", json: { events: batch } },
        );
      } catch {
        // Keep them for the next try. The server ignores a repeated id.
        queue.unshift(...batch);
        if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
      }
    };

    const flushOnLeave = () => {
      const id = latest.current.attemptId;
      if (!id || !queue.length) return;
      const body = new Blob([JSON.stringify({ events: queue.splice(0, 40) })], {
        type: "application/json",
      });
      navigator.sendBeacon?.(
        `/api/v1/integrity/attempts/${encodeURIComponent(id)}/events`,
        body,
      );
    };

    const ping = () => {
      const id = latest.current.attemptId;
      if (!id) return;
      void apiFetch(
        `/api/v1/integrity/attempts/${encodeURIComponent(id)}/ping`,
        { method: "POST" },
      ).catch(() => undefined);
    };

    // Replaces whatever is on the clipboard, so the next paste elsewhere shows this sentence
    // instead of an earlier screenshot or copied text.
    const overwriteClipboard = (text: string) => {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    };

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      event.clipboardData?.setData("text/plain", GUARD_NOTICES.copy);
      record("COPY_BLOCKED");
      say(GUARD_NOTICES.copy);
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      record("PASTE_BLOCKED");
      say(GUARD_NOTICES.paste);
    };
    const onMenu = (event: MouseEvent) => {
      event.preventDefault();
      record("CONTEXT_MENU_BLOCKED");
      say(GUARD_NOTICES.menu);
    };
    const onSelectStart = (event: Event) => {
      if (!isEditable(event.target)) event.preventDefault();
    };
    // Dragging selected text out is blocked, and so is dropping text into an answer box. Items that are
    // meant to be dragged (ordering and matching questions) keep working.
    const onDragStart = (event: DragEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[draggable="true"]')
      )
        return;
      event.preventDefault();
      say(GUARD_NOTICES.drag);
    };
    const onDrop = (event: DragEvent) => {
      if (!isEditable(event.target)) return;
      event.preventDefault();
      say(GUARD_NOTICES.paste);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      // Snipping shortcuts: Windows+Shift+S, and Cmd+Shift+3, 4 or 5 on a Mac.
      const snip =
        (event.metaKey &&
          event.shiftKey &&
          ["s", "3", "4", "5"].includes(key)) ||
        (event.ctrlKey && event.shiftKey && key === "s");
      if (snip || key === "printscreen") {
        record("SCREENSHOT_KEY", {
          combo: snip ? "Snipping shortcut" : "PrintScreen",
        });
        say(GUARD_NOTICES.screenshot);
        window.setTimeout(
          () => overwriteClipboard(GUARD_NOTICES.screenshot),
          150,
        );
        window.setTimeout(
          () => overwriteClipboard(GUARD_NOTICES.screenshot),
          900,
        );
        return;
      }
      if (command && ["c", "x"].includes(key) && !isEditable(event.target)) {
        // The copy event does not always fire without a selection, so answer the key as well.
        event.preventDefault();
        overwriteClipboard(GUARD_NOTICES.copy);
        record("COPY_BLOCKED", {
          combo: `${event.metaKey ? "Cmd" : "Ctrl"}+${key.toUpperCase()}`,
        });
        say(GUARD_NOTICES.copy);
      } else if (command && ["p", "s", "u"].includes(key)) {
        event.preventDefault();
        say(GUARD_NOTICES.screenshot);
      } else if (
        key === "f12" ||
        (command && event.shiftKey && ["i", "j", "c"].includes(key))
      ) {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "PrintScreen") return;
      record("SCREENSHOT_KEY", { combo: "PrintScreen" });
      say(GUARD_NOTICES.screenshot);
      overwriteClipboard(GUARD_NOTICES.screenshot);
      window.setTimeout(
        () => overwriteClipboard(GUARD_NOTICES.screenshot),
        400,
      );
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        flushOnLeave();
      } else if (hiddenAt !== null) {
        record("TAB_HIDDEN", { awayMs: Date.now() - hiddenAt });
        hiddenAt = null;
        say("You left the quiz. Your mentor can see this.");
      }
    };
    const onBlur = () => {
      blurredAt = Date.now();
    };
    const onFocus = () => {
      if (blurredAt !== null && !document.hidden) {
        record("WINDOW_BLUR", { awayMs: Date.now() - blurredAt });
        say("You left the quiz window. Your mentor can see this.");
      }
      blurredAt = null;
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) record("FULLSCREEN_EXIT");
    };

    const body = document.body;
    const before = {
      userSelect: body.style.userSelect,
      webkitUserSelect:
        (body.style as CSSStyleDeclaration & { webkitUserSelect?: string })
          .webkitUserSelect ?? "",
    };
    body.style.userSelect = "none";
    (
      body.style as CSSStyleDeclaration & { webkitUserSelect?: string }
    ).webkitUserSelect = "none";
    // Answer boxes stay selectable, or Safari refuses typing inside a no-select page.
    const sheet = document.createElement("style");
    sheet.dataset.quizGuard = "true";
    sheet.textContent =
      'input, textarea, [contenteditable="true"] { user-select: text !important; -webkit-user-select: text !important; }';
    document.head.appendChild(sheet);

    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("contextmenu", onMenu, true);
    document.addEventListener("selectstart", onSelectStart, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", flushOnLeave);
    const flushTimer = window.setInterval(() => void flush(), FLUSH_MS);
    const pingTimer = window.setInterval(ping, PING_MS);
    ping();

    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", onMenu, true);
      document.removeEventListener("selectstart", onSelectStart, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", flushOnLeave);
      window.clearInterval(flushTimer);
      window.clearInterval(pingTimer);
      window.clearTimeout(noticeTimer);
      sheet.remove();
      body.style.userSelect = before.userSelect;
      (
        body.style as CSSStyleDeclaration & { webkitUserSelect?: string }
      ).webkitUserSelect = before.webkitUserSelect;
      void flush();
    };
  }, [enabled]);

  return { notice };
}
