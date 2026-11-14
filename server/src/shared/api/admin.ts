import type { CoursePricingType, CourseStatus, EnrollmentLifecycle, RequestStatus, Role } from "../domain/enums.js";

// Wire contract for /api/v1/admin — platform administration. Dates are ISO strings.

/** Offset-pagination envelope shared by every admin list. */
export type AdminPageInfo = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

/** Per-target outcome of a bulk action, so partial failures stay visible. */
export type AdminBulkResult = {
  updated: number;
  skipped: Array<{ id: string; reason: string }>;
};

export type AdminOverview = {
  organizations: number;
  pendingCourseRequests: number;
  publishedCourses: number;
  instructors: number;
};

/** One UTC day of platform trend data. */
export type AdminMetricPoint = {
  /** YYYY-MM-DD */
  date: string;
  signups: number;
  enrollments: number;
  activeLearners: number;
};

export type AdminMetricTotals = {
  newUsers: number;
  newEnrollments: number;
  activeLearners: number;
  studySeconds: number;
};

export type AdminMetricsView = {
  rangeDays: number;
  totals: AdminMetricTotals;
  /** Continuous, oldest → newest, one entry per day. */
  series: AdminMetricPoint[];
};

export type AdminCourseRow = {
  id: string;
  slug: string;
  title: string;
  status: CourseStatus;
  pricingType: CoursePricingType;
  priceCents: number;
  currency: string;
  updatedAt: string;
  instructorLabel: string;
  enrollmentCount: number;
  allocationCount: number;
};

export type AdminOrganizationRow = {
  id: string;
  slug: string;
  name: string;
  /** Access key of the active credential, when one exists. */
  accessKey: string | null;
  allocationCount: number;
  enrollmentCount: number;
};

export type AdminOrganizationsView = {
  organizations: AdminOrganizationRow[];
  page: AdminPageInfo;
};

export type AdminCredentialRow = {
  id: string;
  accessKey: string;
  label: string;
  active: boolean;
  lastUsedAt: string | null;
};

export type AdminAllocationRow = {
  id: string;
  course: { id: string; slug: string; title: string; status: CourseStatus };
  /** Platform-admin grant: this course is free for the organization's Pathment assignments. */
  freeForOrganization: boolean;
  isAllowed: boolean;
  maxEnrollments: number;
  currentEnrollments: number;
  /** Learners enrolled through this organization may join the course's weekly leaderboards. */
  leaderboardEnabled: boolean;
  expiresAt: string | null;
};

export type AdminCouponPoolRow = {
  id: string;
  label: string;
  code: string | null;
  percentOff: number;
  maxRedemptions: number;
  redemptionCount: number;
  reservedCount: number;
  redeemedCount: number;
  remaining: number;
  active: boolean;
  expiresAt: string | null;
  scope: "course" | "general";
  displayLabel: string;
  course: { id: string; slug: string; title: string } | null;
};

export type AdminOrganizationDetail = {
  organization: { id: string; slug: string; name: string; enrollmentCount: number; creditBalance: number };
  creditTransactions: Array<{
    id: string;
    amountCredits: number;
    status: "RESERVED" | "COMMITTED" | "RELEASED";
    createdAt: string;
    committedAt: string | null;
    releasedAt: string | null;
    enrollmentId: string;
    courseTitle: string;
  }>;
  credentials: AdminCredentialRow[];
  allocations: AdminAllocationRow[];
  couponPools: AdminCouponPoolRow[];
  pendingRequests: Array<{ id: string; courseId: string; courseTitle: string; courseSlug: string }>;
  /** Every published course, so the admin can allocate new ones. Capped for very large catalogs. */
  publishedCourses: Array<{ id: string; slug: string; title: string }>;
  /** True when the catalog exceeded the cap, so the picker can say so. */
  publishedCoursesTruncated: boolean;
};

/** The secret is shown exactly once, right after it is issued. */
export type IssuedCredential = { accessKey: string; secret: string };

export type CreatedOrganization = {
  organization: { id: string; slug: string; name: string };
  credential: IssuedCredential;
};

export type AdminCourseRequestsView = {
  pending: Array<{
    id: string;
    requestedAt: string;
    organization: { id: string; slug: string; name: string };
    course: { slug: string; title: string; status: CourseStatus };
  }>;
  pendingPage: AdminPageInfo;
  recent: Array<{
    id: string;
    status: RequestStatus;
    reviewedAt: string | null;
    reviewerEmail: string | null;
    organizationName: string;
    courseTitle: string;
  }>;
  recentPage: AdminPageInfo;
};

export type AdminUserRow = {
  zipImportEnabled: boolean;
  testerEnabled: boolean;
  suspended: boolean;
  id: string;
  email: string;
  name: string | null;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  enrollmentCount: number;
  courseCount: number;
};

export type AdminUsersView = {
  pendingInstructorRequests: Array<{
    id: string;
    message: string | null;
    user: { id: string; email: string; name: string | null; role: Role };
  }>;
  pendingRequestsPage: AdminPageInfo;
  users: AdminUserRow[];
  page: AdminPageInfo;
};

export type AdminCoursesView = {
  courses: AdminCourseRow[];
  page: AdminPageInfo;
};

/** Platform-admin free-for-organization grants for one course. */
export type AdminCourseOrgAccessView = {
  course: { id: string; title: string; slug: string };
  grants: Array<{
    organization: { id: string; name: string; slug: string };
    createdAt: string;
  }>;
};

/** One-time TOTP enrollment payload: the secret, the otpauth URI, and a scannable QR (data URL). */
export type AdminTotpEnrollment = { secret: string; otpauthUri: string; qrDataUrl: string };

export type AdminMfaStatus = { enabled: boolean; recoveryCodesRemaining: number };

/** Backup codes are returned exactly once, at enable or regenerate time. */
export type AdminRecoveryCodes = { recoveryCodes: string[] };

export type AdminUserDetail = {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
    emailVerified: boolean;
    zipImportEnabled: boolean;
    testerEnabled: boolean;
    suspended: boolean;
    suspensionNote: string | null;
    mfaEnabled: boolean;
    createdAt: string;
    activeSessions: number;
    enrollmentCount: number;
    courseCount: number;
  };
  enrollments: Array<{
    id: string;
    courseId: string;
    courseTitle: string;
    courseSlug: string;
    lifecycle: EnrollmentLifecycle;
    percentComplete: number;
    lastActiveAt: string | null;
    /** What a refund would return, for a course paid through Polar and not refunded yet; otherwise null. */
    refund: AdminRefundBreakdown | null;
  }>;
  coursesOwned: Array<{ id: string; title: string; slug: string; status: CourseStatus }>;
};

/** A refund less Polar’s fees on the payment: $0.50 transaction fee, 1.5% international fee, 5% Polar fee. */
export type AdminRefundBreakdown = {
  currency: string;
  paidCents: number;
  fixedFeeCents: number;
  internationalFeeCents: number;
  platformFeeCents: number;
  refundCents: number;
};

export const ADMIN_ERROR_CODES = {
  REQUEST_ALREADY_REVIEWED: "REQUEST_ALREADY_REVIEWED",
  COURSE_NOT_PUBLISHED: "COURSE_NOT_PUBLISHED",
  INVALID_EXPIRY: "INVALID_EXPIRY",
  NOT_ADMIN: "NOT_ADMIN",
  LAST_ADMIN: "LAST_ADMIN",
  SELF_ACTION: "SELF_ACTION",
  ALREADY_VERIFIED: "ALREADY_VERIFIED",
  NOT_SUSPENDED: "NOT_SUSPENDED",
  ALREADY_SUSPENDED: "ALREADY_SUSPENDED",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
} as const;

/** One row of the platform-admin audit trail (newest first). */
export type AdminAuditRow = {
  id: string;
  /** Stable machine key, e.g. "organization.rotate-credential". */
  action: string;
  actorEmail: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  createdAt: string;
};

export type AdminAuditView = {
  entries: AdminAuditRow[];
  page: AdminPageInfo;
};

export type AdminWithdrawalRow = {
  id: string;
  instructorId: string;
  instructorName: string | null;
  instructorEmail: string;
  amountCents: number;
  currency: string;
  status: "REQUESTED" | "PAID" | "REJECTED";
  note: string;
  paymentCount: number;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
};

export type FundingSourceRevenueBreakdown = {
  count: number;
  originalAmountCents: number;
  discountAmountCents: number;
  organizationContributionCents: number;
  learnerAmountCents: number;
  instructorShareCents: number;
  platformRevenueCents: number;
};

export type AdminRevenueReport = {
  totalPlatformRevenueCents: number;
  totalLearnerPaymentsCents: number;
  totalOrganizationContributionsCents: number;
  totalInstructorEarningsCents: number;
  totalInstructorPaidCents: number;
  totalInstructorPendingCents: number;
  currency: string;
  byFundingSource: Record<string, FundingSourceRevenueBreakdown>;
};


export type AdminPaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

/** The money recorded for one enrollment. Every amount is in minor units of `currency`. */
export type AdminEnrollmentPayment = {
  status: AdminPaymentStatus;
  currency: string;
  /** What the learner is charged; for Polar this is the fixed price sent to checkout. */
  amountCents: number;
  originalAmountCents: number;
  discountAmountCents: number;
  organizationContributionCents: number;
  learnerAmountCents: number;
  platformRevenueCents: number;
  instructorShareCents: number;
  instructorPayoutPercent: number;
  instructorPayoutStatus: "NOT_DUE" | "PENDING" | "PAID";
  fundingSource: string | null;
  provider: string | null;
  providerRef: string | null;
  paidAt: string | null;
};

/** A coupon or campaign applied to an enrollment's price. */
export type AdminEnrollmentDiscount = {
  /**
   * campaign: a platform discount campaign; instructor_coupon: a course coupon; organization_coupon:
   * from an organization's pool; admin_enrollment: an admin enrolled the learner without charge.
   */
  kind: "campaign" | "instructor_coupon" | "organization_coupon" | "admin_enrollment";
  id: string;
  label: string;
  code: string | null;
  percentOff: number;
  autoApplied: boolean;
  /** Organization coupons only: ISSUED, REDEEMED or CANCELLED. */
  status: string | null;
  appliedAt: string | null;
  organizationName: string | null;
};

export type AdminEnrollmentRow = {
  id: string;
  createdAt: string;
  lifecycle: EnrollmentLifecycle;
  source: "DIRECT" | "INVITE" | "SELF" | "PATHMENT";
  /** userId is null for an organization learner who has not created an account yet. */
  learner: { userId: string | null; name: string | null; email: string | null };
  course: { id: string; title: string; slug: string };
  payment: AdminEnrollmentPayment | null;
  discounts: AdminEnrollmentDiscount[];
};

export type AdminEnrollmentsView = {
  enrollments: AdminEnrollmentRow[];
  page: AdminPageInfo;
};

export type AdminEnrollmentDetail = AdminEnrollmentRow & {
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "DROPPED";
  startedAt: string | null;
  completedAt: string | null;
  percentComplete: number;
  instructor: { id: string; name: string | null; email: string };
  organization: { id: string; name: string } | null;
  payment:
    | (AdminEnrollmentPayment & {
        createdAt: string;
        updatedAt: string;
        instructorPayoutPaidAt: string | null;
        /** For a refunded payment, the refund less Polar's fees that our refund policy sends back. */
        refund: AdminRefundBreakdown | null;
      })
    | null;
};
