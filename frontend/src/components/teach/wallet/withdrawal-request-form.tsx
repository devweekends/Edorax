"use client";

import { useActionState } from "react";
import { requestWithdrawalAction } from "@/server/actions/teach-wallet";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function WithdrawalRequestForm({
  availableAmountCents,
  currency,
}: {
  availableAmountCents: number;
  currency: string;
}) {
  const [state, formAction, isPending] = useActionState(requestWithdrawalAction, null);

  const formattedAmount = `$${(availableAmountCents / 100).toFixed(2)} ${currency}`;

  return (
    <form action={formAction} className="space-y-4">
      {state && !state.ok ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{state.errors.join(", ")}</span>
        </div>
      ) : null}

      {state && state.ok ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Withdrawal request submitted successfully!</span>
        </div>
      ) : null}

      <div>
        <label htmlFor="payout-note" className="block text-sm font-medium">
          Transfer destination / account details
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Provide where you would like the transfer sent (e.g. IBAN, bank account name & number, or PayPal email).
        </p>
        <textarea
          id="payout-note"
          name="note"
          required
          rows={3}
          maxLength={240}
          placeholder="e.g. Bank: Chase, Routing: 123456789, Account: 987654321, Name: Jane Doe"
          className="mt-2 w-full rounded-md border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="text-sm font-semibold">
          Withdrawal amount: <span className="tabular-nums text-primary">{formattedAmount}</span>
        </p>
        <Button type="submit" disabled={isPending || availableAmountCents <= 0}>
          {isPending ? "Submitting…" : `Withdraw ${formattedAmount}`}
        </Button>
      </div>
    </form>
  );
}

