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
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminEmptyState } from "@/components/admin/admin-ui";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import { paginateList } from "@/lib/admin-paginate";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
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

export default async function CourseAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; wpage?: string; rpage?: string; ppage?: string }>;
}) {
  const sp = await searchParams;
  await requireRole("ADMIN");
  const [requests, payouts, withdrawals, revenue, withdrawalConfig] = await Promise.all([
    serverApiFetch<RequestRow[]>("/api/v1/admin/manual-access"),
    serverApiFetch<PayoutRow[]>("/api/v1/admin/manual-payouts"),
    serverApiFetch<AdminWithdrawalRow[]>("/api/v1/admin/withdrawals"),
    serverApiFetch<AdminRevenueReport>("/api/v1/admin/revenue"),
    serverApiFetch<{ enabled: boolean }>("/api/v1/admin/withdrawals/config"),
  ]);

  // Search matches learner, instructor, course, or destination text. Each list pages on its own parameter.
  const q = (sp.q ?? "").trim();
  const needle = q.toLowerCase();
  const matches = (...values: Array<string | null | undefined>) =>
    !needle || values.some((value) => (value ?? "").toLowerCase().includes(needle));
  const withdrawalRows = withdrawals.filter((w) => matches(w.instructorName, w.instructorEmail, w.note));
  const requestRows = requests.filter((row) => matches(row.user?.name, row.user?.email, row.course.title));
  const payoutRows = payouts.filter((row) =>
    matches(row.course, row.learner?.name, row.learner?.email, row.instructor.name, row.instructor.email)
  );
  const withdrawalPage = paginateList(withdrawalRows, sp.wpage, 10);
  const requestPage = paginateList(requestRows, sp.rpage, 10);
  const payoutPage = paginateList(payoutRows, sp.ppage, 10);

  const pageHref = (param: "wpage" | "rpage" | "ppage") => (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const key of ["wpage", "rpage", "ppage"] as const) {
      const value = key === param ? next : Number(sp[key]) || 1;
      if (value > 1) params.set(key, String(value));
    }
    const value = params.toString();
    return `/admin/course-access${value ? `?${value}` : ""}`;
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <AdminPageHeader
        eyebrow="Finance"
        title="Financials & course access"
        description="Manage learner course access, platform revenue reports, instructor payouts, and withdrawal requests."
      />

      <AdminQueryForm basePath="/admin/course-access" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-96">
          Search learner, instructor, course, or destination
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="e.g. learner@ or course title"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
            Search
          </button>
          {q ? (
            <Link href="/admin/course-access" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
              Clear
            </Link>
          ) : null}
        </div>
      </AdminQueryForm>

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
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgb(10_15_44/4%)] sm:p-6">
        <SectionHead title="Instructor Withdrawal Requests" description={"Formal requests by instructors to withdraw their accumulated course earnings."} count={withdrawalRows.length} />

        {!withdrawalConfig.enabled && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Withdrawal processing is not available yet.
          </p>
        )}
        {withdrawalRows.length === 0 ? (
          <AdminEmptyState title={q ? "No matches" : "No withdrawal requests"} description={q ? "Try a different search." : "Instructor withdrawal requests will appear here."} />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {withdrawalPage.items.map((w) => (
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

                {withdrawalConfig.enabled && w.status === "REQUESTED" && (
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
        <AdminPagination page={withdrawalPage.page} hrefFor={pageHref("wpage")} />
      </section>

      {/* Manual Access Pending */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgb(10_15_44/4%)] sm:p-6">
        <SectionHead title="Course Access Requests" description={"Contact learners and confirm payment before granting access. This list includes enrollments awaiting manual payment confirmation."} count={requestRows.length} />

        {requestRows.length === 0 ? (
          <AdminEmptyState title={q ? "No matches" : "Nothing awaiting payment"} description={q ? "Try a different search." : "Enrollments waiting for manual payment confirmation will appear here."} />
        ) : (
          requestPage.items.map((row) => (
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
        <AdminPagination page={requestPage.page} hrefFor={pageHref("rpage")} />
      </section>

      {/* Unified Instructor Payouts Queue */}
      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgb(10_15_44/4%)] sm:p-6">
        <SectionHead title="Individual Enrollment Payout Queue" description={"Includes all instructor-earning enrollments (manual payments, 100% admin coupons, organization-funded seats, and direct checkout)."} count={payoutRows.length} />

        {payoutRows.length === 0 ? (
          <AdminEmptyState title={q ? "No matches" : "No payouts due"} description={q ? "Try a different search." : "Instructor payouts that are due will appear here."} />
        ) : (
          <div className="space-y-3">
            {payoutPage.items.map((row) => (
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
        <AdminPagination page={payoutPage.page} hrefFor={pageHref("ppage")} />
      </section>
    </div>
  );
}

function SectionHead({ title, description, count }: { title: string; description: string; count: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
        {count.toLocaleString()} {count === 1 ? "item" : "items"}
      </span>
    </div>
  );
}
