import type { Request, Response } from "express";
import { created, noContent, ok } from "../utils/responses.js";
import { toCsv } from "../utils/csv.js";
import * as overview from "../services/admin/overview.js";
import * as metrics from "../services/admin/metrics.js";
import * as organizations from "../services/admin/organizations.js";
import * as courseRequests from "../services/admin/course-requests.js";
import * as users from "../services/admin/users.js";
import * as mfa from "../services/admin/mfa.js";
import * as courses from "../services/admin/courses.js";
import * as courseAccess from "../services/admin/course-access.js";
import * as profile from "../services/admin/profile.js";
import * as audit from "../services/admin/audit.js";
import * as appActivity from "../services/activity/reports.js";
import type { AppActivityUsersQuery } from "../validations/activity.js";
import type {
  AdminProfileBody,
  AdminPasswordBody,
  AllocationsBody,
  ApproveCourseRequestBody,
  BulkApproveBody,
  BulkIdsBody,
  BulkSuspendBody,
  CourseStatusBody,
  CreateOrganizationBody,
  GrantAdminBody,
  GrantInstructorBody,
  ListCoursesQuery,
  ListOrganizationsQuery,
  ListRequestsQuery,
  ListUsersQuery,
  MetricsQuery,
  PageQuery,
  SuspendUserBody,
  TotpCodeBody,
} from "../validations/admin.js";

// Platform administration. Every handler runs behind authenticate + requireAdmin.

const param = (req: Request, name: string) => req.params[name] as string;
/** Stable export filename suffix, e.g. 2026-10-26. */
const today = () => new Date().toISOString().slice(0, 10);

// PATCH /api/v1/admin/profile
export async function updateProfile(req: Request, res: Response) {
  await profile.updateAdminProfile(req.user!.id, req.body as AdminProfileBody);
  noContent(res);
}

// PATCH /api/v1/admin/password
export async function updatePassword(req: Request, res: Response) {
  await profile.updateAdminPassword(req.user!.id, req.sessionToken!, req.body as AdminPasswordBody);
  noContent(res);
}

// GET /api/v1/admin/overview
export async function getOverview(_req: Request, res: Response) {
  ok(res, await overview.loadOverview());
}

// GET /api/v1/admin/metrics — platform trends for the overview charts
export async function getMetrics(req: Request, res: Response) {
  const { range } = req.query as MetricsQuery;
  ok(res, await metrics.loadMetrics(range));
}

// GET /api/v1/admin/courses
export async function listCourses(req: Request, res: Response) {
  ok(res, await overview.listCourses(req.query as ListCoursesQuery));
}

// GET /api/v1/admin/courses/:courseId/org-access — organizations with free access to the course
export async function listCourseOrgAccess(req: Request, res: Response) {
  ok(res, await courseAccess.listCourseOrganizationAccess(param(req, "courseId")));
}

// POST /api/v1/admin/courses/:courseId/org-access — grant free access to an organization
export async function grantCourseOrgAccess(req: Request, res: Response) {
  const { organizationId } = req.body as { organizationId: string };
  await courseAccess.grantCourseOrganizationAccess(req.user!, param(req, "courseId"), organizationId);
  noContent(res);
}

// DELETE /api/v1/admin/courses/:courseId/org-access/:organizationId — revoke free access
export async function revokeCourseOrgAccess(req: Request, res: Response) {
  await courseAccess.revokeCourseOrganizationAccess(req.user!, param(req, "courseId"), param(req, "organizationId"));
  noContent(res);
}

// POST /api/v1/admin/organizations/:orgId/free-access — bulk grant or revoke free access
export async function setOrgCoursesFreeAccess(req: Request, res: Response) {
  const { courseIds, freeForOrganization } = req.body as { courseIds: string[]; freeForOrganization: boolean };
  ok(res, await courseAccess.setCoursesFreeForOrganization(req.user!, param(req, "orgId"), courseIds, freeForOrganization));
}

// POST /api/v1/admin/courses/:courseId/status — publish / unpublish / archive
export async function setCourseStatus(req: Request, res: Response) {
  const { status } = req.body as CourseStatusBody;
  await courses.setCourseStatus(req.user!, param(req, "courseId"), status);
  noContent(res);
}

// GET /api/v1/admin/courses/export — CSV download of the filtered catalog
export async function exportCoursesCsv(req: Request, res: Response) {
  const table = await overview.exportCourses(req.query as ListCoursesQuery);
  res.attachment(`buildment-courses-${today()}.csv`).type("text/csv; charset=utf-8").send(toCsv([table.header, ...table.rows]));
}

// GET /api/v1/admin/organizations
export async function listOrganizations(req: Request, res: Response) {
  ok(res, await organizations.listOrganizations(req.query as ListOrganizationsQuery));
}

// POST /api/v1/admin/organizations — the response is the only time the secret is visible
export async function createOrganization(req: Request, res: Response) {
  created(res, await organizations.createOrganization(req.user!, req.body as CreateOrganizationBody));
}

// GET /api/v1/admin/organizations/:orgId
export async function getOrganization(req: Request, res: Response) {
  ok(res, await organizations.getOrganization(param(req, "orgId")));
}

// POST /api/v1/admin/organizations/:orgId/credentials/rotate
export async function rotateCredential(req: Request, res: Response) {
  created(res, await organizations.rotateCredential(req.user!, param(req, "orgId")));
}

// PUT /api/v1/admin/organizations/:orgId/allocations
export async function upsertAllocations(req: Request, res: Response) {
  await organizations.upsertAllocations(req.user!, param(req, "orgId"), req.body as AllocationsBody);
  noContent(res);
}

// POST /api/v1/admin/course-requests/bulk/approve
export async function bulkApproveCourseRequests(req: Request, res: Response) {
  const { ids, ...input } = req.body as BulkApproveBody;
  ok(res, await courseRequests.bulkApproveCourseRequests(req.user!, ids, input));
}

// POST /api/v1/admin/course-requests/bulk/reject
export async function bulkRejectCourseRequests(req: Request, res: Response) {
  const { ids } = req.body as BulkIdsBody;
  ok(res, await courseRequests.bulkRejectCourseRequests(req.user!, ids));
}

// PATCH /api/v1/admin/organizations/:orgId/allocations/:courseId/allowed
export async function setAllocationAllowed(req: Request, res: Response) {
  const { enabled } = req.body as { enabled: boolean };
  await organizations.setAllocationAllowed(req.user!, param(req, "orgId"), param(req, "courseId"), enabled);
  noContent(res);
}

// PATCH /api/v1/admin/organizations/:orgId/allocations/:courseId/leaderboard
export async function setAllocationLeaderboard(req: Request, res: Response) {
  const { enabled } = req.body as { enabled: boolean };
  await organizations.setAllocationLeaderboard(param(req, "orgId"), param(req, "courseId"), enabled);
  noContent(res);
}

// POST /api/v1/admin/organizations/:orgId/coupons
export async function createCouponPool(req: Request, res: Response) {
  const body = req.body as {
    label: string;
    courseId?: string | null;
    code?: string | null;
    percentOff?: number;
    maxRedemptions: number;
    expiresAt?: string;
  };
  const { createCouponPool: createPool } = await import("../services/coupons/pools.js");
  const { parseExpiresAt } = await import("../services/admin/organizations.js");
  created(
    res,
    await createPool({
      organizationId: param(req, "orgId"),
      courseId: body.courseId,
      label: body.label,
      code: body.code,
      percentOff: body.percentOff,
      maxRedemptions: body.maxRedemptions,
      expiresAt: parseExpiresAt(body.expiresAt),
    })
  );
}

// PATCH /api/v1/admin/organizations/:orgId/coupons/:poolId
export async function setCouponPoolActive(req: Request, res: Response) {
  const body = req.body as { active?: boolean; maxRedemptions?: number };
  const { updateCouponPool } = await import("../services/coupons/pools.js");
  await updateCouponPool(param(req, "orgId"), param(req, "poolId"), body);
  noContent(res);
}

// GET /api/v1/admin/course-requests
export async function listCourseRequests(req: Request, res: Response) {
  ok(res, await courseRequests.listCourseRequests(req.query as ListRequestsQuery));
}

// POST /api/v1/admin/course-requests/:requestId/approve
export async function approveCourseRequest(req: Request, res: Response) {
  await courseRequests.approveCourseRequest(req.user!, param(req, "requestId"), req.body as ApproveCourseRequestBody);
  noContent(res);
}

// POST /api/v1/admin/course-requests/:requestId/reject
export async function rejectCourseRequest(req: Request, res: Response) {
  await courseRequests.rejectCourseRequest(req.user!, param(req, "requestId"));
  noContent(res);
}

// POST /api/v1/admin/users/bulk/suspend
export async function bulkSuspendUsers(req: Request, res: Response) {
  const { ids, note } = req.body as BulkSuspendBody;
  ok(res, await users.bulkSuspendUsers(req.user!, ids, note));
}

// POST /api/v1/admin/users/bulk/reinstate
export async function bulkReinstateUsers(req: Request, res: Response) {
  const { ids } = req.body as BulkIdsBody;
  ok(res, await users.bulkReinstateUsers(req.user!, ids));
}

// GET /api/v1/admin/users
export async function listUsers(req: Request, res: Response) {
  ok(res, await users.listUsers(req.query as ListUsersQuery));
}

// GET /api/v1/admin/users/export — CSV download of the filtered accounts
export async function exportUsersCsv(req: Request, res: Response) {
  const table = await users.exportUsers(req.query as ListUsersQuery);
  res.attachment(`buildment-users-${today()}.csv`).type("text/csv; charset=utf-8").send(toCsv([table.header, ...table.rows]));
}

// GET /api/v1/admin/users/:userId
export async function getUserDetail(req: Request, res: Response) {
  ok(res, await users.getUserDetail(param(req, "userId")));
}

// POST /api/v1/admin/users/:userId/verify-email
export async function forceVerifyEmail(req: Request, res: Response) {
  await users.forceVerifyEmail(req.user!, param(req, "userId"));
  noContent(res);
}

// POST /api/v1/admin/users/:userId/revoke-sessions
export async function revokeUserSessions(req: Request, res: Response) {
  await users.revokeUserSessions(req.user!, param(req, "userId"));
  noContent(res);
}

// POST /api/v1/admin/users/:userId/suspend
export async function suspendUser(req: Request, res: Response) {
  const { note } = req.body as SuspendUserBody;
  await users.suspendUser(req.user!, param(req, "userId"), note);
  noContent(res);
}

// POST /api/v1/admin/users/:userId/reinstate
export async function reinstateUser(req: Request, res: Response) {
  await users.reinstateUser(req.user!, param(req, "userId"));
  noContent(res);
}

// POST /api/v1/admin/users/:userId/reset-mfa
export async function resetUserMfa(req: Request, res: Response) {
  await mfa.resetUserTotp(req.user!, param(req, "userId"));
  noContent(res);
}

// POST /api/v1/admin/users/:userId/enroll
export async function enrollUser(req: Request, res: Response) {
  const { courseId } = req.body as { courseId: string };
  const result = await users.enrollUser(req.user!, param(req, "userId"), courseId);
  created(res, result);
}

// DELETE /api/v1/admin/users/:userId/enrollments/:enrollmentId
export async function removeUserEnrollment(req: Request, res: Response) {
  await users.removeUserEnrollment(req.user!, param(req, "enrollmentId"), param(req, "userId"));
  noContent(res);
}

// DELETE /api/v1/admin/enrollments/:enrollmentId
export async function removeEnrollment(req: Request, res: Response) {
  await users.removeUserEnrollment(req.user!, param(req, "enrollmentId"));
  noContent(res);
}

// POST /api/v1/admin/mfa/enroll — returns the secret and otpauth URI once
export async function enrollMfa(req: Request, res: Response) {
  created(res, await mfa.beginTotpEnrollment(req.user!));
}

// GET /api/v1/admin/mfa — whether this admin has an authenticator app enabled
export async function getMfa(_req: Request, res: Response) {
  ok(res, await mfa.getMfaStatus(_req.user!));
}

// POST /api/v1/admin/mfa/activate
export async function activateMfa(req: Request, res: Response) {
  const { code } = req.body as TotpCodeBody;
  ok(res, await mfa.activateTotp(req.user!, code));
}

// POST /api/v1/admin/mfa/recovery-codes
export async function regenerateRecoveryCodes(req: Request, res: Response) {
  const { code } = req.body as TotpCodeBody;
  ok(res, await mfa.regenerateRecoveryCodes(req.user!, code));
}

// POST /api/v1/admin/mfa/disable
export async function disableMfa(req: Request, res: Response) {
  const { code } = req.body as TotpCodeBody;
  await mfa.disableTotp(req.user!, code);
  noContent(res);
}

// PATCH /api/v1/admin/users/:userId/instructor-access
export async function setInstructorAccess(req: Request, res: Response) {
  const { enabled } = req.body as { enabled: boolean };
  await users.setInstructorAccess(req.user!, param(req, "userId"), enabled);
  noContent(res);
}

export async function setZipImportAccess(req: Request, res: Response) {
  await users.setZipImportAccess(req.user!, param(req, "userId"), req.body.enabled);
  noContent(res);
}

export async function setTesterAccess(req: Request, res: Response) {
  await users.setTesterAccess(req.user!, param(req, "userId"), req.body.enabled);
  noContent(res);
}

// POST /api/v1/admin/instructors
export async function grantInstructor(req: Request, res: Response) {
  await users.grantInstructorByEmail(req.user!, req.body as GrantInstructorBody);
  noContent(res);
}

// POST /api/v1/admin/admins
export async function grantAdmin(req: Request, res: Response) {
  await users.grantAdminByEmail(req.user!, req.body as GrantAdminBody);
  noContent(res);
}

// POST /api/v1/admin/users/:userId/revoke-admin
export async function revokeAdmin(req: Request, res: Response) {
  await users.revokeAdmin(req.user!, param(req, "userId"));
  noContent(res);
}

// GET /api/v1/admin/audit
export async function listAudit(req: Request, res: Response) {
  ok(res, await audit.listRecentAudit(req.query as PageQuery));
}

// GET /api/v1/admin/audit/export — CSV download of the audit trail
export async function exportAuditCsv(_req: Request, res: Response) {
  const table = await audit.exportAudit();
  res.attachment(`buildment-audit-${today()}.csv`).type("text/csv; charset=utf-8").send(toCsv([table.header, ...table.rows]));
}

// POST /api/v1/admin/instructor-access-requests/:requestId/approve
export async function approveInstructorRequest(req: Request, res: Response) {
  await users.approveInstructorRequest(req.user!, param(req, "requestId"));
  noContent(res);
}

// POST /api/v1/admin/instructor-access-requests/:requestId/reject
export async function rejectInstructorRequest(req: Request, res: Response) {
  await users.rejectInstructorRequest(req.user!, param(req, "requestId"));
  noContent(res);
}

// GET /api/v1/admin/app-activity?days=7
export async function getAppActivity(req: Request, res: Response) {
  const { days } = req.query as unknown as { days: number };
  ok(res, await appActivity.loadAppActivityOverview(days));
}

// GET /api/v1/admin/app-activity/users?days=7&limit=50&offset=0&inactiveForDays=&userId=
export async function listAppActivityUsers(req: Request, res: Response) {
  ok(res, await appActivity.listAppActivityUsers(req.query as unknown as AppActivityUsersQuery));
}
