"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { UserRoundPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/app-toast";
import { adminSelectClassName } from "@/components/admin/admin-ui";
import { inviteUserByEmailAction } from "@/server/actions/admin/users";
import type { AdminActionState } from "@/server/actions/admin/action-result";

const initialState: AdminActionState = { ok: false, message: "" };

export function AdminRoleInviteDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(inviteUserByEmailAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailId = useId();
  const nameId = useId();
  const roleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!state.message) return;
    toast(state.message, state.ok ? "success" : "error");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the dialog with the last action result
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserRoundPlus className="size-4" aria-hidden />
        Invite user
      </Button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby={`${emailId}-title`}
        className="fixed inset-0 z-[70] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:items-center open:justify-center open:p-4"
      >
        <form action={formAction} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={`${emailId}-title`} className="text-base font-semibold">Invite user</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose their role and we’ll email them sign-in details.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close invite dialog"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="space-y-4 px-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>Email</Label>
              <Input id={emailId} name="email" type="email" autoComplete="email" required placeholder="person@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={nameId}>Display name <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id={nameId} name="name" autoComplete="name" placeholder="Alex Morgan" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={roleId}>Role</Label>
              <select id={roleId} name="role" defaultValue="MENTOR" className={adminSelectClassName}>
                <option value="MENTOR">Instructor</option>
                <option value="ADMIN">Platform admin</option>
              </select>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Existing accounts are updated to this role and emailed about their new access.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" loadingLabel="Sending…" disabled={pending}>
                Send invite
              </Button>
            </div>
            {state.message && !state.ok ? (
              <p role="alert" className="text-sm text-destructive">{state.message}</p>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
