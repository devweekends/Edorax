import { renderEmailTemplate } from "../email/render.js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AssignByEmailsResult, InviteLinkResult } from "../../shared/api/teach.js";
import { TEACH_ERROR_CODES } from "../../shared/api/teach.js";
import { prisma } from "../../db/prisma.js";
import { UnprocessableError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { notifyMenteeCourseEnrollment, notifyMentorNewEnrollment } from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { lifecycleForSignedInEnrollment } from "../enrollment/lifecycle.js";
import { assignmentForNewEnrollment } from "../courses/variant-assignment.js";
import { couponUnlocksContent, issueCouponForEnrollment, redeemCouponUsage } from "../coupons/issue.js";
import { calculateFinancialBreakdown } from "../financials/calculator.js";
import { resolveCouponOrganizationForCourse } from "../coupons/resolve-org.js";
import { inviteAcceptUrl, sendEmail } from "../email/send.js";
import { requireCourseById, type OwnedCourse } from "./access.js";

// Mentor side of assignment and invites (docs/phases/m7-assignment-and-polish.mdx).
// Acceptance lives in services/invites — brand-new accounts accept before they
// have any role history, so it only needs a signed-in user.

const INVITE_TTL_DAYS = 14;

const newInviteToken = () => randomBytes(24).toString("base64url");
const inviteExpiry = () => new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return z.string().email().safeParse(trimmed).success ? trimmed : null;
}

function requirePublished(course: OwnedCourse, action: string) {
  if (course.status !== "PUBLISHED") {
    throw new UnprocessableError(`Publish the course before ${action}.`, TEACH_ERROR_CODES.COURSE_NOT_PUBLISHED, [
      `Publish the course before ${action}.`,
    ]);
  }
}

async function sendInviteEmail(input: { to: string; token: string; courseTitle: string; mentorName: string | null }): Promise<boolean> {
  const url = inviteAcceptUrl(input.token);
  const mentor = input.mentorName ?? "Your mentor";
  const result = await sendEmail({
    to: input.to,
    subject: `${mentor} invited you to "${input.courseTitle}" on Edorax`,
    text: `${mentor} invited you to the course "${input.courseTitle}" on Edorax.\n\nOpen this link to create your profile and start learning:\n${url}\n\nThe invite expires in ${INVITE_TTL_DAYS} days.`,
    html: await renderEmailTemplate("send-invite-email", { mentorName: mentor, courseTitle: input.courseTitle, url, expiryDays: INVITE_TTL_DAYS }),
  });
  return result.sent;
}

/**
 * Assigns a course by email. Addresses with an account get an Enrollment right
 * away; the rest get an email-bound invite whose acceptance creates one.
 */
export async function assignByEmails(user: SessionUser, courseId: string, emailsRaw: string): Promise<AssignByEmailsResult> {
  const course = await requireCourseById(user, courseId);

  const emails = Array.from(
    new Set(emailsRaw.split(/[\n,;\s]+/).map(normalizeEmail).filter((email): email is string => email !== null))
  );
  if (emails.length === 0) {
    throw new UnprocessableError("Enter at least one valid email address.", "VALIDATION_ERROR", ["Enter at least one valid email address."]);
  }
  requirePublished(course, "assigning it to mentees");
  const pricing = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { pricingType: true, priceCents: true, currency: true, instructorPayoutPercent: true } });

  const couponOrg = await resolveCouponOrganizationForCourse(course.id);
  const enrolledEmails: string[] = [];
  const invitedEmails: string[] = [];
  let emailFailed = false;

  for (const email of emails) {
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (existingUser) {
      const enrollment = await prisma.$transaction(async tx => {
        const old = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId: course.id, userId: existingUser.id } }, select: { id: true } });
        if (old) return old;
        const assignment = await assignmentForNewEnrollment(tx, course.id);
        const lifecycle = lifecycleForSignedInEnrollment(pricing.pricingType);
        const created = await tx.enrollment.upsert({
          where: { courseId_userId: { courseId: course.id, userId: existingUser.id } },
          update: {},
          create: {
            ...assignment,
            courseId: course.id,
            userId: existingUser.id,
            status: "ASSIGNED",
            assignedById: user.id,
            source: "DIRECT",
            lifecycle,
            organizationId: couponOrg?.organizationId ?? null,
          },
          select: { id: true },
        });
        let coveredByCoupon = false;
        if (couponOrg) {
          const coupon = await issueCouponForEnrollment(tx, {
            organizationId: couponOrg.organizationId,
            courseId: course.id,
            enrollmentId: created.id,
            userId: existingUser.id,
            learnerEmail: email,
            assignedById: user.id,
          });
          if (coupon && couponUnlocksContent(coupon.percentOff)) {
            coveredByCoupon = true;
            await tx.enrollment.update({
              where: { id: created.id },
              data: { lifecycle: "ACTIVE", status: "IN_PROGRESS", startedAt: new Date() },
            });
            await redeemCouponUsage(tx, created.id);
          }
        }
        if (lifecycle === "PAYMENT_REQUIRED" && !coveredByCoupon) {
          const issuedCoupon = await tx.couponUsage.findUnique({ where: { enrollmentId: created.id }, select: { percentOff: true, status: true } });
          const financials = calculateFinancialBreakdown({
            originalAmountCents: pricing.priceCents,
            pricingType: pricing.pricingType,
            fundingSource: issuedCoupon && issuedCoupon.status !== "CANCELLED" ? "organization_contribution" : "manual",
            organizationContributionPercent: issuedCoupon && issuedCoupon.status !== "CANCELLED" ? issuedCoupon.percentOff : 0,
            instructorPayoutPercent: pricing.instructorPayoutPercent,
          });
          await tx.payment.create({ data: { enrollmentId: created.id, amountCents: financials.learnerAmountCents, currency: pricing.currency, status: "PENDING", ...financials } });
        } else if (lifecycle === "ACTIVE") {
          await tx.payment.create({
            data: {
              enrollmentId: created.id,
              amountCents: 0,
              currency: pricing.currency,
              status: "SUCCEEDED",
              provider: coveredByCoupon ? "organization_coupon" : "free",
              paidAt: new Date(),
              ...calculateFinancialBreakdown({
                originalAmountCents: pricing.priceCents,
                pricingType: pricing.pricingType,
                fundingSource: coveredByCoupon ? "organization_contribution" : "free",
                organizationContributionPercent: coveredByCoupon ? 100 : 0,
                instructorPayoutPercent: pricing.instructorPayoutPercent,
              }),
            },
          });
        }
        return created;
      });
      await dispatchNotification(() => notifyMenteeCourseEnrollment(enrollment.id));
      await dispatchNotification(() => notifyMentorNewEnrollment(enrollment.id));
      enrolledEmails.push(email);
      continue;
    }

    // Re-sending reuses the still-valid invite instead of stacking duplicates.
    let invite = await prisma.invite.findFirst({
      where: { courseId: course.id, email, acceptedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    invite ??= await prisma.invite.create({
      data: { token: newInviteToken(), courseId: course.id, email, invitedById: user.id, expiresAt: inviteExpiry() },
    });

    const sent = await sendInviteEmail({ to: email, token: invite.token, courseTitle: course.title, mentorName: user.name });
    if (!sent) emailFailed = true;
    invitedEmails.push(email);
  }

  return { enrolledEmails, invitedEmails, emailFailed };
}

/** Course-scoped open invite link — any signed-in account can self-enrol. Reuses a live one. */
export async function createInviteLink(user: SessionUser, courseId: string): Promise<InviteLinkResult> {
  const course = await requireCourseById(user, courseId);
  requirePublished(course, "sharing an invite link");

  const existing = await prisma.invite.findFirst({
    where: { courseId: course.id, email: null, acceptedAt: null, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { token: existing.token, url: inviteAcceptUrl(existing.token), reused: true };

  const invite = await prisma.invite.create({
    data: { token: newInviteToken(), courseId: course.id, invitedById: user.id, expiresAt: inviteExpiry() },
  });
  return { token: invite.token, url: inviteAcceptUrl(invite.token), reused: false };
}

/** Revoking an accepted invite is a no-op; the enrollment it created stays. */
export async function revokeInvite(user: SessionUser, courseId: string, inviteId: string): Promise<void> {
  await requireCourseById(user, courseId);
  await prisma.invite.updateMany({
    where: { id: inviteId, courseId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
}
