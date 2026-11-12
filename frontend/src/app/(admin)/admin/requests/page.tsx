import Link from "next/link";
import type { AdminCourseRequestsView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminBulkBar } from "@/components/admin/admin-bulk-bar";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  bulkApproveCourseRequestsAction,
  bulkRejectCourseRequestsAction,
} from "@/server/actions/admin/bulk";
import {
  approveOrganizationCourseRequestAction,
  rejectOrganizationCourseRequestAction,
} from "@/server/actions/admin/requests";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSection,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
} from "@/components/admin/admin-ui";

export default async function AdminCourseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; recentPage?: string; q?: string; recentStatus?: string }>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const recentPage = Number(sp.recentPage) || 1;
  const q = (sp.q ?? "").trim();
  const recentStatus = sp.recentStatus === "APPROVED" || sp.recentStatus === "REJECTED" ? sp.recentStatus : "";
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (recentPage > 1) query.set("recentPage", String(recentPage));
  const qs = query.toString();

  const { pending, pendingPage, recent, recentPage: recentPagination } = await serverApiFetch<AdminCourseRequestsView>(
    `/api/v1/admin/course-requests${qs ? `?${qs}` : ""}`
  );

  // Search and status filters apply to the records loaded for this page.
  const needle = q.toLowerCase();
  const visiblePending = needle
    ? pending.filter((req) =>
        [req.course.title, req.organization.name].some((value) => value.toLowerCase().includes(needle))
      )
    : pending;
  const visibleRecent = recent.filter(
    (row) =>
      (!recentStatus || row.status === recentStatus) &&
      (!needle || [row.courseTitle, row.organizationName].some((value) => value.toLowerCase().includes(needle)))
  );
  const approvedCount = recent.filter((row) => row.status === "APPROVED").length;
  const rejectedCount = recent.filter((row) => row.status === "REJECTED").length;
  const filtering = Boolean(q || recentStatus);

  // Each list pages independently, so one pager must preserve the other's page.
  const pendingHref = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (recentStatus) params.set("recentStatus", recentStatus);
    if (next > 1) params.set("page", String(next));
    if (recentPage > 1) params.set("recentPage", String(recentPage));
    const search = params.toString();
    return `/admin/requests${search ? `?${search}` : ""}`;
  };
  const recentHref = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (recentStatus) params.set("recentStatus", recentStatus);
    if (next > 1) params.set("recentPage", String(next));
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    return `/admin/requests${search ? `?${search}` : ""}`;
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Operations"
        title="Course requests"
        description={
          <>
            Organizations request courses via{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              POST /integrations/v1/course-requests
            </code>
            . Approving creates or updates an allocation.
          </>
        }
      />

      <section aria-label="Queue summary" className="grid grid-cols-3 gap-3">
        <SummaryTile label="Awaiting review" value={pending.length} tone="amber" note={pending.length ? "Needs a decision" : "Queue clear"} />
        <SummaryTile label="Approved" value={approvedCount} tone="green" note="In the recent list" />
        <SummaryTile label="Rejected" value={rejectedCount} tone="rose" note="In the recent list" />
      </section>

      <AdminQueryForm basePath="/admin/requests" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:max-w-sm">
          Search course or organization
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="e.g. Acme or Python"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
            Apply
          </button>
          {filtering ? (
            <Link href="/admin/requests" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
              Clear filters
            </Link>
          ) : null}
        </div>
      </AdminQueryForm>

      <AdminSection title="Pending review" className="mt-0" description={`${visiblePending.length} of ${pending.length} shown`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AdminBulkBar
            action={bulkApproveCourseRequestsAction}
            submitLabel="Approve selected"
            pendingLabel="Approving…"
            variant="default"
            confirm={{
              question: "Approve the selected requests?",
              description: "One cap and expiry are applied to every selected request, creating their allocations.",
              confirmLabel: "Approve selected",
            }}
            approveFields={{ maxEnrollments: 100, expiresAt: "" }}
          />
          <AdminBulkBar
            action={bulkRejectCourseRequestsAction}
            submitLabel="Reject selected"
            pendingLabel="Rejecting…"
            variant="outline"
            confirm={{
              question: "Reject the selected requests?",
              description: "They are closed. The organizations can request the courses again later.",
              confirmLabel: "Reject selected",
            }}
          />
        </div>
        {visiblePending.length === 0 ? (
          <AdminEmptyState
            title={filtering && pending.length ? "No pending requests match" : "No pending requests"}
            description={filtering && pending.length ? "Try a different search." : "New organization requests will appear here."}
          />
        ) : (
          <ul className="space-y-4">
            {visiblePending.map((req) => (
              <li key={req.id}>
                <AdminPanel>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        data-bulk-id
                        value={req.id}
                        aria-label={`Select the request for ${req.course.title}`}
                        className="mt-0.5 size-4 rounded border-input"
                      />
                      <div>
                        <p className="font-semibold">{req.course.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Requested by{" "}
                          <Link
                            href={`/admin/organizations/${req.organization.id}`}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            {req.organization.name}
                          </Link>{" "}
                          · {new Date(req.requestedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{req.course.status}</Badge>
                  </div>

                  <AdminActionForm
                    action={approveOrganizationCourseRequestAction}
                    submitLabel="Approve"
                    pendingLabel="Approving…"
                    className="mt-5 space-y-4"
                  >
                    <input type="hidden" name="requestId" value={req.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`max-${req.id}`}>Max enrollments</Label>
                        <Input
                          id={`max-${req.id}`}
                          name="maxEnrollments"
                          type="number"
                          min={1}
                          defaultValue={100}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`exp-${req.id}`}>Expires (optional)</Label>
                        <Input id={`exp-${req.id}`} name="expiresAt" type="date" />
                      </div>
                    </div>
                  </AdminActionForm>

                  <AdminActionForm
                    action={rejectOrganizationCourseRequestAction}
                    submitLabel="Reject"
                    pendingLabel="Rejecting…"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    confirm={{
                      question: `Reject ${req.organization.name}'s request for ${req.course.title}?`,
                      description: "The request is closed. The organization can request the course again later.",
                      confirmLabel: "Reject request",
                    }}
                  >
                    <input type="hidden" name="requestId" value={req.id} />
                  </AdminActionForm>
                </AdminPanel>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminPagination page={pendingPage} hrefFor={pendingHref} />

      {recent.length > 0 ? (
        <AdminSection title="Recently reviewed" className="mt-0" description={`${visibleRecent.length} shown`}>
          <AdminQueryForm basePath="/admin/requests" className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Status
              <select name="recentStatus" defaultValue={recentStatus} className="flex h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <option value="">All</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>
            <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Filter</button>
          </AdminQueryForm>
          <AdminTable>
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Course</AdminTableHeaderCell>
                <AdminTableHeaderCell>Organization</AdminTableHeaderCell>
                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                <AdminTableHeaderCell>Reviewed</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {visibleRecent.map((row) => (
                <AdminTableRow key={row.id}>
                  <AdminTableCell>{row.courseTitle}</AdminTableCell>
                  <AdminTableCell>{row.organizationName}</AdminTableCell>
                  <AdminTableCell>
                    <Badge variant={row.status === "APPROVED" ? "secondary" : "outline"}>
                      {row.status}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    {row.reviewedAt ? new Date(row.reviewedAt).toLocaleDateString() : "—"}
                    {row.reviewerEmail ? ` · ${row.reviewerEmail}` : ""}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
          <AdminPagination page={recentPagination} hrefFor={recentHref} />
        </AdminSection>
      ) : null}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone: "amber" | "green" | "rose";
}) {
  const dot = { amber: "bg-amber-500", green: "bg-emerald-500", rose: "bg-rose-500" }[tone];
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgb(10_15_44/4%)] sm:p-5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
