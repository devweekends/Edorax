import Link from "next/link";
import type { AdminUsersView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminRoleInviteDialog } from "@/components/admin/admin-role-invite-dialog";
import { AdminBulkBar } from "@/components/admin/admin-bulk-bar";
import { bulkReinstateUsersAction, bulkSuspendUsersAction } from "@/server/actions/admin/bulk";
import { requireRole } from "@/server/auth/guards";
import {
  revokeAdminAction,
  setUserInstructorAccessAction,
  setUserTesterAccessAction,
  setUserZipImportAccessAction,
} from "@/server/actions/admin/users";
import {
  approveInstructorAccessRequestAction,
  rejectInstructorAccessRequestAction,
} from "@/server/actions/admin/instructor-access-requests";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
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

type SearchParams = {
  query?: string;
  role?: string;
  verified?: string;
  enrolled?: string;
  page?: string;
  requestsPage?: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await requireRole("ADMIN");
  const sp = await searchParams;
  const filters = { query: sp.query, role: sp.role, verified: sp.verified, enrolled: sp.enrolled };
  const accountsPage = Number(sp.page) || 1;
  const requestsPage = Number(sp.requestsPage) || 1;

  // Two independent pagers on this page; each link preserves the other's state.
  const hrefFor = (overrides: { page?: number; requestsPage?: number }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const nextPage = overrides.page ?? accountsPage;
    const nextRequests = overrides.requestsPage ?? requestsPage;
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextRequests > 1) params.set("requestsPage", String(nextRequests));
    const qs = params.toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  };

  const qs = hrefFor({}).split("?")[1] ?? "";
  const { pendingInstructorRequests, pendingRequestsPage, users, page } = await serverApiFetch<AdminUsersView>(
    `/api/v1/admin/users${qs ? `?${qs}` : ""}`
  );

  const filtering = Boolean(sp.query || sp.role || sp.verified || sp.enrolled);
  const exportQuery = buildListQuery({
    query: sp.query,
    role: sp.role,
    verified: sp.verified,
    enrolled: sp.enrolled,
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Accounts"
        title="Users"
        description={
          <>
            Manage account roles, access, and invitations.{" "}
            <Link href="/admin/course-access" className="font-medium text-primary underline-offset-4 hover:underline">
              Review course access requests
            </Link>
          </>
        }
        actions={
          <>
            <a
              href={`/api/v1/admin/users/export${exportQuery ? `?${exportQuery}` : ""}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Export CSV
            </a>
            <AdminRoleInviteDialog />
          </>
        }
      />

      <AdminLiveFilterBar
        action="/admin/users"
        showClear={filtering}
        values={{ query: sp.query, role: sp.role, verified: sp.verified, enrolled: sp.enrolled }}
        fields={[
          { name: "query", label: "Search name or email", kind: "search", placeholder: "e.g. mentor@" },
          {
            name: "role",
            label: "Role",
            kind: "select",
            options: [
              { value: "", label: "Any role" },
              { value: "MENTEE", label: "Mentee" },
              { value: "MENTOR", label: "Mentor" },
              { value: "ADMIN", label: "Admin" },
            ],
          },
          {
            name: "verified",
            label: "Verified",
            kind: "select",
            options: [
              { value: "", label: "Any" },
              { value: "true", label: "Verified" },
              { value: "false", label: "Unverified" },
            ],
          },
          {
            name: "enrolled",
            label: "Enrollments",
            kind: "select",
            options: [
              { value: "", label: "Any" },
              { value: "true", label: "Enrolled" },
              { value: "false", label: "No enrollments" },
            ],
          },
        ]}
      />

      {pendingInstructorRequests.length > 0 ? (
        <AdminPanel className="mt-8">
          <h2 className="text-sm font-semibold">Pending instructor access requests</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Learners asked to create and teach courses. Approve to enable the instructor workspace switch.
          </p>
          <ul className="mt-4 space-y-3">
            {pendingInstructorRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{request.user.name ?? "Learner"}</p>
                  <p className="font-mono text-xs text-muted-foreground">{request.user.email}</p>
                  {request.message ? (
                    <p className="mt-1 text-xs text-muted-foreground">{request.message}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <AdminActionForm
                    action={approveInstructorAccessRequestAction}
                    submitLabel="Approve"
                    pendingLabel="Approving…"
                    size="sm"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                  </AdminActionForm>
                  <AdminActionForm
                    action={rejectInstructorAccessRequestAction}
                    submitLabel="Reject"
                    pendingLabel="Rejecting…"
                    variant="outline"
                    size="sm"
                    confirm={{
                      question: `Reject the instructor request from ${request.user.email}?`,
                      description: "They keep their learner account and can request again later.",
                      confirmLabel: "Reject request",
                    }}
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                  </AdminActionForm>
                </div>
              </li>
            ))}
          </ul>
          <AdminPagination page={pendingRequestsPage} hrefFor={(next) => hrefFor({ requestsPage: next })} />
        </AdminPanel>
      ) : null}

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <AdminBulkBar
            action={bulkSuspendUsersAction}
            submitLabel="Suspend selected"
            pendingLabel="Suspending…"
            variant="destructive"
            confirm={{
              question: "Suspend the selected accounts?",
              description:
                "Each is signed out everywhere and blocked from signing in until reinstated. Enrollments and data are kept.",
              confirmLabel: "Suspend selected",
            }}
            noteField={{ label: "Reason (optional)", placeholder: "e.g. chargeback dispute" }}
          />
          <AdminBulkBar
            action={bulkReinstateUsersAction}
            submitLabel="Reinstate selected"
            pendingLabel="Reinstating…"
            variant="outline"
            confirm={{
              question: "Reinstate the selected accounts?",
              description: "They can sign in again immediately.",
              confirmLabel: "Reinstate selected",
            }}
          />
        </div>
        {users.length === 0 ? (
          <AdminEmptyState
            title={filtering ? "No users match these filters" : "No users yet"}
            description={
              filtering
                ? "Try a different search, role, or verification state."
                : "Accounts appear here as people sign up."
            }
          />
        ) : (
        <AdminTable minWidth="720px">
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>
                <span className="sr-only">Select</span>
              </AdminTableHeaderCell>
              <AdminTableHeaderCell>User</AdminTableHeaderCell>
              <AdminTableHeaderCell>Role</AdminTableHeaderCell>
              <AdminTableHeaderCell>Verified</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">Enrollments</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">Courses</AdminTableHeaderCell>
              <AdminTableHeaderCell>Access</AdminTableHeaderCell>
              <AdminTableHeaderCell>ZIP import</AdminTableHeaderCell>
              <AdminTableHeaderCell>Tester</AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {users.map((user) => (
              <AdminTableRow key={user.id}>
                <AdminTableCell>
                  <input
                    type="checkbox"
                    data-bulk-id
                    value={user.id}
                    aria-label={`Select ${user.email}`}
                    className="size-4 rounded border-input"
                  />
                </AdminTableCell>
                <AdminTableCell>
                  <Link href={`/admin/users/${user.id}`} className="font-medium hover:text-primary hover:underline">
                    {user.name ?? "—"}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{user.email}</p>
                </AdminTableCell>
                <AdminTableCell>
                  <Badge variant="outline">{user.role}</Badge>
                  {user.suspended ? (
                    <Badge variant="destructive" className="ml-1.5">
                      Suspended
                    </Badge>
                  ) : null}
                </AdminTableCell>
                <AdminTableCell>
                  {user.emailVerified ? (
                    <Badge variant="secondary">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {user.enrollmentCount}
                </AdminTableCell>
                <AdminTableCell align="right" className="tabular-nums">
                  {user.courseCount}
                </AdminTableCell>
                <AdminTableCell>
                  {user.role === "ADMIN" ? (
                    <div className="space-y-1.5">
                      <Badge variant="secondary">Platform admin</Badge>
                      {user.id === currentAdmin.id ? (
                        <p className="text-xs text-muted-foreground">You</p>
                      ) : (
                        <AdminActionForm
                          action={revokeAdminAction}
                          submitLabel="Revoke admin"
                          pendingLabel="Revoking…"
                          variant="outline"
                          size="sm"
                          confirm={{
                            question: `Revoke platform-admin access from ${user.email}?`,
                            description: "They keep their account but lose access to the admin console.",
                            confirmLabel: "Revoke admin",
                          }}
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="email" value={user.email} />
                        </AdminActionForm>
                      )}
                    </div>
                  ) : (
                    <AdminActionForm
                      action={setUserInstructorAccessAction}
                      submitLabel={user.role === "MENTOR" ? "Revoke" : "Invite"}
                      pendingLabel={user.role === "MENTOR" ? "Revoking…" : "Sending…"}
                      variant={user.role === "MENTOR" ? "outline" : "default"}
                      size="sm"
                      confirm={
                        user.role === "MENTOR"
                          ? {
                              question: `Revoke instructor access for ${user.email}?`,
                              description: "They lose the instructor workspace and revert to a learner account.",
                              confirmLabel: "Revoke access",
                            }
                          : undefined
                      }
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="enabled" value={user.role === "MENTOR" ? "false" : "true"} />
                    </AdminActionForm>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <AdminActionForm
                    action={setUserZipImportAccessAction}
                    submitLabel={user.zipImportEnabled ? "Disable" : "Enable"}
                    pendingLabel={user.zipImportEnabled ? "Disabling…" : "Enabling…"}
                    variant="outline"
                    size="sm"
                    confirm={
                      user.zipImportEnabled
                        ? {
                            question: `Disable ZIP import for ${user.email}?`,
                            description: "They will no longer be able to import a course from a ZIP file.",
                            confirmLabel: "Disable ZIP import",
                          }
                        : undefined
                    }
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="enabled" value={String(!user.zipImportEnabled)} />
                  </AdminActionForm>
                </AdminTableCell>
                <AdminTableCell>
                  <AdminActionForm
                    action={setUserTesterAccessAction}
                    submitLabel={user.testerEnabled ? "Disable" : "Enable"}
                    pendingLabel={user.testerEnabled ? "Disabling…" : "Enabling…"}
                    variant="outline"
                    size="sm"
                    confirm={
                      user.testerEnabled
                        ? {
                            question: `Disable tester access for ${user.email}?`,
                            description: "They will follow sequential chapter locks again like other learners.",
                            confirmLabel: "Disable tester access",
                          }
                        : undefined
                    }
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="enabled" value={String(!user.testerEnabled)} />
                  </AdminActionForm>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTableBody>
        </AdminTable>
        )}
        <AdminPagination page={page} hrefFor={(next) => hrefFor({ page: next })} />
        </div>
    </div>
  );
}
