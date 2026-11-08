import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "./audit.js";

/**
 * Grant or revoke free access for several allocated courses in one transaction,
 * with a single audit entry. Every course must already be in the organization's catalog.
 */
export async function setCoursesFreeForOrganization(
  actor: AdminActor,
  organizationId: string,
  courseIds: string[],
  freeForOrganization: boolean
): Promise<{ updated: number }> {
  const uniqueCourseIds = [...new Set(courseIds)];
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
    if (!organization) throw new NotFoundError("Organization not found");

    const allocations = await tx.organizationCourse.findMany({
      where: { organizationId, courseId: { in: uniqueCourseIds } },
      select: { courseId: true },
    });
    const allocated = new Set(allocations.map((row) => row.courseId));
    const notAllocated = uniqueCourseIds.filter((courseId) => !allocated.has(courseId));
    if (notAllocated.length > 0) {
      throw new UnprocessableError(
        `${notAllocated.length} selected course${notAllocated.length === 1 ? " is" : "s are"} not in this organization's catalog.`,
        "COURSE_NOT_ALLOCATED",
        ["Add the course to the organization's catalog before granting free access."]
      );
    }

    if (freeForOrganization) {
      await tx.courseOrganizationAccess.createMany({
        data: uniqueCourseIds.map((courseId) => ({ courseId, organizationId })),
        skipDuplicates: true,
      });
    } else {
      await tx.courseOrganizationAccess.deleteMany({ where: { organizationId, courseId: { in: uniqueCourseIds } } });
    }

    await recordAdminAction(tx, {
      actor,
      action: freeForOrganization ? ADMIN_AUDIT_ACTIONS.COURSE_ORG_ACCESS_GRANT : ADMIN_AUDIT_ACTIONS.COURSE_ORG_ACCESS_REVOKE,
      targetType: "Organization",
      targetId: organizationId,
      summary: `${freeForOrganization ? "Granted" : "Revoked"} free access for ${uniqueCourseIds.length} course${uniqueCourseIds.length === 1 ? "" : "s"} at ${organization.name}`,
      metadata: { organizationId, courseIds: uniqueCourseIds },
    });
  });
  return { updated: uniqueCourseIds.length };
}

// Platform-admin management of CourseOrganizationAccess: which organizations
// receive a paid course at no charge. Instructors have no control over this list.

export async function listCourseOrganizationAccess(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, slug: true } });
  if (!course) throw new NotFoundError("Course not found");
  const rows = await prisma.courseOrganizationAccess.findMany({
    where: { courseId },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  return {
    course,
    grants: rows.map((row) => ({
      organization: row.organization,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function grantCourseOrganizationAccess(actor: AdminActor, courseId: string, organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [course, organization] = await Promise.all([
      tx.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } }),
      tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
    ]);
    if (!course) throw new NotFoundError("Course not found");
    if (!organization) throw new NotFoundError("Organization not found");

    // Free access is managed from the organization's catalog, so the course must already be allocated to it.
    const allocation = await tx.organizationCourse.findUnique({
      where: { organizationId_courseId: { organizationId, courseId } },
      select: { id: true },
    });
    if (!allocation) {
      throw new UnprocessableError("Add this course to the organization's catalog before granting free access.", "COURSE_NOT_ALLOCATED");
    }

    const existing = await tx.courseOrganizationAccess.findUnique({
      where: { courseId_organizationId: { courseId, organizationId } },
      select: { courseId: true },
    });
    if (existing) throw new ConflictError("This organization already has free access to this course.");

    await tx.courseOrganizationAccess.create({ data: { courseId, organizationId } });
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.COURSE_ORG_ACCESS_GRANT,
      targetType: "Course",
      targetId: courseId,
      summary: `Granted free access to ${course.title} for ${organization.name}`,
      metadata: { organizationId, courseId },
    });
  });
}

export async function revokeCourseOrganizationAccess(actor: AdminActor, courseId: string, organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [course, organization] = await Promise.all([
      tx.course.findUnique({ where: { id: courseId }, select: { title: true } }),
      tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);
    const deleted = await tx.courseOrganizationAccess.deleteMany({ where: { courseId, organizationId } });
    if (!deleted.count) throw new NotFoundError("Free access grant not found");
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.COURSE_ORG_ACCESS_REVOKE,
      targetType: "Course",
      targetId: courseId,
      summary: `Revoked free access to ${course?.title ?? courseId} for ${organization?.name ?? organizationId}`,
      metadata: { organizationId, courseId },
    });
  });
}
