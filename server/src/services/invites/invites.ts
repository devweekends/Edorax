import { INVITE_ERROR_CODES, type AcceptInviteResult, type InvitePublicView, type InviteState } from "../../shared/api/invites.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { notifyMenteeCourseEnrollment, notifyMentorNewEnrollment } from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { lifecycleForSignedInEnrollment } from "../enrollment/lifecycle.js";
import { settleAssignment } from "../financials/settlement.js";
import { assignmentForNewEnrollment } from "../courses/variant-assignment.js";

const inviteInclude = {
  course: {
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverUrl: true,
      status: true,
      estimatedHours: true,
      pricingType: true,
      priceCents: true,
      currency: true,
      instructorPayoutPercent: true,
      mentor: { select: { name: true } },
    },
  },
} as const;

type InviteRow = NonNullable<Awaited<ReturnType<typeof loadInvite>>>;

function loadInvite(token: string) {
  return prisma.invite.findUnique({ where: { token }, include: inviteInclude });
}

function inviteState(invite: InviteRow): InviteState {
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt && invite.expiresAt <= new Date()) return "expired";
  if (invite.course.status !== "PUBLISHED") return "course-unavailable";
  return "valid";
}

/** What anyone holding the link may see before signing in. */
export async function getInvitePublicView(token: string): Promise<InvitePublicView> {
  const invite = await loadInvite(token);
  if (!invite) throw new NotFoundError("Invite not found");
  const { mentor, pricingType: _p, priceCents: _c, currency: _cur, instructorPayoutPercent: _share, ...course } = invite.course;
  return {
    state: inviteState(invite),
    email: invite.email,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    course: { ...course, mentorName: mentor.name },
  };
}

/**
 * Signed-in learner accepts an invite: creates the enrollment (the same shape an
 * assignment produces), marks the invite used and optionally sets their name.
 */
export async function acceptInvite(user: SessionUser, token: string, name?: string): Promise<AcceptInviteResult> {
  const invite = await loadInvite(token);
  if (!invite) throw new NotFoundError("Invite not found");

  switch (inviteState(invite)) {
    case "revoked":
      throw new ConflictError("This invite was revoked.", INVITE_ERROR_CODES.INVITE_REVOKED);
    case "accepted":
      throw new ConflictError("This invite has already been accepted.", INVITE_ERROR_CODES.INVITE_ACCEPTED);
    case "expired":
      throw new ConflictError("This invite has expired.", INVITE_ERROR_CODES.INVITE_EXPIRED);
    case "course-unavailable":
      throw new ConflictError("This course is not open for enrollment.", INVITE_ERROR_CODES.COURSE_UNAVAILABLE);
  }
  if (invite.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new ForbiddenError("This invite was sent to a different account.", INVITE_ERROR_CODES.WRONG_ACCOUNT);
  }

  const settlement = settleAssignment({
    pricingType: invite.course.pricingType,
    channel: "direct",
    organizationListed: false,
    originalAmountCents: invite.course.priceCents,
    instructorPayoutPercent: invite.course.instructorPayoutPercent,
  });
  const lifecycle = settlement.grantsAccess ? "ACTIVE" : lifecycleForSignedInEnrollment(invite.course.pricingType);
  const checkoutRequired = !settlement.grantsAccess;

  const enrollmentId = await prisma.$transaction(async (tx) => {
    const existing = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId: invite.courseId, userId: user.id } }, select: { id: true } });
    const assignment = existing ? {} : await assignmentForNewEnrollment(tx, invite.courseId);
    const enrollment = await tx.enrollment.upsert({
      where: { courseId_userId: { courseId: invite.courseId, userId: user.id } },
      update: {},
      create: {
        ...assignment,
        courseId: invite.courseId,
        userId: user.id,
        status: checkoutRequired ? "ASSIGNED" : "IN_PROGRESS",
        source: "INVITE",
        lifecycle,
        startedAt: checkoutRequired ? null : new Date(),
      },
    });
    await tx.payment.upsert({
      where: { enrollmentId: enrollment.id },
      create: { enrollmentId: enrollment.id, currency: invite.course.currency, ...settlement.payment },
      update: {},
    });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedById: user.id } });
    const trimmed = name?.trim();
    if (trimmed) await tx.user.update({ where: { id: user.id }, data: { name: trimmed } });
    return enrollment.id;
  });

  await dispatchNotification(() => notifyMenteeCourseEnrollment(enrollmentId));
  await dispatchNotification(() => notifyMentorNewEnrollment(enrollmentId));

  return { courseSlug: invite.course.slug, checkoutRequired };
}
