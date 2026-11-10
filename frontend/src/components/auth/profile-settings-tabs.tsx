"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProfileSettingsTab = {
  id: string;
  label: string;
  content: ReactNode;
};

/** Shared accessible tab pattern for learner, instructor, and admin profile settings. */
export function ProfileSettingsTabs({
  tabs,
  defaultTabId,
}: {
  tabs: ProfileSettingsTab[];
  /** Opens this tab when present (e.g. `notifications` from `/settings/profile#notifications`). */
  defaultTabId?: string;
}) {
  const initial =
    (defaultTabId && tabs.some((tab) => tab.id === defaultTabId) ? defaultTabId : null) ??
    tabs[0]?.id ??
    "";
  const [active, setActive] = useState(initial);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromHash = window.location.hash.replace(/^#/, "");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the initial tab from the URL hash, which only exists in the browser
    if (fromHash && tabs.some((tab) => tab.id === fromHash)) setActive(fromHash);
  }, [tabs]);

  function select(tabId: string) {
    setActive(tabId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = tabId;
      window.history.replaceState(null, "", `${url.pathname}${url.search}#${tabId}`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    select(tab.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Profile settings" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`${id}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={`${id}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== active}
          className="mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {tab.content}
        </section>
      ))}
    </div>
  );
}
