import type {
  CoursePricingType,
  EnrollmentLifecycle,
  PaymentStatus,
  Prisma,
} from "../../generated/prisma/index.js";

export const CONFIRMED_ENROLLMENT_LIFECYCLES = [
  "ACTIVE",
  "COMPLETED",
] as const satisfies readonly EnrollmentLifecycle[];

/**
 * Prisma filter for confirmed, positive enrollments only — excludes enrollments still
 * awaiting payment (`PAYMENT_REQUIRED` / `PENDING`), rejected or failed requests
 * (`CANCELLED` / `FAILED` / `REFUNDED`), unlinked `PENDING_ACCOUNT` rows, and `EXPIRED`.
 */
export const CONFIRMED_ENROLLMENT_WHERE: Prisma.EnrollmentWhereInput = {
  lifecycle: { in: [...CONFIRMED_ENROLLMENT_LIFECYCLES] },
  OR: [{ payment: null }, { payment: { status: "SUCCEEDED" } }],
};

/** Whether the learner may open chapters and submit work. */
export function enrollmentGrantsContentAccess(lifecycle: EnrollmentLifecycle): boolean {
  return lifecycle === "ACTIVE" || lifecycle === "COMPLETED";
}

/** Whether a loaded enrollment represents a confirmed, paid/free positive enrollment. */
export function isConfirmedEnrollment(enrollment: {
  lifecycle: EnrollmentLifecycle;
  payment?: { status: PaymentStatus } | null;
}): boolean {
  return (
    enrollmentGrantsContentAccess(enrollment.lifecycle) &&
    (!enrollment.payment || enrollment.payment.status === "SUCCEEDED")
  );
}

/** Signed-in direct enrollment (self-serve, invite, or linked Pathment account). */
export function lifecycleForSignedInEnrollment(pricingType: CoursePricingType): EnrollmentLifecycle {
  return pricingType === "PAID" ? "PAYMENT_REQUIRED" : "ACTIVE";
}

/** Pathment row before the learner has a Buildment account. */
export function lifecycleForPathmentEnrollment(
  pricingType: CoursePricingType,
  hasUser: boolean
): EnrollmentLifecycle {
  if (!hasUser) return "PENDING_ACCOUNT";
  return lifecycleForSignedInEnrollment(pricingType);
}
