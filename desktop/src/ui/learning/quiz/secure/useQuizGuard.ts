import { useEffect, useState } from "react";

// Protection inside the quiz window. The window cannot be copied from: no text selection, no copy,
// cut, paste, drag or right-click, and the clipboard is replaced so an old screenshot or old text
// cannot be pasted back as if it were the answer. Each attempt is reported through the main
// process with a real timestamp. Leaving the window, leaving full screen and screenshot keys are
// noticed by the main process itself.

export const GUARD_NOTICES = {
  copy: "Copying is not allowed during the quiz.",
  paste: "Pasting is not allowed during the quiz.",
  menu: "Right-click is not allowed during the quiz.",
  drag: "Dragging text is not allowed during the quiz.",
} as const;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export function useQuizGuard(enabled: boolean, blockId: string | null) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const say = (text: string) => {
      setNotice(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 4_000);
    };
    const report = (
      type: "COPY_BLOCKED" | "PASTE_BLOCKED" | "CONTEXT_MENU_BLOCKED",
      meta?: Record<string, string | number | boolean>,
    ) => void window.buildment.secure.report(type, meta, blockId);
    const overwriteClipboard = (text: string) => {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    };

    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      event.clipboardData?.setData("text/plain", GUARD_NOTICES.copy);
      report("COPY_BLOCKED");
      say(GUARD_NOTICES.copy);
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      report("PASTE_BLOCKED");
      say(GUARD_NOTICES.paste);
    };
    const onMenu = (event: MouseEvent) => {
      event.preventDefault();
      report("CONTEXT_MENU_BLOCKED");
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
      if (
        (event.ctrlKey || event.metaKey) &&
        ["c", "x"].includes(key) &&
        !isEditable(event.target)
      ) {
        // Without a selection the copy event may not fire, so the key answers for it.
        event.preventDefault();
        overwriteClipboard(GUARD_NOTICES.copy);
        report("COPY_BLOCKED", {
          combo: `${event.metaKey ? "Cmd" : "Ctrl"}+${key.toUpperCase()}`,
        });
        say(GUARD_NOTICES.copy);
      }
    };

    const body = document.body;
    const style = body.style as CSSStyleDeclaration & {
      webkitUserSelect?: string;
    };
    const before = {
      userSelect: style.userSelect,
      webkit: style.webkitUserSelect ?? "",
    };
    style.userSelect = "none";
    style.webkitUserSelect = "none";
    // Answer boxes stay selectable, or some engines refuse typing inside a no-select page.
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
    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCopy, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", onMenu, true);
      document.removeEventListener("selectstart", onSelectStart, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
      sheet.remove();
      style.userSelect = before.userSelect;
      style.webkitUserSelect = before.webkit;
    };
  }, [enabled, blockId]);

  return { notice, say: setNotice };
}
