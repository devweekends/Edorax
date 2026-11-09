import type { AdminAuditView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import Link from "next/link";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const q = (sp.q ?? "").trim().slice(0, 120);

  const qs = new URLSearchParams();
  if (page > 1) qs.set("page", String(page));
  if (q) qs.set("query", q);
  const search = qs.toString();

  const { entries, page: pagination } = await serverApiFetch<AdminAuditView>(
    `/api/v1/admin/audit${search ? `?${search}` : ""}`
  );

  // Keeps the search term when moving between pages.
  const hrefFor = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next > 1) params.set("page", String(next));
    const value = params.toString();
    return `/admin/audit${value ? `?${value}` : ""}`;
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Recent platform-admin actions. Records are append-only and survive account changes."
        actions={
          <a href="/api/v1/admin/audit/export" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Export CSV
          </a>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <AdminQueryForm basePath="/admin/audit" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
          <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-80">
            Search actor, action, or target
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="e.g. alex@ or organization.create"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
              Search
            </button>
            {q ? (
              <Link href="/admin/audit" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
                Clear
              </Link>
            ) : null}
          </div>
        </AdminQueryForm>
        <p className="text-xs tabular-nums text-muted-foreground">
          {pagination.total.toLocaleString()} {pagination.total === 1 ? "record" : "records"}
          {q ? " match" : ""}
        </p>
      </div>

      <div>
        {entries.length === 0 ? (
          <AdminEmptyState
            title={q ? "No records match this search" : "No admin actions yet"}
            description={
              q
                ? "Try a different actor, action, or target."
                : "Organization, course-request, access, and allocation changes will appear here."
            }
          />
        ) : (
          <AdminTable minWidth="760px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>When</AdminTableHeaderCell>
                <AdminTableHeaderCell>Action</AdminTableHeaderCell>
                <AdminTableHeaderCell>Detail</AdminTableHeaderCell>
                <AdminTableHeaderCell>Target</AdminTableHeaderCell>
                <AdminTableHeaderCell>Actor</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {entries.map((entry) => (
                <AdminTableRow key={entry.id}>
                  <AdminTableCell className="whitespace-nowrap text-muted-foreground">
                    <time dateTime={entry.createdAt} className="tabular-nums">
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]">{entry.action}</span>
                  </AdminTableCell>
                  <AdminTableCell>{entry.summary}</AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    <span className="font-mono text-xs">
                      {entry.targetType}
                      {entry.targetId ? `:${entry.targetId}` : ""}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell className="font-mono text-xs text-muted-foreground">{entry.actorEmail}</AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </div>

      <AdminPagination page={pagination} hrefFor={hrefFor} />
    </div>
  );
}
