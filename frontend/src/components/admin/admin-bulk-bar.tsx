"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { cn } from "@/lib/utils";
import { adminSelectClassName } from "./admin-ui";
import type { AdminActionState } from "@/server/actions/admin/action-result";

// Bulk toolbar for the admin tables. Row checkboxes are plain inputs marked with
// `data-bulk-id`; the toolbar collects the checked ones on demand, so the table
// stays a server component and no state has to be threaded through it. (The rows
// contain their own <form>s, so a wrapping <form> here would be invalid HTML.)

const initial: AdminActionState = { ok: false, message: "" };

export function AdminBulkBar({
  action,
  submitLabel,
  pendingLabel,
  variant = "outline",
  confirm,
  noteField,
  approveFields,
  showWhen,
  icon,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  confirm: { question: string; description: string; confirmLabel: string };
  noteField?: { label: string; placeholder: string };
  approveFields?: { maxEnrollments: number; expiresAt: string };
  /**
   * Show only while the checked rows match: "active" = every checked row is not
   * suspended, "suspended" = every checked row is suspended. Rows opt in with
   * `data-suspended="true" | "false"`. Omit to keep the bar always visible.
   */
  showWhen?: "active" | "suspended";
  /** Named icon, so the server page can pass it without serialising a component. */
  icon?: "suspend" | "reinstate";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<AdminActionState>(initial);
  const titleId = useId();
  const descriptionId = useId();
  const [selection, setSelection] = useState({ count: 0, allActive: false, allSuspended: false });

  const readSelection = useCallback(() => {
    const boxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-bulk-id]:checked"));
    const suspended = boxes.filter((box) => box.dataset.suspended === "true").length;
    setSelection({
      count: boxes.length,
      allActive: boxes.length > 0 && suspended === 0,
      allSuspended: boxes.length > 0 && suspended === boxes.length,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("change", readSelection);
    return () => document.removeEventListener("change", readSelection);
  }, [readSelection]);

  const visible =
    showWhen === "active" ? selection.allActive : showWhen === "suspended" ? selection.allSuspended : true;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (state.message) toast(state.message, state.ok ? "success" : "error");
  }, [state]);

  function selectedIds(): string[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>("input[data-bulk-id]:checked")).map(
      (input) => input.value
    );
  }

  function run(formData: FormData, selection: string[]) {
    startTransition(async () => {
      const result = await action(initial, formData);
      setState(result);
      if (result.ok) {
        // Revalidation re-renders the rows and resets the checkboxes.
        for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("input[data-bulk-id]:checked"))) {
          input.checked = false;
        }
        void selection;
        readSelection();
      }
      setOpen(false);
    });
  }

  function submit() {
    const form = dialogRef.current?.querySelector("form");
    if (!form) return;
    const ids = selectedIds();
    if (ids.length === 0) {
      setState({ ok: false, message: "Select at least one row first." });
      setOpen(false);
      return;
    }
    const formData = new FormData(form);
    for (const id of ids) formData.append("ids", id);
    run(formData, ids);
  }

  return (
    <>
      {visible ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={variant}
          className="gap-1.5"
          onClick={() => {
            const count = selectedIds().length;
            if (count === 0) {
              setState({ ok: false, message: "Select at least one row first." });
              return;
            }
            setState(initial);
            setOpen(true);
          }}
        >
          {icon === "suspend" ? <UserX className="size-4" aria-hidden /> : null}
          {icon === "reinstate" ? <UserCheck className="size-4" aria-hidden /> : null}
          {submitLabel}
        </Button>
        {state.message ? (
          <p
            role={state.ok ? "status" : "alert"}
            className={cn("text-xs", state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}
          >
            {state.message}
          </p>
        ) : null}
      </div>
      ) : null}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 z-[70] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:items-center open:justify-center open:p-4"
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl">
          <div className="border-b border-border px-5 py-4">
            <h2 id={titleId} className="text-base font-semibold">
              {confirm.question}
            </h2>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="px-5 py-4">
              <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
                {confirm.description}
              </p>

              {approveFields ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Max enrollments
                    <input
                      name="maxEnrollments"
                      type="number"
                      min={1}
                      required
                      defaultValue={approveFields.maxEnrollments}
                      className={adminSelectClassName}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Expires (optional)
                    <input name="expiresAt" type="date" defaultValue={approveFields.expiresAt} className={adminSelectClassName} />
                  </label>
                </div>
              ) : null}

              {noteField ? (
                <label className="mt-4 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  {noteField.label}
                  <input name="note" maxLength={240} placeholder={noteField.placeholder} className={adminSelectClassName} />
                </label>
              ) : null}

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
                  {confirm.confirmLabel}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
