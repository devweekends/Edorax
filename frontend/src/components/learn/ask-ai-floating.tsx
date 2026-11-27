"use client";

import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import { AskChapterBody, AskMentorLink } from "@/components/learn/ask-chapter-panel";
import { useAskChapter } from "@/components/learn/ask-chapter-context";
import { FOCUSABLE_SELECTOR, closesWindow, trapTarget } from "@/lib/ask-ai-window";
import { cn } from "@/lib/utils";

export const ASK_AI_WINDOW_ID = "ask-ai-window";
const TITLE_ID = "ask-ai-window-title";

/** "Ask AI" in the reader header: the primary help action. Icon-only on phones. */
export function AskAiHeaderButton() {
  const { ask, windowOpen, openWindow, closeWindow } = useAskChapter();
  if (!ask.available) return null;
  return (
    <button
      type="button"
      onClick={(event) => (windowOpen ? closeWindow() : openWindow(event.currentTarget))}
      aria-expanded={windowOpen}
      aria-controls={ASK_AI_WINDOW_ID}
      aria-label="Ask AI about this chapter"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border-2 border-primary bg-primary px-2.5 text-[15px] font-bold text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow sm:px-4"
    >
      <Sparkles className="size-5 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Ask AI</span>
    </button>
  );
}

/**
 * The floating "Ask AI" button and its window: a card anchored bottom-right on desktop, a bottom sheet on
 * phones. The window shows the same panel body as the inline card, from the same state.
 */
export function AskAiFloating({ focusMode = false }: { focusMode?: boolean }) {
  const { ask, windowOpen, openWindow, closeWindow, takeOpener } = useAskChapter();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (windowOpen) {
      wasOpen.current = true;
      panel.current?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // After the mentor hand-off there is no opener, so focus stays with the dialog that just took over.
    const opener = takeOpener();
    if (!opener) return;
    (opener.isConnected ? opener : button.current)?.focus();
  }, [windowOpen, takeOpener]);

  // Escape works wherever focus is. Capturing it here keeps it from also leaving focus mode behind the window.
  useEffect(() => {
    if (!windowOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!closesWindow(event)) return;
      event.stopPropagation();
      closeWindow();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [windowOpen, closeWindow]);

  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panel.current) return;
    const controls = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null
    );
    const target = trapTarget({
      count: controls.length,
      index: controls.indexOf(document.activeElement as HTMLElement),
      shift: event.shiftKey,
    });
    if (target === null) return;
    event.preventDefault();
    controls[target]?.focus();
  }

  if (!ask.available) return null;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (windowOpen ? closeWindow() : openWindow(button.current))}
        aria-expanded={windowOpen}
        aria-controls={ASK_AI_WINDOW_ID}
        aria-label="Ask AI about this chapter"
        className={cn(
          "fixed right-4 z-40 mb-[var(--audiobook-bar-space,0px)] inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-lg shadow-foreground/20 outline-none transition-colors hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow sm:right-6",
          focusMode ? "bottom-20" : "bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6"
        )}
      >
        <Sparkles className="size-5 shrink-0" aria-hidden />
        Ask AI
      </button>

      <div id={ASK_AI_WINDOW_ID} hidden={!windowOpen}>
        {windowOpen ? (
          <>
            {/* Phones only: a light scrim behind the sheet. Tapping it closes the sheet. */}
            <div
              aria-hidden
              onClick={closeWindow}
              className="fixed inset-0 z-[48] bg-foreground/30 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 sm:hidden"
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={TITLE_ID}
              tabIndex={-1}
              onKeyDown={trapTab}
              className={cn(
                "fixed inset-x-0 bottom-0 z-[49] flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground shadow-2xl outline-none",
                "motion-safe:animate-in motion-safe:slide-in-from-bottom-8 motion-safe:fade-in motion-safe:duration-200",
                "sm:inset-x-auto sm:right-6 sm:h-auto sm:max-h-[min(36rem,calc(100dvh-8rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:pb-0",
                focusMode ? "sm:bottom-[8.5rem]" : "sm:bottom-[5.5rem]"
              )}
            >
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={TITLE_ID} className="text-base font-bold leading-tight text-foreground">
                    Ask AI
                  </h2>
                  <p className="truncate text-[13px] text-muted-foreground">Quick questions &amp; practice quizzes</p>
                </div>
                <button
                  type="button"
                  onClick={closeWindow}
                  aria-label="Close Ask AI"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-yellow"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                <AskChapterBody />
              </div>
              <div className="shrink-0 border-t border-border bg-card px-4 py-1 sm:px-5">
                <AskMentorLink />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
