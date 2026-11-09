import Link from "next/link";
import type { AdminOrganizationsView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import { buildPagedQuery } from "@/components/admin/admin-list-controls";
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

type SearchParams = { query?: string; page?: string };

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = { query: sp.query };
  const qs = buildPagedQuery(filters, Number(sp.page) || 1);
  const { organizations, page } = await serverApiFetch<AdminOrganizationsView>(
    `/api/v1/admin/organizations${qs ? `?${qs}` : ""}`
  );

  const filtering = Boolean(sp.query);

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Tenants"
        title="Organizations"
        description="External platforms (e.g. Pathment) authenticate with org-scoped API credentials."
        actions={
          <Link href="/admin/organizations/new" className={cn(buttonVariants())}>
            New organization
          </Link>
        }
      />

      <AdminQueryForm basePath="/admin/organizations" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-80">
          Search name or slug
          <input
            type="search"
            name="query"
            defaultValue={sp.query ?? ""}
            placeholder="e.g. acme"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
            Search
          </button>
          {filtering ? (
            <Link
              href="/admin/organizations"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </AdminQueryForm>

      <div>
        {organizations.length === 0 ? (
          <AdminEmptyState
            title={filtering ? "No organizations match" : "No organizations yet"}
            description={
              filtering
                ? "Try a different name or slug."
                : "Create a tenant to issue API keys and allocate courses for integration enrollments."
            }
            action={
              !filtering ? (
                <Link href="/admin/organizations/new" className={cn(buttonVariants())}>
                  Create organization
                </Link>
              ) : undefined
            }
          />
        ) : (
          <AdminTable minWidth="640px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Name</AdminTableHeaderCell>
                <AdminTableHeaderCell>Slug</AdminTableHeaderCell>
                <AdminTableHeaderCell>Access key</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Allocations</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Enrollments</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {organizations.map((org) => (
                <AdminTableRow key={org.id}>
                  <AdminTableCell>
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {org.name}
                    </Link>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="font-mono text-xs text-muted-foreground">{org.slug}</span>
                  </AdminTableCell>
                  <AdminTableCell className="max-w-[12rem]">
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {org.accessKey ?? "—"}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {org.allocationCount}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {org.enrollmentCount}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </div>

      <AdminPagination page={page} hrefFor={(next) => `/admin/organizations?${buildPagedQuery(filters, next)}`} />
    </div>
  );
}
