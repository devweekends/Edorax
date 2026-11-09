import Link from "next/link";
import type { AdminCoursesView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { setCourseStatusAction } from "@/server/actions/admin/courses";
import { formatPriceCents } from "@/lib/format-price";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
  adminSelectClassName,
} from "@/components/admin/admin-ui";
import { buildListQuery, buildPagedQuery } from "@/components/admin/admin-list-controls";
import { AdminLiveFilterBar } from "@/components/admin/admin-live-filter-bar";
import { AdminPagination } from "@/components/admin/admin-pagination";

type SearchParams = { query?: string; status?: string; page?: string };

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filters = { query: sp.query, status: sp.status };
  const qs = buildPagedQuery(filters, Number(sp.page) || 1);
  const { courses, page } = await serverApiFetch<AdminCoursesView>(
    `/api/v1/admin/courses${qs ? `?${qs}` : ""}`
  );

  const filtering = Boolean(sp.query || sp.status);
  const exportQuery = buildListQuery({ query: sp.query, status: sp.status });

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Courses"
        description="Read-only view for support, allocation decisions, and integration troubleshooting."
        actions={
          <a
            href={`/api/v1/admin/courses/export${exportQuery ? `?${exportQuery}` : ""}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Export CSV
          </a>
        }
      />

      <AdminLiveFilterBar
        action="/admin/courses"
        showClear={filtering}
        values={{ query: sp.query, status: sp.status }}
        fields={[
          { name: "query", label: "Search title or slug", kind: "search", placeholder: "e.g. multi-vendor" },
          {
            name: "status",
            label: "Status",
            kind: "select",
            options: [
              { value: "", label: "Any status" },
              { value: "PUBLISHED", label: "Published" },
              { value: "DRAFT", label: "Draft" },
              { value: "ARCHIVED", label: "Archived" },
            ],
          },
        ]}
      />

      <div>
        {courses.length === 0 ? (
          <AdminEmptyState
            title={filtering ? "No courses match these filters" : "No courses yet"}
            description={filtering ? "Try a different search or status." : "Published courses will appear here."}
          />
        ) : (
          <AdminTable minWidth="900px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Title</AdminTableHeaderCell>
                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                <AdminTableHeaderCell>Pricing</AdminTableHeaderCell>
                <AdminTableHeaderCell>Instructor</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Enrollments</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Org allocations</AdminTableHeaderCell>
                <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {courses.map((course) => (
                <AdminTableRow key={course.id}>
                  <AdminTableCell>
                    <Link
                      href={`/courses/${course.slug}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {course.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{course.slug}</p>
                  </AdminTableCell>
                  <AdminTableCell>
                    <Badge variant={course.status === "PUBLISHED" ? "secondary" : "outline"}>
                      {course.status}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell>
                    {course.pricingType === "PAID"
                      ? formatPriceCents(course.priceCents ?? 0, course.currency ?? "USD")
                      : "Free"}
                  </AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">{course.instructorLabel}</AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {course.enrollmentCount}
                  </AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {course.allocationCount}
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminActionForm
                      action={setCourseStatusAction}
                      submitLabel="Change status"
                      pendingLabel="Saving…"
                      variant="outline"
                      size="sm"
                      confirm={{
                        question: `Change status for "${course.title}"?`,
                        description:
                          course.status === "PUBLISHED"
                            ? "Unpublishing or archiving hides it from the catalog. Learner progress is kept."
                            : "Publishing makes it visible in the catalog.",
                        confirmLabel: "Apply status",
                        fields: (
                          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                            New status
                            <select name="status" required defaultValue="" className={adminSelectClassName}>
                              <option value="" disabled>
                                Choose…
                              </option>
                              {(["PUBLISHED", "DRAFT", "ARCHIVED"] as const)
                                .filter((value) => value !== course.status)
                                .map((value) => (
                                  <option key={value} value={value}>
                                    {value === "DRAFT" ? "Draft (unpublish)" : value.charAt(0) + value.slice(1).toLowerCase()}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ),
                      }}
                    >
                      <input type="hidden" name="courseId" value={course.id} />
                    </AdminActionForm>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </div>

      <AdminPagination page={page} hrefFor={(next) => `/admin/courses?${buildPagedQuery(filters, next)}`} />
    </div>
  );
}
