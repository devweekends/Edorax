"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Shows the first `initial` items (two rows at the grid's column count) and a "View all N" toggle that
// reveals the rest in place.
export function ShowMore({
  items,
  initial = 8,
  label,
  gridClassName,
}: {
  items: ReactNode[];
  initial?: number;
  label: string;
  gridClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items.length : Math.min(initial, items.length);
  return (
    <div>
      <div className={gridClassName}>{items.slice(0, shown)}</div>
      {items.length > initial ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={open ? "Show less" : `View all ${items.length} ${label}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Show less" : "View all"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
