import type { AdminBulkResult, AdminUserDetail, AdminUsersView } from "../../shared/api/admin.js";
import { ADMIN_ERROR_CODES } from "../../shared/api/admin.js";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { CsvTable } from "../../utils/csv.js";
import { pageInfo, resolvePaging } from "./paging.js";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError, isAppError } from "../../utils/errors.js";
import type { GrantAdminBody, GrantInstructorBody, ListUsersQuery } from "../../validations/admin.js";
import {
  notifyUserGrantedAdminByAdmin,
  notifyUserGrantedInstructorByAdmin,
  notifyUserInstructorAccessDecision,
} from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "./audit.js";
import { releaseEnrollmentSlot } from "../integrations/allocation.js";
import { cancelIssuedCouponUsage } from "../coupons/issue.js";
import { adminWaiverSnapshot } from "../financials/settlement.js";
import { releaseOrganizationCredits } from "../organizations/credits.js";
import { assignmentForNewEnrollment } from "../courses/variant-assignment.js";
import { CONFIRMED_ENROLLMENT_WHERE, isConfirmedEnrollment } from "../enrollment/lifecycle.js";
import { resolvePendingBlockReview } from "../progress/compute.js";

// Accounts and the instructor capability. Granting instructor tools promotes a
// learner to MENTOR (admins keep their role) and records an approved request so
// the learner-side status reads consistently.

/** Upper bound on exported rows, so a download can't scan an unbounded table. */
export const ADMIN_EXPORT_LIMIT = 10_000;

/** Shared filter clause for the list view and the CSV export. */
function buildUserWhere(filters: ListUsersQuery): Prisma.UserWhereInput {
  return {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.verified ? { emailVerified: filters.verified === "true" ? { not: null } : null } : {}),
    ...(filters.enrolled
      ? {
          enrollments:
            filters.enrolled === "true"
              ? { some: CONFIRMED_ENROLLMENT_WHERE }
              : { none: CONFIRMED_ENROLLMENT_WHERE },
        }
      : {}),
    ...(filters.query
      ? {
          OR: [
            { email: { contains: filters.query, mode: "insensitive" as const } },
            { name: { contains: filters.query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listUsers(filters: ListUsersQuery = {}): Promise<AdminUsersView> {
  const where = buildUserWhere(filters);
  const [total, pendingRequestsTotal] = await Promise.all([
    prisma.user.count({ where }),
    prisma.instructorAccessRequest.count({ where: { status: "PENDING" } }),
  ]);
  const paging = resolvePaging(filters, total);
  const requestsPaging = resolvePaging({ page: filters.requestsPage, pageSize: filters.pageSize }, pendingRequestsTotal);

  const [pendingInstructorRequests, rows] = await Promise.all([
    prisma.instructorAccessRequest.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: requestsPaging.skip,
      take: requestsPaging.take,
      select: { id: true, message: true, user: { select: { id: true, email: true, name: true, role: true } } },
    }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: paging.skip,
      take: paging.take,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        zipImportEnabled: true,
        testerEnabled: true,
        suspendedAt: true,
        createdAt: true,
        _count: {
          select: {
            enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
            coursesOwned: true,
          },
        },
      },
    }),
  ]);

  return {
    pendingInstructorRequests,
    pendingRequestsPage: pageInfo(requestsPaging),
    users: rows.map(({ _count, emailVerified, suspendedAt, createdAt, ...user }) => ({
      ...user,
      emailVerified: emailVerified !== null,
      suspended: suspendedAt !== null,
      createdAt: createdAt.toISOString(),
      enrollmentCount: _count.enrollments,
      courseCount: _count.coursesOwned,
    })),
    page: pageInfo(paging),
  };
}

/** Rows for the users CSV export (same filters as the list, capped at ADMIN_EXPORT_LIMIT). */
export async function exportUsers(filters: ListUsersQuery = {}): Promise<CsvTable> {
  const users = await prisma.user.findMany({
    where: buildUserWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ADMIN_EXPORT_LIMIT,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      zipImportEnabled: true,
      testerEnabled: true,
      suspendedAt: true,
      totpEnabledAt: true,
      createdAt: true,
      _count: {
        select: {
          enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          coursesOwned: true,
        },
      },
    },
  });
  return {
    header: ["id", "email", "name", "role", "verified", "suspended", "mfa", "zipImport", "tester", "enrollments", "courses", "createdAt"],
    rows: users.map((user) => [
      user.id,
      user.email,
      user.name ?? "",
      user.role,
      user.emailVerified ? "yes" : "no",
      user.suspendedAt ? "yes" : "no",
      user.totpEnabledAt ? "yes" : "no",
      user.zipImportEnabled ? "yes" : "no",
      user.testerEnabled ? "yes" : "no",
      user._count.enrollments,
      user._count.coursesOwned,
      user.createdAt.toISOString(),
    ]),
  };
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      zipImportEnabled: true,
      testerEnabled: true,
      suspendedAt: true,
      suspensionNote: true,
      totpEnabledAt: true,
      createdAt: true,
      _count: {
        select: {
          enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
          coursesOwned: true,
          sessions: true,
        },
      },
      enrollments: {
        where: CONFIRMED_ENROLLMENT_WHERE,
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          courseId: true,
          lifecycle: true,
          percentComplete: true,
          lastActiveAt: true,
          course: { select: { title: true, slug: true } },
        },
      },
      coursesOwned: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, slug: true, status: true },
      },
    },
  });
  if (!user) throw new NotFoundError("User not found");

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified !== null,
      zipImportEnabled: user.zipImportEnabled,
      testerEnabled: user.testerEnabled,
      suspended: user.suspendedAt !== null,
      suspensionNote: user.suspensionNote,
      mfaEnabled: user.totpEnabledAt !== null,
      createdAt: user.createdAt.toISOString(),
      activeSessions: user._count.sessions,
      enrollmentCount: user._count.enrollments,
      courseCount: user._count.coursesOwned,
    },
    enrollments: user.enrollments.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      courseTitle: row.course.title,
      courseSlug: row.course.slug,
      lifecycle: row.lifecycle,
      percentComplete: row.percentComplete,
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    })),
    coursesOwned: user.coursesOwned,
  };
}

/** Marks the email verified on the learner's behalf (e.g. they never received the link). */
export async function forceVerifyEmail(actor: AdminActor, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true } });
  if (!user) throw new NotFoundError("User not found");
  if (user.emailVerified) throw new ConflictError("This account is already verified.", ADMIN_ERROR_CODES.ALREADY_VERIFIED);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_FORCE_VERIFY,
      targetType: "User",
      targetId: userId,
      summary: `Verified ${user.email}'s email`,
    });
  });
}

/** Signs the account out of every device by deleting its sessions. */
export async function revokeUserSessions(actor: AdminActor, userId: string): Promise<void> {
  if (actor.id === userId) {
    throw new ForbiddenError("Sign yourself out from your own account menu.", ADMIN_ERROR_CODES.SELF_ACTION);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new NotFoundError("User not found");

  const { count } = await prisma.session.deleteMany({ where: { userId } });
  // Idempotent: nothing to revoke (already signed out, or a race) is a no-op, and
  // the audit trail records changes, so skip the entry when no session was deleted.
  if (count === 0) return;
  await recordAdminAction(prisma, {
    actor,
    action: ADMIN_AUDIT_ACTIONS.USER_REVOKE_SESSIONS,
    targetType: "User",
    targetId: userId,
    summary: `Signed out ${count} session${count === 1 ? "" : "s"} for ${user.email}`,
    metadata: { sessions: count },
  });
}

/**
 * Blocks sign-in for an account and signs it out of every device. Guards: an admin
 * cannot suspend themself, and the last active (non-suspended) admin cannot be
 * suspended. The active-admin count is checked inside the transaction.
 */
export async function suspendUser(actor: AdminActor, userId: string, note?: string): Promise<void> {
  if (actor.id === userId) {
    throw new ForbiddenError("You cannot suspend your own account.", ADMIN_ERROR_CODES.SELF_ACTION);
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, suspendedAt: true },
  });
  if (!target) throw new NotFoundError("User not found");
  if (target.suspendedAt) throw new ConflictError("This account is already suspended.", ADMIN_ERROR_CODES.ALREADY_SUSPENDED);

  await prisma.$transaction(async (tx) => {
    if (target.role === "ADMIN") {
      const activeAdmins = await tx.user.count({ where: { role: "ADMIN", suspendedAt: null } });
      if (activeAdmins <= 1) {
        throw new ConflictError("The last active platform admin cannot be suspended.", ADMIN_ERROR_CODES.LAST_ADMIN);
      }
    }
    await tx.user.update({
      where: { id: userId },
      data: { suspendedAt: new Date(), suspensionNote: note ?? null },
    });
    // Existing sessions are kept as inert tombstones: every request now returns a
    // distinct 403 (ACCOUNT_SUSPENDED), so clients can explain the sign-out. They
    // are cleared on reinstate, so lifting a suspension never revives old sessions.
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_SUSPEND,
      targetType: "User",
      targetId: userId,
      summary: `Suspended ${target.email}${note ? ` — ${note}` : ""}`,
      ...(note ? { metadata: { note } } : {}),
    });
  });
}

/** Lifts a suspension so the account can sign in again. Clears old sessions so a reinstated account starts fresh. */
export async function reinstateUser(actor: AdminActor, userId: string): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, suspendedAt: true },
  });
  if (!target) throw new NotFoundError("User not found");
  if (!target.suspendedAt) throw new ConflictError("This account is not suspended.", ADMIN_ERROR_CODES.NOT_SUSPENDED);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { suspendedAt: null, suspensionNote: null } });
    await tx.session.deleteMany({ where: { userId } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_REINSTATE,
      targetType: "User",
      targetId: userId,
      summary: `Reinstated ${target.email}`,
    });
  });
}

/** Bulk actions run each target through the single-item path and report per-target outcomes. */
async function runEach(idList: string[], work: (id: string) => Promise<void>): Promise<AdminBulkResult> {
  const result: AdminBulkResult = { updated: 0, skipped: [] };
  for (const id of idList) {
    try {
      await work(id);
      result.updated += 1;
    } catch (error) {
      result.skipped.push({ id, reason: isAppError(error) ? error.message : "Could not be updated." });
    }
  }
  return result;
}

export function bulkSuspendUsers(actor: AdminActor, ids: string[], note?: string): Promise<AdminBulkResult> {
  return runEach(ids, (id) => suspendUser(actor, id, note));
}

export function bulkReinstateUsers(actor: AdminActor, ids: string[]): Promise<AdminBulkResult> {
  return runEach(ids, (id) => reinstateUser(actor, id));
}

export async function setInstructorAccess(actor: AdminActor, userId: string, enabled: boolean): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
  if (!existing) throw new NotFoundError("User not found");
  const nextRole = existing.role === "ADMIN" ? "ADMIN" : enabled ? "MENTOR" : "MENTEE";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: nextRole } });
    if (enabled) {
      await tx.instructorAccessRequest.upsert({
        where: { userId },
        create: { userId, status: "APPROVED", reviewedAt: new Date() },
        update: { status: "APPROVED", reviewedAt: new Date() },
      });
    }
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_SET_INSTRUCTOR_ACCESS,
      targetType: "User",
      targetId: userId,
      summary: `${enabled ? "Granted" : "Revoked"} instructor access for ${existing.email}`,
      metadata: { enabled },
    });
  });

  // Send role details when the learner is promoted. Revocations and repeated
  // grants stay quiet so this action does not generate duplicate invitations.
  if (enabled && existing.role === "MENTEE") {
    const grantedAt = new Date();
    await dispatchNotification(() => notifyUserGrantedInstructorByAdmin({ userId, grantedAt }));
  }
}

export async function setZipImportAccess(actor: AdminActor, userId: string, enabled: boolean): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new NotFoundError("User not found");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { zipImportEnabled: enabled } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_SET_ZIP_IMPORT,
      targetType: "User",
      targetId: userId,
      summary: `${enabled ? "Enabled" : "Disabled"} ZIP import for ${user.email}`,
      metadata: { enabled },
    });
  });
}

/** Marks a normal learner as a tester so sequential chapter locks are skipped. Role is unchanged. */
export async function setTesterAccess(actor: AdminActor, userId: string, enabled: boolean): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new NotFoundError("User not found");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { testerEnabled: enabled } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_SET_TESTER,
      targetType: "User",
      targetId: userId,
      summary: `${enabled ? "Enabled" : "Disabled"} tester access for ${user.email}`,
      metadata: { enabled },
    });
  });
}

/** Grants instructor tools by email, creating a verified account when the address is new. */
export async function grantInstructorByEmail(actor: AdminActor, input: GrantInstructorBody): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { role: true } });
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name ?? input.email.split("@")[0],
      role: "MENTOR",
      emailVerified: new Date(),
    },
    update: { ...(existing?.role === "ADMIN" ? {} : { role: "MENTOR" }) },
    select: { id: true, name: true },
  });

  const grantedAt = new Date();
  await prisma.instructorAccessRequest.upsert({
    where: { userId: user.id },
    create: { userId: user.id, status: "APPROVED", reviewedAt: grantedAt },
    update: { status: "APPROVED", reviewedAt: grantedAt },
  });

  await recordAdminAction(prisma, {
    actor,
    action: ADMIN_AUDIT_ACTIONS.USER_GRANT_INSTRUCTOR,
    targetType: "User",
    targetId: user.id,
    summary: `Granted instructor access to ${input.email}`,
  });

  await dispatchNotification(() => notifyUserGrantedInstructorByAdmin({ userId: user.id, grantedAt }));
}

/** Adds a platform admin by email, creating a verified account when the address is new. */
export async function grantAdminByEmail(actor: AdminActor, input: GrantAdminBody): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name ?? input.email.split("@")[0],
      role: "ADMIN",
      emailVerified: new Date(),
    },
    update: { role: "ADMIN", ...(input.name ? { name: input.name } : {}) },
    select: { id: true, name: true },
  });

  await recordAdminAction(prisma, {
    actor,
    action: ADMIN_AUDIT_ACTIONS.USER_GRANT_ADMIN,
    targetType: "User",
    targetId: user.id,
    summary: `Granted platform admin to ${input.email}`,
  });

  await dispatchNotification(() => notifyUserGrantedAdminByAdmin({ userId: user.id, grantedAt: new Date() }));
}

/**
 * Removes the platform-admin role from a user. Guards: an admin cannot remove
 * their own access, and the last remaining admin cannot be removed. The count is
 * re-checked inside the transaction so two admins revoking each other at once
 * cannot leave the platform with none.
 */
export async function revokeAdmin(actor: AdminActor, userId: string): Promise<void> {
  if (actor.id === userId) {
    throw new ForbiddenError("You cannot revoke your own platform-admin access.", ADMIN_ERROR_CODES.SELF_ACTION);
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!target) throw new NotFoundError("User not found");
  if (target.role !== "ADMIN") {
    throw new ConflictError("This user is not a platform admin.", ADMIN_ERROR_CODES.NOT_ADMIN);
  }

  await prisma.$transaction(async (tx) => {
    const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      throw new ConflictError("The last platform admin cannot be removed.", ADMIN_ERROR_CODES.LAST_ADMIN);
    }
    await tx.user.update({ where: { id: userId }, data: { role: "MENTEE" } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_REVOKE_ADMIN,
      targetType: "User",
      targetId: userId,
      summary: `Revoked platform admin from ${target.email}`,
    });
  });
}

async function requirePendingInstructorRequest(requestId: string) {
  const request = await prisma.instructorAccessRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true, status: true, user: { select: { role: true, email: true } } },
  });
  if (!request) throw new NotFoundError("Request not found");
  if (request.status !== "PENDING") throw new ConflictError("This request has already been reviewed.", ADMIN_ERROR_CODES.REQUEST_ALREADY_REVIEWED);
  return request;
}

export async function approveInstructorRequest(actor: AdminActor, requestId: string): Promise<void> {
  const request = await requirePendingInstructorRequest(requestId);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: request.userId },
      data: { ...(request.user.role !== "ADMIN" ? { role: "MENTOR" } : {}) },
    });
    await tx.instructorAccessRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date() },
    });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.INSTRUCTOR_REQUEST_APPROVE,
      targetType: "InstructorAccessRequest",
      targetId: request.id,
      summary: `Approved instructor request from ${request.user.email}`,
    });
  });
  await dispatchNotification(() => notifyUserInstructorAccessDecision({ userId: request.userId, approved: true }));
}

export async function rejectInstructorRequest(actor: AdminActor, requestId: string): Promise<void> {
  const request = await requirePendingInstructorRequest(requestId);
  await prisma.$transaction(async (tx) => {
    await tx.instructorAccessRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date() },
    });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.INSTRUCTOR_REQUEST_REJECT,
      targetType: "InstructorAccessRequest",
      targetId: request.id,
      summary: `Rejected instructor request from ${request.user.email}`,
    });
  });
  await dispatchNotification(() => notifyUserInstructorAccessDecision({ userId: request.userId, approved: false }));
}

/**
 * Removes an enrollment for a user from a course. Guards: verifies enrollment belongs to user if specified.
 * Cleans up organization course slots, coupon reservations, pending review counters, responses, and records audit trail.
 */
export async function removeUserEnrollment(
  actor: AdminActor,
  enrollmentId: string,
  userId?: string
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      organizationId: true,
      source: true,
      lifecycle: true,
      status: true,
      course: { select: { title: true } },
      user: { select: { id: true, email: true } },
    },
  });
  if (!enrollment) throw new NotFoundError("Enrollment not found");
  if (userId && enrollment.userId !== userId) {
    throw new ConflictError("Enrollment does not belong to the specified user.");
  }

  await prisma.$transaction(async (tx) => {
    if (
      enrollment.organizationId &&
      enrollment.source === "PATHMENT" &&
      enrollment.lifecycle !== "CANCELLED" &&
      enrollment.status !== "DROPPED"
    ) {
      await releaseEnrollmentSlot(tx, enrollment.organizationId, enrollment.courseId);
    }
    await cancelIssuedCouponUsage(tx, enrollmentId);

    const pendingResponses =
      (await tx.response.findMany?.({
        where: { enrollmentId, status: "PENDING_REVIEW" },
        select: { blockId: true },
      })) ?? [];
    for (const row of pendingResponses) {
      await resolvePendingBlockReview(tx, row.blockId);
    }

    await tx.response.deleteMany({ where: { enrollmentId } });

    if (enrollment.userId && tx.courseRating) {
      const removedRatings = await tx.courseRating.deleteMany({
        where: { courseId: enrollment.courseId, userId: enrollment.userId },
      });
      if (removedRatings.count > 0) {
        const aggregate = await tx.courseRating.aggregate({
          where: { courseId: enrollment.courseId },
          _avg: { rating: true },
          _count: { _all: true },
        });
        await tx.course.update({
          where: { id: enrollment.courseId },
          data: {
            ratingAverage: aggregate._avg.rating,
            ratingCount: aggregate._count._all,
          },
        });
      }
    }

    await tx.enrollment.delete({ where: { id: enrollmentId } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_REMOVE_ENROLLMENT,
      targetType: "Enrollment",
      targetId: enrollmentId,
      summary: `Removed ${enrollment.user?.email ?? "learner"}'s enrollment from ${enrollment.course.title}`,
      metadata: {
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
      },
    });
  });
}

/**
 * Enrolls a user in a published course by platform admin, bypassing paywalls and setting lifecycle to ACTIVE.
 */
export async function enrollUser(
  actor: AdminActor,
  userId: string,
  courseId: string
): Promise<{ id: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new NotFoundError("User not found");
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, status: true, variantAssignment: true, activeReleaseId: true, pricingType: true, priceCents: true, currency: true },
  });
  if (!course) throw new NotFoundError("Course not found");
  if (course.status && course.status !== "PUBLISHED") {
    throw new UnprocessableError("Only published courses can be enrolled.", ADMIN_ERROR_CODES.COURSE_NOT_PUBLISHED);
  }

  const enrollment = await prisma.$transaction(async (tx) => {
    const existing = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: { payment: true },
    });
    if (existing && isConfirmedEnrollment(existing)) {
      throw new ConflictError("User is already enrolled in this course.", ADMIN_ERROR_CODES.ALREADY_ENROLLED);
    }

    let row;
    if (existing) {
      row = await tx.enrollment.update({
        where: { id: existing.id },
        data: {
          lifecycle: "ACTIVE",
          status: "IN_PROGRESS",
          startedAt: existing.startedAt ?? new Date(),
        },
      });
      const waiver = adminWaiverSnapshot({ originalAmountCents: course.priceCents, pricingType: course.pricingType });
      if (existing.payment && existing.payment.status !== "SUCCEEDED") {
        await tx.payment.update({
          where: { enrollmentId: existing.id },
          data: waiver,
        });
      }
      if (!existing.payment) {
        await tx.payment.create({
          data: { enrollmentId: existing.id, currency: course.currency, ...waiver },
        });
      }
      await cancelIssuedCouponUsage(tx, existing.id);
      await releaseOrganizationCredits(tx, existing.id);
    } else {
      const assignment =
        course.variantAssignment === "RANDOM" ? await assignmentForNewEnrollment(tx, course.id) : {};
      row = await tx.enrollment.create({
        data: {
          ...assignment,
          userId,
          courseId,
          lifecycle: "ACTIVE",
          status: "IN_PROGRESS",
          source: "DIRECT",
          startedAt: new Date(),
          ...(course.activeReleaseId ? { releaseId: course.activeReleaseId } : {}),
        },
      });
      await tx.payment.create({
        data: {
          enrollmentId: row.id,
          currency: course.currency,
          ...adminWaiverSnapshot({ originalAmountCents: course.priceCents, pricingType: course.pricingType }),
        },
      });
    }
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.USER_ENROLL,
      targetType: "Enrollment",
      targetId: row.id,
      summary: `Enrolled ${user.email} in ${course.title}`,
      metadata: { userId, courseId, courseTitle: course.title },
    });
    return row;
  });

  return { id: enrollment.id };
}
