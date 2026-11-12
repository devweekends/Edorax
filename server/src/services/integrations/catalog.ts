import { prisma } from "../../db/prisma.js";
import type { AuthenticatedOrganization } from "../../types/auth.js";
import { availableEnrollmentCount } from "./allocation.js";

/** Published courses this organisation may enrol learners into right now. */
export async function listAllocatedCourses(org: AuthenticatedOrganization) {
  const now = new Date();
  const rows = await prisma.organizationCourse.findMany({
    where: {
      organizationId: org.id,
      isAllowed: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      course: { status: "PUBLISHED" },
    },
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          pricingType: true,
          priceCents: true,
          currency: true,
          status: true,
          organizationFreeAccesses: { where: { organizationId: org.id }, select: { organizationId: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => {
    const freeForOrganization = row.course.organizationFreeAccesses.length > 0;
    return {
      course_id: row.course.id,
      course_slug: row.course.slug,
      title: row.course.title,
      description: row.course.description,
      price: row.course.priceCents,
      currency: row.course.currency,
      pricing_type: row.course.pricingType,
      // Platform-admin grant: the organization sees this course at no charge and it
      // bypasses organization credits and contribution coupons when assigned via Pathment.
      free_for_organization: freeForOrganization,
      effective_price: freeForOrganization ? 0 : row.course.priceCents,
      status: row.course.status,
      expires_at: row.expiresAt?.toISOString() ?? null,
      available_enrollment_count: availableEnrollmentCount(row),
    };
  });
}

/** Every allocation row for the organisation, including disabled and expired ones. */
export async function listAllocations(org: AuthenticatedOrganization) {
  const rows = await prisma.organizationCourse.findMany({
    where: { organizationId: org.id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          status: true,
          organizationFreeAccesses: { where: { organizationId: org.id }, select: { organizationId: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => ({
    course_id: row.courseId,
    title: row.course.title,
    course_status: row.course.status,
    free_for_organization: row.course.organizationFreeAccesses.length > 0,
    is_allowed: row.isAllowed,
    max_enrollments: row.maxEnrollments,
    current_enrollments: row.currentEnrollments,
    available_enrollment_count: availableEnrollmentCount(row),
    expires_at: row.expiresAt?.toISOString() ?? null,
  }));
}
