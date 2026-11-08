import { serverApiFetch } from "@/lib/api-server";
import type { InstructorWalletSummary } from "@/shared/api/teach";
import { Badge } from "@/components/ui/badge";
import { WithdrawalRequestForm } from "@/components/teach/wallet/withdrawal-request-form";
import { ArrowDownLeft, CheckCircle2, Clock, Coins, DollarSign, Wallet, XCircle } from "lucide-react";

export const metadata = {
  title: "Wallet & Payouts | Teach Workspace",
};

export default async function TeachWalletPage() {
  const wallet = await serverApiFetch<InstructorWalletSummary>("/api/v1/teach/wallet");

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Wallet & Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your course earnings, track payout history, and withdraw available balances.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total earned</span>
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums">
            ${(wallet.totalEarnedCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">All time course earnings</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Already paid</span>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            ${(wallet.alreadyPaidCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Transferred to your accounts</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Pending withdrawal</span>
            <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
            ${(wallet.pendingWithdrawalCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Requested, processing by admin</p>
        </div>

        <div className="rounded-xl border border-primary/40 bg-primary/[0.04] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary">Available to withdraw</span>
            <span className="grid size-8 place-items-center rounded-lg bg-primary/20 text-primary">
              <Wallet className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-primary">
            ${(wallet.availableBalanceCents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Eligible for payout</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <ArrowDownLeft className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Request a withdrawal</h2>
            <p className="text-xs text-muted-foreground">
              Withdrawals bundle all your currently available earnings into a single transfer request.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {wallet.availableBalanceCents > 0 ? (
            <WithdrawalRequestForm
              availableAmountCents={wallet.availableBalanceCents}
              currency={wallet.currency}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <Coins className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 font-medium">No earnings currently available to withdraw</p>
              <p className="mt-1 text-xs">
                As learners enroll in your paid courses or organizations sponsor seats, your earnings will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Withdrawal history</h2>
          <p className="text-xs text-muted-foreground">
            All requests to transfer funds from Edorax to your account.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Requested date</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Destination / Note</th>
                <th className="px-5 py-3 font-medium">Resolved date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wallet.withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    No withdrawal requests yet.
                  </td>
                </tr>
              ) : (
                wallet.withdrawals.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-5 py-4 tabular-nums text-muted-foreground">
                      {new Date(item.requestedAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 font-semibold tabular-nums">
                      ${(item.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-4">
                      {item.status === "PAID" ? (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Paid
                        </Badge>
                      ) : item.status === "REJECTED" ? (
                        <Badge variant="destructive">Rejected</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-5 py-4 text-xs font-mono text-muted-foreground" title={item.note}>
                      {item.note}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-xs text-muted-foreground">
                      {item.resolvedAt ? new Date(item.resolvedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Recent earnings breakdown</h2>
          <p className="text-xs text-muted-foreground">
            Course enrollments that generated instructor earnings.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Course</th>
                <th className="px-5 py-3 font-medium">Learner</th>
                <th className="px-5 py-3 font-medium">Funding source</th>
                <th className="px-5 py-3 font-medium">Paid by learner</th>
                <th className="px-5 py-3 font-medium">Your share</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wallet.recentEarnings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                    No earnings recorded yet.
                  </td>
                </tr>
              ) : (
                wallet.recentEarnings.map((earning) => (
                  <tr key={earning.id} className="hover:bg-muted/20">
                    <td className="px-5 py-3.5 tabular-nums text-xs text-muted-foreground">
                      {earning.paidAt ? new Date(earning.paidAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 font-medium">{earning.courseTitle}</td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{earning.learnerLabel}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant="outline" className="text-xs capitalize">
                        {earning.fundingSource ? earning.fundingSource.replace(/_/g, " ") : "Direct"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-xs text-muted-foreground">
                      ${(earning.amountCents / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      ${(earning.instructorShareCents / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      {earning.status === "PAID" ? (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Paid</span>
                      ) : earning.status === "PENDING_WITHDRAWAL" ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pending withdrawal</span>
                      ) : (
                        <span className="text-xs font-medium text-primary">Available</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

