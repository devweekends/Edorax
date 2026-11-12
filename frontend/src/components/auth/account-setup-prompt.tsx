"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { completeAccountSetupAction, type ProfileUpdateState } from "@/server/actions/profile";

const initial: ProfileUpdateState = { ok: false, errors: [] };

type AccountSetupUser = {
  id: string;
  name: string | null;
  hasPassword: boolean;
  loginSessionId: string;
};

export function AccountSetupPrompt({ user }: { user: AccountSetupUser }) {
  const needsName = !user.name?.trim();
  const needsPassword = !user.hasPassword;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(completeAccountSetupAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (!needsName && !needsPassword) return;
    // Older API deployments may not return the login ID yet. In that case, show
    // the setup prompt rather than suppressing it under a shared empty key.
    if (!user.loginSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads sessionStorage, which only exists in the browser
      setOpen(true);
      return;
    }

    const key = `account-setup-prompted:v2:${user.loginSessionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [needsName, needsPassword, user.loginSessionId]);

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the dialog after the server action succeeds
      setOpen(false);
      router.refresh();
    }
  }, [router, state]);

  if (!needsName && !needsPassword) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-6 text-foreground shadow-xl outline-none sm:p-7">
          <Dialog.Title className="text-xl font-semibold tracking-tight">
            {needsName && needsPassword ? "Add your name and password" : needsName ? "Add your name" : "Create a password"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {needsName && needsPassword
              ? "Add your real name and choose a password for future sign-ins."
              : needsName
                ? "Add your real name so people can recognize you in Edorax."
                : "Choose a password so you can sign in with your email and password."}
          </Dialog.Description>

          <form action={action} className="mt-5 space-y-4">
            {needsName ? (
              <div className="space-y-1.5">
                <Label htmlFor="account-setup-name">Your name</Label>
                <Input id="account-setup-name" name="name" autoComplete="name" required maxLength={120} autoFocus />
              </div>
            ) : null}
            {needsPassword ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="account-setup-password">Create a password</Label>
                  <PasswordInput id="account-setup-password" name="newPassword" autoComplete="new-password" required minLength={8} maxLength={128} autoFocus={!needsName} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-setup-confirm-password">Confirm password</Label>
                  <PasswordInput id="account-setup-confirm-password" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={128} />
                </div>
              </>
            ) : null}

            {state.ok === false && state.errors.length ? (
              <ul role="alert" className="space-y-1 text-sm text-destructive">
                {state.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save details"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
