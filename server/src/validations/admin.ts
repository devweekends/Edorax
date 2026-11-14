import { z } from "zod";
import { email, id, params } from "./common.js";
import { changePasswordBody } from "./auth.js";

export const orgIdParams = params("orgId");
export const allocationParams = z.object({ orgId: id, courseId: id });
export const requestIdParams = params("requestId");
export const userIdParams = params("userId");
export const userEnrollmentParams = z.object({ userId: id, enrollmentId: id });
export const courseIdParams = params("courseId");
export const enrollUserBody = z.object({ courseId: id });
export type EnrollUserBody = z.infer<typeof enrollUserBody>;
export const createDiscountCampaignBody = z.object({
  label: z.string().trim().min(2).max(100),
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).nullable().optional(),
  percentOff: z.coerce.number().int().min(1).max(100),
  maxRedemptions: z.coerce.number().int().min(1).max(100000),
  expiresAt: z.string().datetime().nullable().optional(),
  autoApply: z.boolean().default(false),
  scope: z.enum(["ALL", "CATEGORY", "SUBCATEGORY", "TAG"]),
  category: z.enum(["TECH", "SOFT_SKILLS"]).optional(),
  subcategory: z.string().trim().min(1).max(80).optional(),
  tag: z.string().trim().min(1).max(32).optional(),
}).refine((body) => body.code || body.autoApply, { message: "Enter a coupon code or enable automatic discount." })
  .refine((body) => body.scope !== "CATEGORY" || body.category, { message: "Choose a category." })
  .refine((body) => body.scope !== "SUBCATEGORY" || body.subcategory, { message: "Choose a subcategory." })
  .refine((body) => body.scope !== "TAG" || body.tag, { message: "Choose a tag." });
export type CreateDiscountCampaignBody = z.infer<typeof createDiscountCampaignBody>;
export const discountCampaignParams = params("campaignId");
export const discountCampaignActiveBody = z.object({ active: z.boolean() });

/** Platform-admin free-for-organization grants (CourseOrganizationAccess). */
export const courseOrgAccessParams = z.object({ courseId: id, organizationId: id });
export const courseOrgAccessBody = z.object({ organizationId: id });
/** Bulk change of free-for-organization for several allocated courses at once. */
export const courseOrgAccessBulkBody = z.object({
  courseIds: z.array(id).min(1).max(500),
  freeForOrganization: z.boolean(),
});
export type CourseOrgAccessBulkBody = z.infer<typeof courseOrgAccessBulkBody>;

/** Change a course's publish state from the admin catalog. */
export const courseStatusBody = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});
export type CourseStatusBody = z.infer<typeof courseStatusBody>;

/** Bulk selection: ids only (per-item failures are reported, never all-or-nothing). */
const bulkIdsBody = z.object({
  ids: z.array(id).min(1, "Select at least one row").max(100, "Too many rows selected"),
});

export const bulkSuspendBody = bulkIdsBody.extend({
  note: z.string().trim().max(240).optional(),
});
export type BulkSuspendBody = z.infer<typeof bulkSuspendBody>;

export const bulkIdsOnlyBody = bulkIdsBody;
export type BulkIdsBody = z.infer<typeof bulkIdsBody>;

export const adminProfileBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email,
  currentPassword: z.string().max(128).optional(),
});
export type AdminProfileBody = z.infer<typeof adminProfileBody>;
export const adminPasswordBody = changePasswordBody;
export type AdminPasswordBody = z.infer<typeof adminPasswordBody>;

export const createOrganizationBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(64).optional(),
});
export type CreateOrganizationBody = z.infer<typeof createOrganizationBody>;

const maxEnrollments = z.coerce.number().int().min(1).max(1_000_000);
/** Dates arrive as the `<input type="date">` value; empty means no expiry. */
const expiresAt = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const allocationsBody = z.object({
  isAllowed: z.boolean().optional(),
  courses: z.array(z.object({ courseId: id, maxEnrollments, expiresAt })).max(500),
  removeCourseIds: z.array(id).max(500).default([]),
});
export type AllocationsBody = z.infer<typeof allocationsBody>;

export const approveCourseRequestBody = z.object({ maxEnrollments, expiresAt });
export type ApproveCourseRequestBody = z.infer<typeof approveCourseRequestBody>;

/** Bulk approve applies one cap/expiry to every selected request. */
export const bulkApproveBody = bulkIdsBody.extend({ maxEnrollments, expiresAt });
export type BulkApproveBody = z.infer<typeof bulkApproveBody>;

export const instructorAccessBody = z.object({ enabled: z.boolean() });

export const createCouponPoolBody = z.object({
  label: z.string().trim().min(2).max(120),
  courseId: id.optional().nullable(),
  code: z.string().trim().max(64).optional().nullable(),
  percentOff: z.coerce.number().int().min(1).max(100).default(100),
  maxRedemptions: z.coerce.number().int().min(1).max(1_000_000),
  expiresAt: expiresAt,
});
export type CreateCouponPoolBody = z.infer<typeof createCouponPoolBody>;

export const couponPoolParams = z.object({ orgId: id, poolId: id });
export const couponPoolActiveBody = z.object({
  active: z.boolean().optional(),
  maxRedemptions: z.coerce.number().int().min(1).max(1_000_000).optional(),
}).refine((body) => body.active !== undefined || body.maxRedemptions !== undefined);

export const suspendUserBody = z.object({
  note: z.string().trim().max(240).optional(),
});
export type SuspendUserBody = z.infer<typeof suspendUserBody>;

/** A 6-digit TOTP code (spaces tolerated by the verifier). */
export const totpCodeBody = z.object({
  code: z.string().trim().min(6, "Enter the 6-digit code").max(10),
});
export type TotpCodeBody = z.infer<typeof totpCodeBody>;

export const grantInstructorBody = z.object({
  email,
  name: z.string().trim().min(1).max(120).optional(),
});
export type GrantInstructorBody = z.infer<typeof grantInstructorBody>;

export const grantAdminBody = z.object({
  email,
  name: z.string().trim().min(1).max(120).optional(),
});
export type GrantAdminBody = z.infer<typeof grantAdminBody>;

/** Shared list controls: text search plus offset paging. */
const listQuery = z.object({
  query: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
});

export const listUsersQuery = listQuery.extend({
  role: z.enum(["MENTEE", "MENTOR", "ADMIN"]).optional(),
  verified: z.enum(["true", "false"]).optional(),
  enrolled: z.enum(["true", "false"]).optional(),
  /** The pending instructor-access panel pages independently of the account list. */
  requestsPage: z.coerce.number().int().min(1).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;

export const listCoursesQuery = listQuery.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuery>;

/** Paging-only queries for lists without a search box. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** The audit log accepts a free-text search and an optional target type. */
export const listAuditQuery = pageQuery.extend({
  query: z.string().trim().max(120).optional(),
  targetType: z.string().trim().max(40).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuery>;

export const listOrganizationsQuery = pageQuery.extend({
  query: z.string().trim().max(120).optional(),
});
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuery>;

/** The requests page pages its two lists independently: `page` (pending), `recentPage` (reviewed). */
export const listRequestsQuery = pageQuery.extend({
  recentPage: z.coerce.number().int().min(1).optional(),
});
export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;

/** Platform metrics window: 7, 30 (default), or 90 UTC days. */
export const metricsQuery = z.object({
  range: z.enum(["7", "30", "90"]).optional(),
});
export type MetricsQuery = z.infer<typeof metricsQuery>;

export const withdrawalIdParams = z.object({
  withdrawalId: z.string().min(1),
});
export type WithdrawalIdParams = z.infer<typeof withdrawalIdParams>;

export const rejectWithdrawalBody = z.object({
  reason: z.string().trim().max(240).optional(),
});
export type RejectWithdrawalBody = z.infer<typeof rejectWithdrawalBody>;

export const grantOrganizationCreditsBody = z.object({
  amountCredits: z.number().int().positive(),
  reason: z.string().trim().max(240).optional(),
});
export type GrantOrganizationCreditsBody = z.infer<typeof grantOrganizationCreditsBody>;


export const listEnrollmentsQuery = listQuery.extend({
  /** A payment status, or "NONE" for enrollments with no payment row (free or admin-granted). */
  payment: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED", "NONE"]).optional(),
  lifecycle: z.enum(["PENDING_ACCOUNT", "PAYMENT_REQUIRED", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"]).optional(),
  /** "true": a coupon or campaign was applied; "admin": enrolled by an admin; "false": full price. */
  discount: z.enum(["true", "admin", "false"]).optional(),
});
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuery>;
