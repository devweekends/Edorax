import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type {
  AdminEnrollmentDetail,
  AdminEnrollmentDiscount,
  AdminEnrollmentPayment,
  AdminEnrollmentRow,
  AdminEnrollmentsView,
} from "../../shared/api/admin.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import type { AdminEnrollmentUpdateBody } from "../../validations/enrollments.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "./audit.js";
import type { ListEnrollmentsQuery } from "../../validations/admin.js";
import { refundBreakdown } from "../payments/refund-policy.js";
import { pageInfo, resolvePaging } from "./paging.js";

// Every enrollment with the money recorded against it, so an admin can see what each learner paid.

const paymentSelect = {
  status: true,
  currency: true,
  amountCents: true,
  originalAmountCents: true,
  discountAmountCents: true,
  organizationContributionCents: true,
  learnerAmountCents: true,
  platformRevenueCents: true,
  instructorShareCents: true,
  instructorPayoutPercent: true,
  instructorPayoutStatus: true,
  fundingSource: true,
  provider: true,
  providerRef: true,
  paidAt: true,
} satisfies Prisma.PaymentSelect;

const rowSelect = {
  id: true,
  createdAt: true,
  lifecycle: true,
  source: true,
  user: { select: { id: true, name: true, email: true } },
  learnerProfile: { select: { email: true } },
  course: { select: { id: true, title: true, slug: true } },
  payment: { select: paymentSelect },
  instructorCouponRedemption: {
    select: {
      percentOff: true,
      redeemedAt: true,
      coupon: {
        select: {
          id: true,
          label: true,
          code: true,
          autoApply: true,
          campaign: { select: { id: true, label: true, code: true, autoApply: true } },
        },
      },
    },
  },
  couponUsage: {
    select: {
      status: true,
      percentOff: true,
      displayLabel: true,
      issuedAt: true,
      redeemedAt: true,
      pool: { select: { id: true, label: true, code: true } },
      organization: { select: { name: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

type RowRecord = Prisma.EnrollmentGetPayload<{ select: typeof rowSelect }>;
type PaymentRecord = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

/** Admin enrollments carry a payment row with this provider (see adminWaiverSnapshot). */
export const ADMIN_ENROLLMENT_PROVIDER = "admin";

const HAS_COUPON: Prisma.EnrollmentWhereInput = {
  OR: [{ instructorCouponRedemption: { isNot: null } }, { couponUsage: { isNot: null } }],
};
const IS_ADMIN_ENROLLMENT: Prisma.EnrollmentWhereInput = { payment: { is: { provider: ADMIN_ENROLLMENT_PROVIDER } } };
const DISCOUNT_FILTERS: Record<NonNullable<ListEnrollmentsQuery["discount"]>, Prisma.EnrollmentWhereInput> = {
  true: HAS_COUPON,
  admin: IS_ADMIN_ENROLLMENT,
  false: { NOT: { OR: [HAS_COUPON, IS_ADMIN_ENROLLMENT] } },
};

/** Coupons and campaigns behind an enrollment's discount; an empty list means full price. */
function toDiscounts(row: Pick<RowRecord, "id" | "instructorCouponRedemption" | "couponUsage" | "payment">): AdminEnrollmentDiscount[] {
  const discounts: AdminEnrollmentDiscount[] = [];
  const payment = row.payment;
  if (payment?.provider === ADMIN_ENROLLMENT_PROVIDER) {
    discounts.push({
      kind: "admin_enrollment",
      id: row.id,
      label: "Admin enrollment",
      code: null,
      percentOff: payment.originalAmountCents > 0 ? Math.round((payment.discountAmountCents / payment.originalAmountCents) * 100) : 100,
      autoApplied: false,
      status: null,
      appliedAt: payment.paidAt?.toISOString() ?? null,
      organizationName: null,
    });
  }
  const redemption = row.instructorCouponRedemption;
  if (redemption) {
    const { coupon } = redemption;
    const base = { percentOff: redemption.percentOff, status: null, appliedAt: redemption.redeemedAt.toISOString(), organizationName: null };
    discounts.push(
      coupon.campaign
        ? {
            ...base,
            kind: "campaign",
            id: coupon.campaign.id,
            label: coupon.campaign.label,
            code: coupon.campaign.code ?? coupon.code,
            autoApplied: coupon.campaign.autoApply,
          }
        : { ...base, kind: "instructor_coupon", id: coupon.id, label: coupon.label, code: coupon.code, autoApplied: coupon.autoApply },
    );
  }
  const usage = row.couponUsage;
  if (usage) {
    discounts.push({
      kind: "organization_coupon",
      id: usage.pool.id,
      label: usage.displayLabel || usage.pool.label,
      code: usage.pool.code,
      percentOff: usage.percentOff,
      autoApplied: false,
      status: usage.status,
      appliedAt: (usage.redeemedAt ?? usage.issuedAt).toISOString(),
      organizationName: usage.organization.name,
    });
  }
  return discounts;
}

function buildEnrollmentWhere(filters: ListEnrollmentsQuery): Prisma.EnrollmentWhereInput {
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
  const discount = filters.discount ? DISCOUNT_FILTERS[filters.discount] : null;
  return {
    ...(discount ? { AND: [discount] } : {}),
    ...(filters.lifecycle ? { lifecycle: filters.lifecycle } : {}),
    ...(filters.payment === "NONE"
      ? { payment: { is: null } }
      : filters.payment
        ? { payment: { is: { status: filters.payment } } }
        : {}),
    ...(filters.query
      ? {
          OR: [
            { user: { is: { email: contains(filters.query) } } },
            { user: { is: { name: contains(filters.query) } } },
            { learnerProfile: { is: { email: contains(filters.query) } } },
            { course: { title: contains(filters.query) } },
          ],
        }
      : {}),
  };
}

function toPayment(payment: PaymentRecord): AdminEnrollmentPayment {
  return { ...payment, paidAt: payment.paidAt?.toISOString() ?? null };
}

function toRow(row: RowRecord): AdminEnrollmentRow {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lifecycle: row.lifecycle,
    source: row.source,
    learner: {
      userId: row.user?.id ?? null,
      name: row.user?.name ?? null,
      email: row.user?.email ?? row.learnerProfile?.email ?? null,
    },
    course: row.course,
    payment: row.payment ? toPayment(row.payment) : null,
    discounts: toDiscounts(row),
  };
}

export async function listEnrollments(filters: ListEnrollmentsQuery = {}): Promise<AdminEnrollmentsView> {
  const where = buildEnrollmentWhere(filters);
  const paging = resolvePaging(filters, await prisma.enrollment.count({ where }));
  const rows = await prisma.enrollment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: paging.skip,
    take: paging.take,
    select: rowSelect,
  });
  return { enrollments: rows.map(toRow), page: pageInfo(paging) };
}

export async function getEnrollmentDetail(enrollmentId: string): Promise<AdminEnrollmentDetail> {
  const row = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      ...rowSelect,
      status: true,
      startedAt: true,
      completedAt: true,
      percentComplete: true,
      organization: { select: { id: true, name: true } },
      course: { select: { id: true, title: true, slug: true, mentor: { select: { id: true, name: true, email: true } } } },
      payment: { select: { ...paymentSelect, createdAt: true, updatedAt: true, instructorPayoutPaidAt: true } },
    },
  });
  if (!row) throw new NotFoundError("Enrollment not found");

  const { mentor, ...course } = row.course;
  const base = toRow({ ...row, course, payment: null });
  const payment = row.payment;
  return {
    ...base,
    discounts: toDiscounts(row),
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    percentComplete: row.percentComplete,
    instructor: mentor,
    organization: row.organization,
    payment: payment
      ? {
          ...toPayment(payment),
          createdAt: payment.createdAt.toISOString(),
          updatedAt: payment.updatedAt.toISOString(),
          instructorPayoutPaidAt: payment.instructorPayoutPaidAt?.toISOString() ?? null,
          refund:
            payment.status === "REFUNDED" && payment.provider === "polar"
              ? { currency: payment.currency, ...refundBreakdown(payment.amountCents) }
              : null,
        }
      : null,
  };
}

/**
 * Admin edit of an enrollment's course access (lifecycle) and its payment status. Access follows
 * `lifecycle` as stored, so this grants or ends access by hand. It only changes our records; no
 * money moves through Polar.
 */
export async function updateEnrollment(
  actor: AdminActor,
  enrollmentId: string,
  body: AdminEnrollmentUpdateBody,
): Promise<AdminEnrollmentDetail> {
  const existing = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      lifecycle: true,
      course: { select: { title: true } },
      user: { select: { email: true } },
      learnerProfile: { select: { email: true } },
      payment: { select: { status: true, paidAt: true } },
    },
  });
  if (!existing) throw new NotFoundError("Enrollment not found");
  if (body.paymentStatus && !existing.payment) {
    throw new ConflictError("This enrollment has no payment record, so there is no payment status to change.", "NO_PAYMENT");
  }

  await prisma.$transaction(async (tx) => {
    if (body.lifecycle && body.lifecycle !== existing.lifecycle) {
      await tx.enrollment.update({ where: { id: enrollmentId }, data: { lifecycle: body.lifecycle } });
    }
    if (body.paymentStatus && body.paymentStatus !== existing.payment?.status) {
      await tx.payment.update({
        where: { enrollmentId },
        data: {
          status: body.paymentStatus,
          // Marking a payment completed for the first time records it as paid now.
          ...(body.paymentStatus === "SUCCEEDED" && !existing.payment?.paidAt ? { paidAt: new Date() } : {}),
        },
      });
    }
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.ENROLLMENT_UPDATE,
      targetType: "Enrollment",
      targetId: enrollmentId,
      summary: `Edited ${existing.user?.email ?? existing.learnerProfile?.email ?? "learner"}'s enrollment in ${existing.course.title}`,
      metadata: {
        before: { lifecycle: existing.lifecycle, paymentStatus: existing.payment?.status ?? null },
        after: {
          lifecycle: body.lifecycle ?? existing.lifecycle,
          paymentStatus: body.paymentStatus ?? existing.payment?.status ?? null,
        },
      },
    });
  });

  return getEnrollmentDetail(enrollmentId);
}
