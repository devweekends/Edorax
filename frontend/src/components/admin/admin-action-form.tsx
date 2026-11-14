"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { cn } from "@/lib/utils";
import type { AdminActionState } from "@/server/actions/admin/action-result";

// The initial value mirrors `initialAdminActionState`; kept local so this client
// component never imports runtime code from the server-only module.
const initial: AdminActionState = { ok: false, message: "" };

type Confirmation = {
  question: string;
  description?: string;
  confirmLabel: string;
  /** Optional inputs shown inside the modal; they belong to the same form. */
  fields?: React.ReactNode;
};

/**
 * Admin mutation form with inline error/success feedback, a pending submit button
 * (Button reads `useFormStatus`), a toast on each result, and an optional modal
 * confirmation step for destructive or irreversible actions.
 *
 * The confirm modal reuses the app's native `<dialog>` pattern: the first submit
 * opens it, and confirming re-submits the same form (so native validation runs
 * again and the server action stays bound).
 *
 * `children` are rendered as-is before the submit button, so when you include
 * visible fields pass a spacing utility via `className` (e.g. `space-y-4`) — the
 * component only handles the button and feedback spacing.
 */
export function AdminActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  variant = "default",
  size = "default",
  className,
  buttonClassName,
  feedbackClassName,
  confirm,
  icon,
}: {
  action: (state: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Extra classes for the submit button (e.g. a compact size inside dense tables). */
  buttonClassName?: string;
  feedbackClassName?: string;
  confirm?: Confirmation;
  /** Renders an icon-only button; `submitLabel` becomes its accessible name and tooltip. */
  icon?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmOpen && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog.open) dialog.close();
  }, [confirmOpen]);

  useEffect(() => {
    if (!state.message) return;
    toast(state.message, state.ok ? "success" : "error");
    confirmed.current = false;
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !confirmed.current) {
          event.preventDefault();
          setConfirmOpen(true);
        }
      }}
    >
      {children}

      <Button
        type="submit"
        variant={variant}
        size={size}
        className={buttonClassName}
        // With a confirmation, the trigger must skip native validation: the modal's
        // required fields sit inside a closed <dialog>, so the browser would block the
        // submit with "invalid form control is not focusable" and the modal would never
        // open. The confirm step validates instead.
        formNoValidate={confirm ? true : undefined}
        loadingLabel={pendingLabel ?? submitLabel}
        aria-label={icon ? submitLabel : undefined}
        title={icon ? submitLabel : undefined}
      >
        {icon ?? submitLabel}
      </Button>

      {state.message ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={cn(
            "mt-2 text-xs leading-relaxed",
            state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
            feedbackClassName
          )}
        >
          {state.message}
        </p>
      ) : null}

      {confirm ? (
        <dialog
          ref={dialogRef}
          onClose={() => setConfirmOpen(false)}
          aria-labelledby={titleId}
          aria-describedby={confirm.description ? descriptionId : undefined}
          className="fixed inset-0 z-[70] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:items-center open:justify-center open:p-4"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                {confirm.question}
              </h2>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {confirm.description ? (
                <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
                  {confirm.description}
                </p>
              ) : null}
              {confirm.fields ? <div className="mt-4 space-y-3">{confirm.fields}</div> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    const form = formRef.current;
                    // Validate while the modal is still open, so an invalid field can be
                    // focused and reported by the browser.
                    if (form && !form.checkValidity()) {
                      form.reportValidity();
                      return;
                    }
                    confirmed.current = true;
                    setConfirmOpen(false);
                    form?.requestSubmit();
                  }}
                >
                  {confirm.confirmLabel}
                </Button>
              </div>
            </div>
          </div>
        </dialog>
      ) : null}
    </form>
  );
}
