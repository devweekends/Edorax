import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminEnrollmentDetail } from "@/shared/api/admin";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/guards";
import { AdminBackLink, AdminPanel, AdminSection } from "@/components/admin/admin-ui";
import { PaymentStatusBadge, discountKindLabel, providerLabel, wasCharged } from "../payment-badge";
import { DeleteEnrollmentButton } from "../delete-enrollment-button";
import { EnrollmentEditForm } from "./enrollment-edit-form";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

function Field({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-right text-sm font-semibold tabular-nums" : "text-right text-sm tabular-nums"}>{children}</dd>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function AdminEnrollmentDetailPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  await requireRole("ADMIN");
  const { enrollmentId } = await params;
  const enrollment = await serverApiFetchOrNotFound<AdminEnrollmentDetail>(
    `/api/v1/admin/enrollments/${encodeURIComponent(enrollmentId)}`
  );
  const { learner, course, payment } = enrollment;
  const money = (cents: number) => formatPriceCents(cents, payment?.currency);
  const charged = wasCharged(payment?.status);

  return (
    <div className="space-y-8">
      <AdminBackLink href="/admin/enrollments">← Back to enrollments</AdminBackLink>

      <section className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Enrollment</p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {learner.userId ? (
              <Link href={`/admin/users/${learner.userId}`} className="font-medium text-foreground hover:text-primary hover:underline">
                {learner.name ?? learner.email}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{learner.email ?? "Unknown learner"}</span>
            )}
            {learner.name && learner.email ? <span className="font-mono text-xs"> · {learner.email}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaymentStatusBadge status={payment?.status ?? null} />
          <Badge variant="outline">{enrollment.lifecycle.replace(/_/g, " ").toLowerCase()}</Badge>
          <Badge variant="outline">{enrollment.source.toLowerCase()}</Badge>
          {payment?.provider ? <Badge variant="outline">{providerLabel(payment.provider)}</Badge> : null}
          <DeleteEnrollmentButton
            enrollmentId={enrollment.id}
            learner={learner.email ?? learner.name ?? "this learner"}
            courseTitle={course.title}
            paid={payment && charged ? money(payment.amountCents) : null}
            redirectToList
          />
        </div>
      </section>

      {payment ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Learner paid"
              value={money(charged ? payment.amountCents : 0)}
              hint={charged ? `Paid ${when(payment.paidAt)}` : payment.amountCents > 0 ? `${money(payment.amountCents)} due` : undefined}
            />
            <StatTile label="List price" value={money(payment.originalAmountCents)} />
            <StatTile
              label="Refunded"
              value={payment.refund ? money(payment.refund.refundCents) : money(0)}
              hint={payment.refund ? `Polar kept ${money(payment.refund.paidCents - payment.refund.refundCents)} in fees` : undefined}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminSection title="Price breakdown" className="mt-0">
              <AdminPanel>
                <dl>
                  <Field label="List price">{money(payment.originalAmountCents)}</Field>
                  <Field label="Discount">−{money(payment.discountAmountCents)}</Field>
                  <Field label="Paid by organization">−{money(payment.organizationContributionCents)}</Field>
                  <Field label="Learner's share">{money(payment.learnerAmountCents)}</Field>
                  <Field label="Charged to learner" strong>{money(payment.amountCents)}</Field>
                  <Field label="Funding source">{payment.fundingSource?.replace(/_/g, " ") ?? "—"}</Field>
                </dl>
              </AdminPanel>
            </AdminSection>

            <AdminSection title="Revenue split" className="mt-0">
              <AdminPanel>
                <dl>
                  <Field label="Platform revenue">{money(payment.platformRevenueCents)}</Field>
                  <Field label={`Instructor share (${payment.instructorPayoutPercent}%)`}>{money(payment.instructorShareCents)}</Field>
                  <Field label="Instructor payout">{payment.instructorPayoutStatus.replace(/_/g, " ").toLowerCase()}</Field>
                  <Field label="Payout paid">{when(payment.instructorPayoutPaidAt)}</Field>
                  <Field label="Instructor">
                    <Link href={`/admin/users/${enrollment.instructor.id}`} className="hover:text-primary hover:underline">
                      {enrollment.instructor.name ?? enrollment.instructor.email}
                    </Link>
                  </Field>
                </dl>
              </AdminPanel>
            </AdminSection>
          </div>

          <AdminSection title="Payment record" className="mt-0">
            <AdminPanel>
              <dl>
                <Field label="Provider">{payment.provider ? providerLabel(payment.provider) : "—"}</Field>
                <Field label="Provider reference">
                  <span className="break-all font-mono text-xs">{payment.providerRef ?? "—"}</span>
                </Field>
                <Field label="Currency">{payment.currency}</Field>
                <Field label="Created">{when(payment.createdAt)}</Field>
                <Field label="Paid">{when(payment.paidAt)}</Field>
                <Field label="Last updated">{when(payment.updatedAt)}</Field>
              </dl>
              {payment.status === "SUCCEEDED" && payment.provider === "polar" && learner.userId ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  To refund this payment, use the{" "}
                  <Link href={`/admin/users/${learner.userId}`} className="font-medium text-primary hover:underline">
                    learner&apos;s account page
                  </Link>
                  .
                </p>
              ) : null}
            </AdminPanel>
          </AdminSection>
        </>
      ) : (
        <AdminPanel>
          <p className="text-sm text-muted-foreground">
            No payment is recorded for this enrollment. It was free, or access was granted without a charge.
          </p>
        </AdminPanel>
      )}

      <AdminSection title="Coupons and campaigns" className="mt-0">
        <AdminPanel>
          {enrollment.discounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No coupon or campaign was used. The learner was charged the full price.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {enrollment.discounts.map((discount) => (
                <li key={`${discount.kind}-${discount.id}`} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{discountKindLabel(discount.kind)}</Badge>
                      <p className="font-medium">{discount.label}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {discount.code ? <span className="font-mono">{discount.code}</span> : "No code"}
                      {discount.autoApplied ? " · applied automatically" : ""}
                      {discount.organizationName ? ` · from ${discount.organizationName}` : ""}
                      {discount.status ? ` · ${discount.status.toLowerCase()}` : ""}
                      {discount.appliedAt ? ` · ${when(discount.appliedAt)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{discount.percentOff}% off</p>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </AdminSection>

      <AdminSection title="Enrollment" className="mt-0">
        <AdminPanel>
          <dl>
            <Field label="Enrolled">{when(enrollment.createdAt)}</Field>
            <Field label="Started">{when(enrollment.startedAt)}</Field>
            <Field label="Completed">{when(enrollment.completedAt)}</Field>
            <Field label="Progress">{enrollment.percentComplete}% · {enrollment.status.replace(/_/g, " ").toLowerCase()}</Field>
            <Field label="Organization">{enrollment.organization?.name ?? "—"}</Field>
            <Field label="Enrollment ID">
              <span className="font-mono text-xs">{enrollment.id}</span>
            </Field>
          </dl>
        </AdminPanel>
      </AdminSection>

      <AdminSection
        title="Edit enrollment"
        description="Change course access or the payment status. Every save is recorded in the audit log."
        className="mt-0"
      >
        <AdminPanel>
          <EnrollmentEditForm enrollment={enrollment} />
        </AdminPanel>
      </AdminSection>
    </div>
  );
}
