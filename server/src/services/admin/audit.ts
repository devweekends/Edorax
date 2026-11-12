import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { AdminAuditRow, AdminAuditView } from "../../shared/api/admin.js";
import type { CsvTable } from "../../utils/csv.js";
import type { PageQuery } from "../../validations/admin.js";
import { pageInfo, resolvePaging } from "./paging.js";

// Append-only accountability log for platform-admin actions. Callers pass the
// acting admin (id + email) and a stable action key; writes join the caller's
// transaction where one exists so the record and the change commit together.

export type AdminActor = { id: string; email: string };

/** Stable machine keys. Add one per audited action; never reuse a key. */
export const ADMIN_AUDIT_ACTIONS = {
  ORGANIZATION_CREATE: "organization.create",
  ORGANIZATION_ROTATE_CREDENTIAL: "organization.rotate-credential",
  ORGANIZATION_ALLOCATE: "organization.allocate",
  COURSE_REQUEST_APPROVE: "course-request.approve",
  COURSE_REQUEST_REJECT: "course-request.reject",
  COURSE_ORG_ACCESS_GRANT: "course-org-access.grant",
  COURSE_ORG_ACCESS_REVOKE: "course-org-access.revoke",
  MANUAL_ACCESS_APPROVE: "manual-access.approve",
  MANUAL_ACCESS_REJECT: "manual-access.reject",
  MANUAL_INSTRUCTOR_PAYOUT_PAID: "manual-instructor-payout.paid",
  INSTRUCTOR_WITHDRAWAL_PAID: "instructor-withdrawal.paid",
  INSTRUCTOR_WITHDRAWAL_REJECT: "instructor-withdrawal.reject",
  ORGANIZATION_GRANT_CREDITS: "organization.grant-credits",
  COURSE_SET_STATUS: "course.set-status",
  DISCOUNT_CAMPAIGN_CREATE: "discount-campaign.create",
  DISCOUNT_CAMPAIGN_SET_ACTIVE: "discount-campaign.set-active",
  INSTRUCTOR_REQUEST_APPROVE: "instructor-request.approve",
  INSTRUCTOR_REQUEST_REJECT: "instructor-request.reject",
  USER_GRANT_INSTRUCTOR: "user.grant-instructor",
  USER_SET_INSTRUCTOR_ACCESS: "user.set-instructor-access",
  USER_SET_ZIP_IMPORT: "user.set-zip-import",
  USER_SET_TESTER: "user.set-tester",
  USER_GRANT_ADMIN: "user.grant-admin",
  USER_REVOKE_ADMIN: "user.revoke-admin",
  USER_FORCE_VERIFY: "user.force-verify",
  USER_REVOKE_SESSIONS: "user.revoke-sessions",
  USER_SUSPEND: "user.suspend",
  USER_REINSTATE: "user.reinstate",
  USER_ENROLL: "user.enroll",
  USER_REMOVE_ENROLLMENT: "user.remove-enrollment",
  MFA_ENABLE: "mfa.enable",
  MFA_DISABLE: "mfa.disable",
  MFA_RESET: "mfa.reset",
  MFA_RECOVERY_REGENERATE: "mfa.recovery-regenerate",
} as const;

export type AdminAuditActionKey = (typeof ADMIN_AUDIT_ACTIONS)[keyof typeof ADMIN_AUDIT_ACTIONS];

export type AdminAuditEntry = {
  actor: AdminActor;
  action: AdminAuditActionKey;
  targetType: "Organization" | "User" | "CourseRequest" | "InstructorAccessRequest" | "Course" | "CourseDiscountCampaign" | "Enrollment" | "Payment" | "InstructorWithdrawal";
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

export function recordAdminAction(tx: Pick<Prisma.TransactionClient, "adminAuditLog">, entry: AdminAuditEntry) {
  return tx.adminAuditLog.create({
    data: {
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      summary: entry.summary,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
    },
  });
}

const AUDIT_EXPORT_LIMIT = 10_000;

export type AuditListFilters = PageQuery & { query?: string; targetType?: string };

/** Builds the audit where-clause: free text over who/what/where, and an optional target type. */
function auditWhere(filters: AuditListFilters): Prisma.AdminAuditLogWhereInput {
  const where: Prisma.AdminAuditLogWhereInput = {};
  const text = typeof filters.query === "string" ? filters.query.trim().slice(0, 120) : "";
  if (text) {
    where.OR = [
      { actorEmail: { contains: text, mode: "insensitive" } },
      { summary: { contains: text, mode: "insensitive" } },
      { targetId: { contains: text, mode: "insensitive" } },
      { action: { contains: text, mode: "insensitive" } },
    ];
  }
  const targetType = typeof filters.targetType === "string" ? filters.targetType.trim().slice(0, 40) : "";
  if (targetType) where.targetType = targetType;
  return where;
}

export async function listRecentAudit(filters: AuditListFilters = {}): Promise<AdminAuditView> {
  const where = auditWhere(filters);
  const total = await prisma.adminAuditLog.count({ where });
  const paging = resolvePaging(filters, total);

  const entries = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: paging.skip,
    take: paging.take,
  });
  return {
    entries: entries.map(
      (row): AdminAuditRow => ({
        id: row.id,
        action: row.action,
        actorEmail: row.actorEmail,
        targetType: row.targetType,
        targetId: row.targetId,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
      })
    ),
    page: pageInfo(paging),
  };
}

/** Rows for the audit CSV export: who did what, to which target, and when. */
export async function exportAudit(): Promise<CsvTable> {
  const entries = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: AUDIT_EXPORT_LIMIT,
  });
  return {
    header: ["createdAt", "action", "actorEmail", "targetType", "targetId", "summary"],
    rows: entries.map((row) => [
      row.createdAt.toISOString(),
      row.action,
      row.actorEmail,
      row.targetType,
      row.targetId ?? "",
      row.summary,
    ]),
  };
}
