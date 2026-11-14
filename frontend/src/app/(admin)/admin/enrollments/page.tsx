import Link from "next/link";
import type { AdminEnrollmentsView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/guards";
import { DeleteEnrollmentButton } from "./delete-enrollment-button";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/admin-ui";
import { buildListQuery } from "@/components/admin/admin-list-controls";
import { AdminLiveFilterBar } from "@/components/admin/admin-live-filter-bar";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { DiscountBadge, PaymentStatusBadge, providerLabel, wasCharged } from "./payment-badge";

type SearchParams = { query?: string; payment?: string; lifecycle?: string; discount?: string; page?: string };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export default async function AdminEnrollmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const filters = { query: sp.query, payment: sp.payment, lifecycle: sp.lifecycle, discount: sp.discount };
  const filtering = Boolean(sp.query || sp.payment || sp.lifecycle || sp.discount);

  const listQuery = buildListQuery({ ...filters, page: sp.page && sp.page !== "1" ? sp.page : undefined });
  const { enrollments, page } = await serverApiFetch<AdminEnrollmentsView>(
    `/api/v1/admin/enrollments${listQuery ? `?${listQuery}` : ""}`
  );

  const hrefFor = (next: number) => {
    const qs = buildListQuery({ ...filters, page: next > 1 ? String(next) : undefined });
    return `/admin/enrollments${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Catalog & sales"
        title="Enrollments"
        description="Every enrollment and what the learner paid for it. Open one to see the full breakdown."
      />

      <AdminLiveFilterBar
        action="/admin/enrollments"
        showClear={filtering}
        values={filters}
        fields={[
          { name: "query", label: "Search learner or course", kind: "search", placeholder: "e.g. learner@ or course title" },
          {
            name: "payment",
            label: "Payment",
            kind: "select",
            options: [
              { value: "", label: "Any payment" },
              { value: "SUCCEEDED", label: "Paid" },
              { value: "PENDING", label: "Pending" },
              { value: "REFUNDED", label: "Refunded" },
              { value: "FAILED", label: "Failed" },
              { value: "NONE", label: "No payment" },
            ],
          },
          {
            name: "lifecycle",
            label: "Access",
            kind: "select",
            options: [
              { value: "", label: "Any" },
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
              { value: "PAYMENT_REQUIRED", label: "Payment required" },
              { value: "PENDING_ACCOUNT", label: "Pending account" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "EXPIRED", label: "Expired" },
            ],
          },
          {
            name: "discount",
            label: "Discount",
            kind: "select",
            options: [
              { value: "", label: "Any" },
              { value: "true", label: "Coupon or campaign used" },
              { value: "admin", label: "Admin enrollment" },
              { value: "false", label: "Full price" },
            ],
          },
        ]}
      />

      {enrollments.length === 0 ? (
        <AdminEmptyState
          title={filtering ? "No enrollments match these filters" : "No enrollments yet"}
          description={filtering ? "Try a different search, payment or access state." : "Enrollments appear here as learners join courses."}
        />
      ) : (
        <AdminTable minWidth="980px">
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>Learner</AdminTableHeaderCell>
              <AdminTableHeaderCell>Course</AdminTableHeaderCell>
              <AdminTableHeaderCell className="w-px whitespace-nowrap">Enrolled</AdminTableHeaderCell>
              <AdminTableHeaderCell className="w-px whitespace-nowrap">Payment</AdminTableHeaderCell>
              <AdminTableHeaderCell>Discount</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right" className="w-px whitespace-nowrap">List price</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right" className="w-px whitespace-nowrap">Learner paid</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right" className="w-px">
                <span className="sr-only">Actions</span>
              </AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {enrollments.map((row) => {
              const payment = row.payment;
              return (
                <AdminTableRow key={row.id}>
                  <AdminTableCell>
                    <Link href={`/admin/enrollments/${row.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                      {row.learner.name ?? row.learner.email ?? "Unknown learner"}
                    </Link>
                    {row.learner.name && row.learner.email ? (
                      <p className="truncate font-mono text-xs text-muted-foreground">{row.learner.email}</p>
                    ) : null}
                  </AdminTableCell>
                  <AdminTableCell>
                    <p className="truncate">{row.course.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{row.lifecycle.replace(/_/g, " ").toLowerCase()}</Badge>
                      <Badge variant="outline" title="How the learner was enrolled">{row.source.toLowerCase()}</Badge>
                      {payment?.provider ? (
                        <Badge variant="outline" title="Payment provider">
                          {providerLabel(payment.provider)}
                        </Badge>
                      ) : null}
                    </div>
                  </AdminTableCell>
                  <AdminTableCell className="w-px whitespace-nowrap tabular-nums text-muted-foreground">
                    {dateFormat.format(new Date(row.createdAt))}
                  </AdminTableCell>
                  <AdminTableCell className="w-px whitespace-nowrap">
                    <PaymentStatusBadge status={payment?.status ?? null} />
                  </AdminTableCell>
                  <AdminTableCell>
                    {row.discounts.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {row.discounts.map((discount) => (
                          <DiscountBadge key={`${discount.kind}-${discount.id}`} discount={discount} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="w-px whitespace-nowrap tabular-nums text-muted-foreground">
                    {payment ? formatPriceCents(payment.originalAmountCents, payment.currency) : "—"}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="w-px whitespace-nowrap tabular-nums font-medium">
                    {payment && wasCharged(payment.status) ? (
                      formatPriceCents(payment.amountCents, payment.currency)
                    ) : payment && payment.amountCents > 0 ? (
                      <span className="font-normal text-muted-foreground">
                        {formatPriceCents(payment.amountCents, payment.currency)} due
                      </span>
                    ) : (
                      formatPriceCents(0, payment?.currency)
                    )}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="w-px">
                    <DeleteEnrollmentButton
                      enrollmentId={row.id}
                      learner={row.learner.email ?? row.learner.name ?? "this learner"}
                      courseTitle={row.course.title}
                      paid={payment && wasCharged(payment.status) ? formatPriceCents(payment.amountCents, payment.currency) : null}
                    />
                  </AdminTableCell>
                </AdminTableRow>
              );
            })}
          </AdminTableBody>
        </AdminTable>
      )}
      <AdminPagination page={page} hrefFor={hrefFor} />
    </div>
  );
}
