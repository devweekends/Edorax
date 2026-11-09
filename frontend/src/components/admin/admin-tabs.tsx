"use client";

import { useCallback, useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminTab = {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
};

/**
 * Tabs with one visible panel at a time. The selected tab is mirrored in the URL hash
 * (for example #credits), so links such as "#credits" open the right tab and reloads keep it.
 */
export function AdminTabs({ tabs, defaultId }: { tabs: AdminTab[]; defaultId?: string }) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(defaultId ?? tabs[0]?.id ?? "");

  // Read the hash after mount, and follow hash changes made by in-page links.
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (tabs.some((tab) => tab.id === hash)) setActiveId(hash);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const select = useCallback(
    (id: string) => {
      setActiveId(id);
      window.history.replaceState(null, "", `#${id}`);
    },
    []
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next].id);
    document.getElementById(`${baseId}-tab-${tabs[next].id}`)?.focus();
  };

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Organization sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, index) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-t-md",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {active ? (
        <div role="tabpanel" id={`${baseId}-panel-${active.id}`} aria-labelledby={`${baseId}-tab-${active.id}`}>
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
