"use client";

import { useEffect, useRef } from "react";

/**
 * Header checkbox that selects or clears every row checkbox submitted through `formId`.
 * Row checkboxes live outside the form's DOM and point at it with the `form` attribute,
 * so they are matched by that attribute. The header shows an indeterminate state when only some are selected.
 */
export function SelectAllCheckbox({
  formId,
  name,
  label,
}: {
  formId: string;
  name: string;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const selector = `input[form="${formId}"][name="${name}"]`;

  useEffect(() => {
    const sync = () => {
      const header = ref.current;
      if (!header) return;
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
      const checked = boxes.filter((box) => box.checked).length;
      header.checked = boxes.length > 0 && checked === boxes.length;
      header.indeterminate = checked > 0 && checked < boxes.length;
    };
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, [selector]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      className="size-4 rounded border-input accent-primary"
      onChange={(event) => {
        const next = event.currentTarget.checked;
        document.querySelectorAll<HTMLInputElement>(selector).forEach((box) => {
          box.checked = next;
        });
        event.currentTarget.indeterminate = false;
      }}
    />
  );
}
