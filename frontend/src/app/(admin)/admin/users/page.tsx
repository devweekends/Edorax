import Link from "next/link";
import type { AdminUserRow, AdminUsersView } from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, MoreHorizontal } from "lucide-react";
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

const ROLE_TABS = [
  { label: "All users", value: "" },
  { label: "Mentees", value: "MENTEE" },
  { label: "Instructors", value: "MENTOR" },
  { label: "Admins", value: "ADMIN" },
] as const;

type SearchParams = {
  query?: string;
  role?: string;
  verified?: string;
  enrolled?: string;
  page?: string;
  requestsPage?: string;
};

function initialsOf(name: string | null, email: string) {
  const parts = (name ?? email).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (parts.map((part) => part[0]).join("") || "?").toUpperCase();
}

const MENU_ACTION = "w-full justify-start text-left font-medium";

function RowActions({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${user.email}`} />
        }
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1.5">
        <Link
          href={`/admin/users/${user.id}`}
          className="block rounded-md px-2.5 py-2 text-sm hover:bg-muted"
        >
          View account
        </Link>
        <div className="my-1 border-t border-border" />

        {user.role === "ADMIN" ? (
          isSelf ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">You cannot change your own admin access.</p>
          ) : (
            <AdminActionForm
              action={revokeAdminAction}
              submitLabel="Revoke platform admin"
              pendingLabel="Revoking…"
              variant="ghost"
              size="sm"
              className="block"
              buttonClassName={MENU_ACTION}
              confirm={{
                question: `Revoke platform-admin access from ${user.email}?`,
                description: "They keep their account but lose access to the admin console.",
                confirmLabel: "Revoke admin",
              }}
            >
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="email" value={user.email} />
            </AdminActionForm>
          )
        ) : (
          <AdminActionForm
            action={setUserInstructorAccessAction}
            submitLabel={user.role === "MENTOR" ? "Revoke instructor access" : "Make instructor"}
            pendingLabel={user.role === "MENTOR" ? "Revoking…" : "Sending…"}
            variant="ghost"
            size="sm"
            className="block"
            buttonClassName={MENU_ACTION}
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

        <AdminActionForm
          action={setUserZipImportAccessAction}
          submitLabel={user.zipImportEnabled ? "Disable ZIP import" : "Enable ZIP import"}
          pendingLabel={user.zipImportEnabled ? "Disabling…" : "Enabling…"}
          variant="ghost"
          size="sm"
          className="block"
          buttonClassName={MENU_ACTION}
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

        <AdminActionForm
          action={setUserTesterAccessAction}
          submitLabel={user.testerEnabled ? "Disable tester access" : "Enable tester access"}
          pendingLabel={user.testerEnabled ? "Disabling…" : "Enabling…"}
          variant="ghost"
          size="sm"
          className="block"
          buttonClassName={MENU_ACTION}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  // Role tabs keep the search and verification filters and reset paging.
  const tabHref = (role: string) => {
    const params = new URLSearchParams();
    if (sp.query) params.set("query", sp.query);
    if (sp.verified) params.set("verified", sp.verified);
    if (sp.enrolled) params.set("enrolled", sp.enrolled);
    if (role) params.set("role", role);
    const q = params.toString();
    return `/admin/users${q ? `?${q}` : ""}`;
  };
  const exportQuery = buildListQuery({
    query: sp.query,
    role: sp.role,
    verified: sp.verified,
    enrolled: sp.enrolled,
  });

  return (
    <div className="space-y-4">
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

      <input
        id="user-filter-toggle"
        type="checkbox"
        defaultChecked={filtering}
        className="peer sr-only"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 peer-checked:hidden py-3">
      <nav aria-label="Filter by role" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ROLE_TABS.map((tab) => {
          const active = (sp.role ?? "") === tab.value;
          return (
            <Link
              key={tab.label}
              href={tabHref(tab.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center rounded-lg px-3.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-card text-primary shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
        <label
          htmlFor="user-filter-toggle"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
        >
          <Filter className="size-4" aria-hidden />
          Filter
        </label>
      </div>

      <div className="hidden peer-checked:block">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="flex items-start justify-between gap-3 lg:hidden">
            <div>
              <h2 className="text-sm font-semibold">Filter users</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Narrow the list by name, email, role, or status.</p>
            </div>
            <label
              htmlFor="user-filter-toggle"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
            >
              Close
            </label>
          </div>

          <div className="min-w-0 flex-1 [&>form]:mt-0 [&>form]:lg:flex-nowrap [&_label]:lg:min-w-0 [&_label]:lg:w-22 [&_label:nth-child(4)]:lg:w-40 [&_label:first-child]:lg:w-auto [&_label:first-child]:lg:flex-1">
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
          </div>

          <label
            htmlFor="user-filter-toggle"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden cursor-pointer lg:inline-flex")}
          >
            Close
          </label>
        </div>
      </div>

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
            showWhen="active"
            icon="suspend"
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
            showWhen="suspended"
            icon="reinstate"
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
        <AdminTable minWidth="640px">
          <AdminTableHead>
            <tr>
              <AdminTableHeaderCell>
                <span className="sr-only">Select</span>
              </AdminTableHeaderCell>
              <AdminTableHeaderCell>User</AdminTableHeaderCell>
              <AdminTableHeaderCell className="w-px whitespace-nowrap">Role</AdminTableHeaderCell>
              <AdminTableHeaderCell className="w-px whitespace-nowrap">Verified</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right" className="w-px whitespace-nowrap">Enrollments</AdminTableHeaderCell>
              <AdminTableHeaderCell>Access</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">
                <span className="sr-only">Actions</span>
              </AdminTableHeaderCell>
            </tr>
          </AdminTableHead>
          <AdminTableBody>
            {users.map((user) => (
              <AdminTableRow key={user.id}>
                <AdminTableCell>
                  <input
                    type="checkbox"
                    data-bulk-id
                    data-suspended={user.suspended ? "true" : "false"}
                    value={user.id}
                    aria-label={`Select ${user.email}`}
                    className="size-4 rounded border-input"
                  />
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                    >
                      {initialsOf(user.name, user.email)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="block truncate font-medium hover:text-primary hover:underline"
                      >
                        {user.name ?? "—"}
                      </Link>
                      <p className="truncate font-mono text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="w-px whitespace-nowrap">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{user.role}</Badge>
                    {user.suspended ? <Badge variant="destructive">Suspended</Badge> : null}
                  </div>
                </AdminTableCell>
                <AdminTableCell className="w-px whitespace-nowrap">
                  {user.emailVerified ? (
                    <Badge variant="secondary">Verified</Badge>
                  ) : (
                    <Badge variant="outline">Unverified</Badge>
                  )}
                </AdminTableCell>
                <AdminTableCell align="right" className="w-px whitespace-nowrap tabular-nums">
                  {user.enrollmentCount}
                </AdminTableCell>
                <AdminTableCell>
                  {user.zipImportEnabled || user.testerEnabled ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {user.zipImportEnabled ? <Badge variant="secondary">ZIP import</Badge> : null}
                      {user.testerEnabled ? <Badge variant="secondary">Tester</Badge> : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </AdminTableCell>
                <AdminTableCell align="right">
                  <RowActions user={user} isSelf={user.id === currentAdmin.id} />
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
