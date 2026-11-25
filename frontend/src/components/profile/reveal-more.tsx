"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A section-header toggle that reveals extra content below it in place, e.g. "See all records".
export function RevealMore({
  label,
  hideLabel = "Show less",
  heading,
  preview,
  children,
}: {
  label: string;
  hideLabel?: string;
  /** The section heading rendered to the left of the toggle. */
  heading: ReactNode;
  /** Always-visible content between the heading and the revealed content. */
  preview?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? hideLabel : label}
          <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
      </div>
      {preview}
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </>
  );
}
