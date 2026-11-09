import Link from "next/link";
import type { AdminCoursesView, AdminUserDetail } from "@/shared/api/admin";
import { serverApiFetch, serverApiFetchOrNotFound } from "@/lib/api-server";
import { Badge } from "@/components/ui/badge";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminEnrollUserDialog } from "@/components/admin/admin-enroll-user-dialog";
import { requireRole } from "@/server/auth/guards";
import {
  forceVerifyEmailAction,
  reinstateUserAction,
  removeUserEnrollmentAction,
  revokeUserSessionsAction,
  suspendUserAction,
} from "@/server/actions/admin/users";
import { resetUserMfaAction } from "@/server/actions/admin/mfa";
import {
  AdminActionRow,
  AdminBackLink,
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
  adminSelectClassName,
} from "@/components/admin/admin-ui";

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const currentAdmin = await requireRole("ADMIN");
  const [{ user, enrollments, coursesOwned }, coursesData] = await Promise.all([
    serverApiFetchOrNotFound<AdminUserDetail>(
      `/api/v1/admin/users/${encodeURIComponent(userId)}`
    ),
    serverApiFetch<AdminCoursesView>("/api/v1/admin/courses?pageSize=100&status=PUBLISHED").catch(() => ({
      courses: [],
    })),
  ]);

  const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
  const availableCourses = (coursesData?.courses ?? []).filter(
    (c) => !enrolledCourseIds.has(c.id)
  );

  const isSelf = user.id === currentAdmin.id;

  return (
    <div className="space-y-8">
      <AdminBackLink href="/admin/users">← Back to users</AdminBackLink>

      <div>
        <AdminPageHeader
          eyebrow="Account"
          title={user.name ?? user.email}
          description={<span className="font-mono text-xs">{user.email}</span>}
          actions={
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{user.role}</Badge>
              {user.emailVerified ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
              {user.suspended ? <Badge variant="destructive">Suspended</Badge> : null}
            </div>
          }
        />
      </div>

      {user.suspended ? (
        <AdminPanel className="mt-6 border-destructive/30 bg-destructive/5">
          <h2 className="text-sm font-semibold text-destructive">Account suspended</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Sign-in is blocked and every existing session is rejected.
            {user.suspensionNote ? ` Note: ${user.suspensionNote}` : ""}
          </p>
        </AdminPanel>
      ) : null}

      <AdminPanel className="mt-8">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Created" value={new Date(user.createdAt).toLocaleDateString()} />
          <DetailItem label="Enrollments" value={<span className="tabular-nums">{user.enrollmentCount}</span>} />
          <DetailItem label="Courses owned" value={<span className="tabular-nums">{user.courseCount}</span>} />
          <DetailItem label="Active sessions" value={<span className="tabular-nums">{user.activeSessions}</span>} />
          <DetailItem label="ZIP import" value={user.zipImportEnabled ? "Enabled" : "Disabled"} />
          <DetailItem label="Tester" value={user.testerEnabled ? "Enabled (skips sequential locks)" : "Disabled"} />
        </dl>
      </AdminPanel>

      <AdminSection title="Account actions" description="Changes take effect immediately.">
        <AdminPanel>
          <AdminActionRow
            title="Email verification"
            description={
              user.emailVerified
                ? "Verified — the account can reach verified learner and instructor surfaces."
                : "Unverified. Mark it verified when the learner cannot use the confirmation link."
            }
          >
            {!user.emailVerified ? (
              <AdminActionForm
                action={forceVerifyEmailAction}
                submitLabel="Mark email verified"
                pendingLabel="Verifying…"
                variant="outline"
                size="sm"
              >
                <input type="hidden" name="userId" value={user.id} />
              </AdminActionForm>
            ) : null}
          </AdminActionRow>

          <AdminActionRow
            title="Devices"
            description={
              isSelf
                ? "Your own account — sign out from the account menu instead."
                : user.suspended
                  ? `${user.activeSessions} session${user.activeSessions === 1 ? "" : "s"} — blocked while the account is suspended.`
                  : user.activeSessions === 0
                    ? "No active sessions."
                    : `${user.activeSessions} active session${user.activeSessions === 1 ? "" : "s"} — signing out removes them all.`
            }
          >
            {!isSelf && user.activeSessions > 0 ? (
              <AdminActionForm
                action={revokeUserSessionsAction}
                submitLabel="Sign out everywhere"
                pendingLabel="Signing out…"
                variant="outline"
                size="sm"
                confirm={{
                  question: `Sign ${user.email} out of every device?`,
                  description: `Deletes ${user.activeSessions} active session${user.activeSessions === 1 ? "" : "s"}. They must sign in again to continue.`,
                  confirmLabel: "Sign out everywhere",
                }}
              >
                <input type="hidden" name="userId" value={user.id} />
              </AdminActionForm>
            ) : null}
          </AdminActionRow>

          <AdminActionRow
            title={user.suspended ? "Suspended" : "Account status"}
            description={
              user.suspended
                ? "Sign-in is blocked and every existing session is rejected."
                : "Active. Suspending blocks sign-in and rejects the account's sessions."
            }
          >
            {user.suspended ? (
              <AdminActionForm
                action={reinstateUserAction}
                submitLabel="Reinstate account"
                pendingLabel="Reinstating…"
                variant="outline"
                size="sm"
                confirm={{
                  question: `Reinstate ${user.email}?`,
                  description: "They can sign in again immediately.",
                  confirmLabel: "Reinstate account",
                }}
              >
                <input type="hidden" name="userId" value={user.id} />
              </AdminActionForm>
            ) : isSelf ? (
              <span className="text-xs text-muted-foreground">You cannot suspend yourself.</span>
            ) : (
              <AdminActionForm
                action={suspendUserAction}
                submitLabel="Suspend account"
                pendingLabel="Suspending…"
                variant="destructive"
                size="sm"
                confirm={{
                  question: `Suspend ${user.email}?`,
                  description:
                    "They are signed out of every device and cannot sign in until reinstated. Enrollments and data are kept.",
                  confirmLabel: "Suspend account",
                  fields: (
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Reason (optional)
                      <input
                        name="note"
                        maxLength={240}
                        placeholder="e.g. chargeback dispute"
                        className={adminSelectClassName}
                      />
                    </label>
                  ),
                }}
              >
                <input type="hidden" name="userId" value={user.id} />
              </AdminActionForm>
            )}
          </AdminActionRow>
          <AdminActionRow
            title="Two-factor authentication"
            description={
              user.mfaEnabled
                ? "Enabled. Reset it if this admin loses access to their authenticator app."
                : "Not enabled. The account signs in with a password only."
            }
          >
            {user.mfaEnabled ? (
              <AdminActionForm
                action={resetUserMfaAction}
                submitLabel="Reset authenticator app"
                pendingLabel="Resetting…"
                variant="destructive"
                size="sm"
                confirm={{
                  question: `Reset the authenticator app for ${user.email}?`,
                  description:
                    "Their current authenticator stops working and they sign in with their password until they enroll again.",
                  confirmLabel: "Reset authenticator app",
                }}
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="email" value={user.email} />
              </AdminActionForm>
            ) : null}
          </AdminActionRow>
        </AdminPanel>
      </AdminSection>

      <AdminSection
        title="Enrollments"
        description={
          user.enrollmentCount > enrollments.length
            ? `Showing the ${enrollments.length} most recent confirmed enrollments of ${user.enrollmentCount}.`
            : "Confirmed course enrollments for this account."
        }
        action={
          availableCourses.length > 0 ? (
            <AdminEnrollUserDialog
              userId={user.id}
              userEmail={user.email}
              courses={availableCourses}
            />
          ) : null
        }
      >
        {enrollments.length === 0 ? (
          <AdminEmptyState title="No enrollments" description="This account has no confirmed course enrollments yet." />
        ) : (
          <AdminTable minWidth="640px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Course</AdminTableHeaderCell>
                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Progress</AdminTableHeaderCell>
                <AdminTableHeaderCell>Last active</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">Action</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {enrollments.map((row) => (
                <AdminTableRow key={row.id}>
                  <AdminTableCell>
                    <Link
                      href={`/courses/${row.courseSlug}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {row.courseTitle}
                    </Link>
                  </AdminTableCell>
                  <AdminTableCell>
                    <Badge variant={row.lifecycle === "COMPLETED" ? "secondary" : "outline"}>
                      {row.lifecycle === "COMPLETED" ? "Completed" : "Active"}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell align="right" className="tabular-nums">
                    {row.percentComplete}%
                  </AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    {row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleDateString() : "—"}
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <AdminActionForm
                      action={removeUserEnrollmentAction}
                      submitLabel="Remove"
                      pendingLabel="Removing…"
                      variant="destructive"
                      size="sm"
                      confirm={{
                        question: `Remove enrollment from ${row.courseTitle}?`,
                        description: `This removes ${user.email ?? "the user"}'s enrollment and course progress from ${row.courseTitle}.`,
                        confirmLabel: "Remove enrollment",
                      }}
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="enrollmentId" value={row.id} />
                    </AdminActionForm>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminSection>

      <AdminSection title="Courses owned" description="Courses where this account is the instructor.">
        {coursesOwned.length === 0 ? (
          <AdminEmptyState title="No courses owned" description="This account does not instruct any course." />
        ) : (
          <AdminTable minWidth="640px">
            <AdminTableHead>
              <tr>
                <AdminTableHeaderCell>Course</AdminTableHeaderCell>
                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
              </tr>
            </AdminTableHead>
            <AdminTableBody>
              {coursesOwned.map((course) => (
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
                    <Badge variant={course.status === "PUBLISHED" ? "secondary" : "outline"}>{course.status}</Badge>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        )}
      </AdminSection>
    </div>
  );
}
