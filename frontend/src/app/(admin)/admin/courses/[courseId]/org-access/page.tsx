import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminCourseOrgAccessView, AdminOrganizationsView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import {
  grantCourseOrgAccessAction,
  revokeCourseOrgAccessAction,
} from "@/server/actions/admin/course-org-access";
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

export default async function CourseOrgAccessPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireRole("ADMIN");
  const { courseId } = await params;

  const [access, orgs] = await Promise.all([
    serverApiFetch<AdminCourseOrgAccessView>(
      `/api/v1/admin/courses/${encodeURIComponent(courseId)}/org-access`
    ).catch(() => null),
    serverApiFetch<AdminOrganizationsView>("/api/v1/admin/organizations?pageSize=200"),
  ]);
  if (!access) notFound();

  const granted = new Set(access.grants.map((grant) => grant.organization.id));
  const available = orgs.organizations.filter((org) => !granted.has(org.id));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Free access for organizations"
        description={`Organizations listed here see "${access.course.title}" as free when a platform admin assigns it through Pathment. Credits and contribution coupons do not apply to these assignments. Instructors cannot change this list.`}
        actions={
          <Link href="/admin/courses" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Back to courses
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Granted organizations</h2>
        {access.grants.length === 0 ? (
          <AdminEmptyState
            title="No organizations have free access"
            description="Grant free access below. Other courses keep using credits or contribution coupons."
          />
        ) : (
          <AdminTable minWidth="640px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Organization</AdminTableHeaderCell>
                <AdminTableHeaderCell>Granted</AdminTableHeaderCell>
                <AdminTableHeaderCell>Pricing for org</AdminTableHeaderCell>
                <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {access.grants.map((grant) => (
                <AdminTableRow key={grant.organization.id}>
                  <AdminTableCell>
                    <p className="font-medium text-foreground">{grant.organization.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{grant.organization.slug}</p>
                  </AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    {new Date(grant.createdAt).toLocaleDateString()}
                  </AdminTableCell>
                  <AdminTableCell>
                    <Badge variant="secondary">Free</Badge>
                  </AdminTableCell>
                  <AdminTableCell>
                    <AdminActionForm
                      action={revokeCourseOrgAccessAction}
                      submitLabel="Revoke"
                      pendingLabel="Revoking…"
                      variant="destructive"
                      size="sm"
                      confirm={{
                        question: `Revoke free access for ${grant.organization.name}?`,
                        description:
                          "Future Pathment assignments of this course to the organization will use credits or coupons again. Existing enrollments are not changed.",
                        confirmLabel: "Revoke free access",
                      }}
                    >
                      <input type="hidden" name="courseId" value={access.course.id} />
                      <input type="hidden" name="organizationId" value={grant.organization.id} />
                    </AdminActionForm>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Grant free access</h2>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every organization already has free access to this course.</p>
        ) : (
          <AdminActionForm
            action={grantCourseOrgAccessAction}
            submitLabel="Grant free access"
            pendingLabel="Granting…"
            confirm={{
              question: `Grant free access to "${access.course.title}"?`,
              description:
                "The selected organization will see this course as free for Pathment assignments. Credits and contribution coupons will not be charged.",
              confirmLabel: "Grant free access",
              fields: (
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Organization
                  <select name="organizationId" required defaultValue="" className={adminSelectClassName}>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {available.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            }}
          >
            <input type="hidden" name="courseId" value={access.course.id} />
          </AdminActionForm>
        )}
      </section>
    </div>
  );
}
