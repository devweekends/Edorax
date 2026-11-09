import type { CourseCategory, CoursePricingType, CourseStatus, EnrollmentLifecycle, EnrollStatus } from "../domain/enums.js";
import type { CourseTrack } from "../lib/course-tracks.js";
import type { SyllabusModule } from "./syllabus.js";

// Wire contract for the public catalog, course overview, checkout and self-enrolment.

export type CatalogCourseSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  difficulty: string | null;
  estimatedHours: number | null;
  /** Catalog grouping shown as tiles: technical courses and soft-skills courses. */
  category: CourseCategory;
  subcategory: string | null;
  tags: string[];
  pricingType: CoursePricingType;
  priceCents: number;
  currency: string;
  projectGoal: string | null;
  instructorName: string | null;
  moduleCount: number;
  chapterCount: number;
  /** Cached course rating; null until the first review lands. */
  ratingAverage: number | null;
  ratingCount: number;
  /** The caller's enrollment lifecycle in this course; null for anonymous visitors. */
  enrollmentLifecycle: EnrollmentLifecycle | null;
};

export type CatalogCourseDetail = CatalogCourseSummary & {
  modules: Array<{
    id: string;
    title: string;
    order: number;
    chapters: Array<{ id: string; title: string; order: number; estimatedMinutes: number | null }>;
  }>;
  /** What the caller can do next with this course. */
  access: "active" | "payment_required" | "none";
};

/** Org coupon applied to this enrollment; shown on the course overview. */
export type CourseCouponEntitlement = {
  displayLabel: string;
  percentOff: number;
  status: "ISSUED" | "REDEEMED";
  organizationName: string;
};

export type CourseOverview = {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    projectGoal: string | null;
    coverUrl: string | null;
    difficulty: string | null;
    estimatedHours: number | null;
    status: CourseStatus;
    instructorName: string | null;
  };
  access: "active" | "payment_required" | "none";
  enrollment: { percentComplete: number; chaptersCompleted: number; pendingReviews: number; status: EnrollStatus } | null;
  /** The learner's own rating, once submitted. Drives the overview card and edit state. */
  rating: { rating: number; review: string | null; updatedAt: string } | null;
  /** The learner dismissed the rating prompt; keep only the small on-demand link. */
  ratingDismissed: boolean;
  /** Present when an org coupon unlocked or discounted this enrollment. */
  coupon: CourseCouponEntitlement | null;
  /** Variant and specialisation for a course in a family; null otherwise or without access. */
  track: CourseTrack | null;
  /** True when a newer course release is available for an enrolled learner who finished an earlier version. */
  curriculumUpgradeAvailable?: boolean;
  /** Present only when access is active. */
  syllabus: {
    modules: SyllabusModule[];
    chapterCount: number;
    continueHref: string | null;
    defaultOpenModuleId: string | null;
  } | null;
};

export type Checkout = {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    coverUrl: string | null;
    difficulty: string | null;
    estimatedHours: number | null;
    projectGoal: string | null;
    instructorName: string | null;
    pricingType: CoursePricingType;
    priceCents: number;
    currency: string;
  };
  automaticDiscount: { percentOff: number; label: string } | null;
  organizationDiscount: { percentOff: number; label: string; amountDueCents: number } | null;
  amountDueCents: number;
  enrollment: { id: string; lifecycle: EnrollmentLifecycle } | null;
  state: "no_enrollment" | "payment_required" | "already_paid";
};

export type SelfEnrollResult = {
  enrollmentId: string;
  courseSlug: string;
  lifecycle: EnrollmentLifecycle;
  created: boolean;
};

export const ENROLLMENT_ERROR_CODES = {
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  NOT_PUBLISHED: "NOT_PUBLISHED",
  COUPON_INVALID: "COUPON_INVALID",
  COUPON_EXHAUSTED: "COUPON_EXHAUSTED",
  COUPON_NOT_APPLICABLE: "COUPON_NOT_APPLICABLE",
} as const;

/** PUT /api/v1/courses/:courseSlug/track/variant and /track/specialisation */
export type UpdateCourseTrackResult = { courseSlug: string; track: CourseTrack };

export const COURSE_TRACK_ERROR_CODES = {
  NO_FAMILY: "COURSE_HAS_NO_VARIANTS",
  COURSE_FINISHED: "VARIANT_LOCKED_AFTER_COMPLETION",
  VARIANT_LOCKED: "VARIANT_LOCKED_AFTER_START",
  VARIANT_UNAVAILABLE: "VARIANT_UNAVAILABLE",
  NOT_FINISHED: "SPECIALISATION_NOT_OPEN",
} as const;
