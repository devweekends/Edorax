import { AdminActionForm } from "@/components/admin/admin-action-form";
import {
  approveCourseAccessAction,
  markInstructorPayoutPaidAction,
  markWithdrawalPaidAction,
  rejectCourseAccessAction,
  rejectWithdrawalAction,
} from "@/server/actions/admin/course-access";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { formatPriceCents } from "@/lib/format-price";
import { Badge } from "@/components/ui/badge";
import type { AdminRevenueReport, AdminWithdrawalRow } from "@/shared/api/admin";

type RequestRow = {
  id: string;
  user: { name: string | null; email: string } | null;
  course: { title: string };
  payment: {
    amountCents: number;
    currency: string;
    originalAmountCents: number;
    discountAmountCents: number;
    organizationContributionCents: number;
    learnerAmountCents: number;
    instructorShareCents: number;
    platformRevenueCents: number;
    fundingSource: string | null;
  } | null;
};

type PayoutRow = {
  id: string;
  paymentId: string;
  amountCents: number;
  instructorPayoutStatus: "PENDING" | "PAID";
  instructorShareCents: number;
  currency: string;
  instructorPayoutPaidAt: string | null;
  fundingSource: string | null;
  payoutWithdrawalId: string | null;
  learner: { name: string | null; email: string } | null;
  course: string;
  instructor: { name: string | null; email: string };
};

export default async function CourseAccessPage() {
  await requireRole("ADMIN");
  const [requests, payouts, withdrawals, revenue] = await Promise.all([
    serverApiFetch<RequestRow[]>("/api/v1/admin/manual-access"),
    serverApiFetch<PayoutRow[]>("/api/v1/admin/manual-payouts"),
    serverApiFetch<AdminWithdrawalRow[]>("/api/v1/admin/withdrawals"),
    serverApiFetch<AdminRevenueReport>("/api/v1/admin/revenue"),
  ]);

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financials & Course Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage learner course access, platform revenue reports, instructor payouts, and withdrawal requests.
        </p>
      </div>

      {/* Platform Revenue Summary */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Platform Financial Summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Platform net revenue</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary">
              ${(revenue.totalPlatformRevenueCents / 100).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Retained by platform</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Total learner payments</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              ${(revenue.totalLearnerPaymentsCents / 100).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Collected from direct learners</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Org contributions</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              ${(revenue.totalOrganizationContributionsCents / 100).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Funded via org credit balance</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Instructor earnings</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              ${(revenue.totalInstructorEarningsCents / 100).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ${(revenue.totalInstructorPaidCents / 100).toFixed(2)} paid · ${(revenue.totalInstructorPendingCents / 100).toFixed(2)} pending
            </p>
          </div>
        </div>
      </section>

      {/* Instructor Withdrawal Requests */}
      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-xl font-semibold">Instructor Withdrawal Requests</h2>
          <p className="text-sm text-muted-foreground">
            Formal requests by instructors to withdraw their accumulated course earnings.
          </p>
        </div>

        {withdrawals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No withdrawal requests recorded yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {withdrawals.map((w) => (
              <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-base">
                      ${(w.amountCents / 100).toFixed(2)} {w.currency}
                    </p>
                    {w.status === "PAID" ? (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Paid
                      </Badge>
                    ) : w.status === "REJECTED" ? (
                      <Badge variant="destructive">Rejected</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                        Requested
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">
                    Instructor: <span className="font-medium">{w.instructorName ?? "Instructor"}</span> ({w.instructorEmail})
                  </p>
                  <p className="text-xs font-mono text-muted-foreground bg-muted/40 rounded px-2 py-1 inline-block">
                    Destination: {w.note}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested on {new Date(w.requestedAt).toLocaleDateString()} · Covers {w.paymentCount} course enrollment{w.paymentCount === 1 ? "" : "s"}
                    {w.resolvedAt ? ` · Resolved on ${new Date(w.resolvedAt).toLocaleDateString()}` : ""}
                  </p>
                </div>

                {w.status === "REQUESTED" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminActionForm
                      action={markWithdrawalPaidAction}
                      submitLabel="Mark as Paid"
                      pendingLabel="Marking paid…"
                      confirm={{
                        question: `Mark withdrawal for ${w.instructorEmail} as paid?`,
                        description: `Confirm that ${(w.amountCents / 100).toFixed(2)} ${w.currency} has been transferred to "${w.note}". Linked payments will be marked PAID.`,
                        confirmLabel: "Confirm payout transfer",
                      }}
                    >
                      <input type="hidden" name="withdrawalId" value={w.id} />
                    </AdminActionForm>

                    <AdminActionForm
                      action={rejectWithdrawalAction}
                      submitLabel="Reject request"
                      pendingLabel="Rejecting…"
                      variant="destructive"
                      confirm={{
                        question: `Reject withdrawal for ${w.instructorEmail}?`,
                        description: `The request will be marked REJECTED and the ${(w.amountCents / 100).toFixed(2)} ${w.currency} balance will return to the instructor's available balance for re-withdrawal.`,
                        confirmLabel: "Reject withdrawal",
                      }}
                    >
                      <input type="hidden" name="withdrawalId" value={w.id} />
                    </AdminActionForm>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Manual Access Pending */}
      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-xl font-semibold">Course Access Requests</h2>
          <p className="text-sm text-muted-foreground">
            Contact learners and confirm payment before granting access. This list includes enrollments awaiting manual payment confirmation.
          </p>
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrollments are awaiting payment.</p>
        ) : (
          requests.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{row.course.title}</p>
                <p className="text-sm font-medium tabular-nums">
                  {row.payment ? formatPriceCents(row.payment.learnerAmountCents, row.payment.currency) : "—"}
                </p>
              </div>
              {row.payment ? (
                <p className="text-xs text-muted-foreground">
                  Price {formatPriceCents(row.payment.originalAmountCents, row.payment.currency)}
                  {row.payment.discountAmountCents > 0 ? ` · discount ${formatPriceCents(row.payment.discountAmountCents, row.payment.currency)}` : ""}
                  {row.payment.organizationContributionCents > 0 ? ` · org contribution ${formatPriceCents(row.payment.organizationContributionCents, row.payment.currency)}` : ""}
                  {` · instructor share ${formatPriceCents(row.payment.instructorShareCents, row.payment.currency)} · platform ${formatPriceCents(row.payment.platformRevenueCents, row.payment.currency)}`}
                  {row.payment.fundingSource ? ` · funding: ${row.payment.fundingSource}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Learner: <span className="font-medium text-foreground">{row.user?.name ?? "Learner"}</span> ({row.user?.email})
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {row.payment && (
                  <AdminActionForm
                    action={approveCourseAccessAction}
                    submitLabel="Grant access"
                    pendingLabel="Granting…"
                    confirm={{
                      question: `Confirm payment for ${row.user?.email ?? "this learner"}?`,
                      description: `Grant access to ${row.course.title} after verifying payment of ${formatPriceCents(row.payment.amountCents, row.payment.currency)}.`,
                      confirmLabel: "Confirm payment and grant access",
                    }}
                  >
                    <input type="hidden" name="id" value={row.id} />
                  </AdminActionForm>
                )}
                <AdminActionForm
                  action={rejectCourseAccessAction}
                  submitLabel="Reject request"
                  pendingLabel="Rejecting…"
                  variant="destructive"
                  confirm={{
                    question: `Reject ${row.user?.email ?? "this learner"}'s request?`,
                    description: "The request will be closed and this learner will not receive access to the course.",
                    confirmLabel: "Reject request",
                  }}
                >
                  <input type="hidden" name="id" value={row.id} />
                </AdminActionForm>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Unified Instructor Payouts Queue */}
      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-xl font-semibold">Individual Enrollment Payout Queue</h2>
          <p className="text-sm text-muted-foreground">
            Includes all instructor-earning enrollments (manual payments, 100% admin coupons, organization-funded seats, and direct checkout).
          </p>
        </div>

        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No instructor payouts are due.</p>
        ) : (
          <div className="space-y-3">
            {payouts.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{row.course}</p>
                    <Badge variant="outline" className="text-xs capitalize">
                      {row.fundingSource ? row.fundingSource.replace(/_/g, " ") : "Direct"}
                    </Badge>
                  </div>
                  <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    Instructor share: {formatPriceCents(row.instructorShareCents, row.currency)}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">
                  Learner: {row.learner?.name ?? row.learner?.email ?? "Unknown"} · Instructor: {row.instructor.name ?? row.instructor.email}
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>
                    Status:{" "}
                    {row.instructorPayoutStatus === "PAID" ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Paid</span>
                    ) : row.payoutWithdrawalId ? (
                      <span className="font-medium text-amber-600 dark:text-amber-400">Reserved in withdrawal</span>
                    ) : (
                      <span className="font-medium text-primary">Pending</span>
                    )}
                    {row.instructorPayoutPaidAt ? ` on ${new Date(row.instructorPayoutPaidAt).toLocaleDateString()}` : ""}
                  </span>

                  {row.instructorPayoutStatus === "PENDING" && !row.payoutWithdrawalId && (
                    <AdminActionForm
                      action={markInstructorPayoutPaidAction}
                      submitLabel="Mark paid directly"
                      pendingLabel="Saving…"
                      confirm={{
                        question: `Mark ${row.instructor.email}'s payout as paid?`,
                        description: `Record manual transfer of ${formatPriceCents(row.instructorShareCents, row.currency)} for ${row.course}.`,
                        confirmLabel: "Confirm payout",
                      }}
                    >
                      <input type="hidden" name="id" value={row.id} />
                    </AdminActionForm>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
