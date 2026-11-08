import { prisma } from "../../db/prisma.js";
import type { SessionUser } from "../../types/auth.js";
import { NotFoundError, UnprocessableError } from "../../utils/errors.js";
import { requireCourseById } from "./access.js";

export async function listInstructorOrganizations(user: SessionUser) {
  const [organizations, courses, requests] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.course.findMany({
      where: {
        mentorId: user.id,
        status: "PUBLISHED",
        pricingType: "PAID",
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        priceCents: true,
        currency: true,
        organizationFreeAccesses: {
          select: { organizationId: true },
        },
      },
    }),
    prisma.organizationCourseRequest.findMany({
      where: {
        course: { mentorId: user.id },
      },
      orderBy: { requestedAt: "desc" },
      include: {
        organization: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
      },
    }),
  ]);

  return {
    organizations,
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      priceCents: course.priceCents,
      currency: course.currency,
      freeOrganizationIds: course.organizationFreeAccesses.map((a) => a.organizationId),
    })),
    requests: requests.map((req) => ({
      id: req.id,
      organizationId: req.organizationId,
      organizationName: req.organization.name,
      courseId: req.courseId,
      courseTitle: req.course.title,
      status: req.status,
      requestedAt: req.requestedAt.toISOString(),
      reviewedAt: req.reviewedAt?.toISOString() ?? null,
    })),
  };
}

export async function setCourseFreeOrganizations(
  user: SessionUser,
  courseId: string,
  organizationIds: string[]
) {
  await requireCourseById(user, courseId);

  return prisma.$transaction(async (tx) => {
    await tx.courseOrganizationAccess.deleteMany({
      where: { courseId },
    });

    if (organizationIds.length) {
      await tx.courseOrganizationAccess.createMany({
        data: organizationIds.map((organizationId) => ({ courseId, organizationId })),
        skipDuplicates: true,
      });
    }

    return { ok: true, freeOrganizationIds: organizationIds };
  });
}

export async function reviewInstructorOrgCourseRequest(
  user: SessionUser,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  grantFreeAccess: boolean
) {
  const request = await prisma.organizationCourseRequest.findUnique({
    where: { id: requestId },
    include: {
      course: { select: { id: true, mentorId: true } },
    },
  });

  if (!request || request.course.mentorId !== user.id) {
    throw new NotFoundError("Organization course request not found.");
  }

  if (request.status !== "PENDING") {
    throw new UnprocessableError("This request has already been reviewed.", "ALREADY_REVIEWED");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.organizationCourseRequest.update({
      where: { id: request.id },
      data: {
        status: decision,
        reviewedAt: now,
        reviewedById: user.id,
      },
    });

    if (decision === "APPROVED" && grantFreeAccess) {
      await tx.courseOrganizationAccess.upsert({
        where: {
          courseId_organizationId: {
            courseId: request.courseId,
            organizationId: request.organizationId,
          },
        },
        create: {
          courseId: request.courseId,
          organizationId: request.organizationId,
        },
        update: {},
      });
    }

    return { ok: true, request: updated };
  });
}

