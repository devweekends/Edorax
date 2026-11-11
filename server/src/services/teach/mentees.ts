import type { CourseMenteesView, MenteeAttentionKind, MenteeEvaluation } from "../../shared/api/teach.js";
import { resolveCourseFamily, summarizeLearnerTrack } from "../../shared/lib/course-tracks.js";
import { readReleaseContent, variantForRelease } from "../courses/releases.js";
import { helpUiCopy } from "../../shared/lib/help-ui-copy.js";
import { prisma } from "../../db/prisma.js";
import { NotFoundError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { inviteAcceptUrl } from "../email/send.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../enrollment/lifecycle.js";
import { requireCourseBySlug } from "./access.js";
import { loadMenteeEvaluation } from "./evaluation/load-mentee-evaluation.js";
import { activityState, average, formatLastActive, progressState } from "./helpers.js";

// Cohort roster for one course: every enrolled account with its progress,
// attention flags and the course's pending invites.

const RESPONSE_EVIDENCE_LIMIT = 500;

export async function loadCourseMentees(user: SessionUser, courseSlug: string): Promise<CourseMenteesView> {
  const owned = await requireCourseBySlug(user, courseSlug);
  const now = Date.now();

  const course = await prisma.course.findUniqueOrThrow({
    where: { id: owned.id },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      familySlug: true,
      variantFamily: true,
      activeReleaseId: true,
      _count: { select: { chapters: { where: { archivedAt: null } } } },
      invites: {
        where: { acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, token: true, email: true, createdAt: true },
      },
      enrollments: {
        where: CONFIRMED_ENROLLMENT_WHERE,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          status: true,
          percentComplete: true,
          chaptersCompleted: true,
          totalScore: true,
          maxScore: true,
          pendingReviews: true,
          lastActiveAt: true,
          variantSlug: true,
          releaseId: true,
          specialisationSlug: true,
          user: { select: { name: true, email: true, image: true } },
          chapterProgress: {
            where: { status: { not: "NOT_STARTED" } },
            orderBy: { startedAt: "desc" },
            select: {
              status: true,
              timeSpentSeconds: true,
              startedAt: true,
              chapter: { select: { title: true, estimatedMinutes: true } },
            },
          },
        },
      },
      helpThreads: { where: { status: "OPEN" }, select: { menteeId: true } },
    },
  });
  const releaseIds = [...new Set([course.activeReleaseId, ...course.enrollments.map(item => item.releaseId)].filter((id): id is string => Boolean(id)))];
  const releases = await prisma.courseRelease.findMany({ where: { id: { in: releaseIds } }, select: { id: true, content: true } });
  const byRelease = new Map(releases.map(release => [release.id, readReleaseContent(release.content)]));
  const family = resolveCourseFamily(course.familySlug, course.variantFamily);
  const chapterCountFor = (releaseId: string | null, variantSlug: string | null) => {
    const content = byRelease.get(releaseId ?? course.activeReleaseId ?? "");
    const modules = content?.variants[variantForRelease(family, variantSlug)] ?? content?.variants.default;
    return modules ? modules.flatMap(module => module.chapters).length : course._count.chapters;
  };

  // Latest response per (enrollment, block) decides whether a revision is still owed.
  const enrollmentIds = course.enrollments.map((item) => item.id);
  const recentResponses = enrollmentIds.length
    ? await prisma.response.findMany({
        where: { enrollmentId: { in: enrollmentIds }, status: { not: "DRAFT" } },
        orderBy: { submittedAt: "desc" },
        take: RESPONSE_EVIDENCE_LIMIT,
        select: { enrollmentId: true, blockId: true, status: true },
      })
    : [];
  const seen = new Set<string>();
  const revisionDue = new Set<string>();
  for (const response of recentResponses) {
    const key = `${response.enrollmentId}:${response.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (response.status === "NEEDS_REVISION") revisionDue.add(response.enrollmentId);
  }

  const openHelpByUser = new Map<string, number>();
  for (const thread of course.helpThreads) {
    openHelpByUser.set(thread.menteeId, (openHelpByUser.get(thread.menteeId) ?? 0) + 1);
  }

  const mentees = course.enrollments.flatMap((enrollment) => {
    // Pathment rows without a Buildment account yet have nothing to evaluate.
    if (!enrollment.userId || !enrollment.user) return [];
    const activity = activityState(enrollment.lastActiveAt, now);
    const openHelpRequests = openHelpByUser.get(enrollment.userId) ?? 0;
    const current = enrollment.chapterProgress[0] ?? null;
    const studySeconds = enrollment.chapterProgress.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
    const stalled = enrollment.chapterProgress.some((item) => {
      const expected = (item.chapter.estimatedMinutes ?? 0) * 60;
      return item.status === "IN_PROGRESS" && expected > 0 && item.timeSpentSeconds > Math.max(7200, expected * 3);
    });

    const attention: Array<{ kind: MenteeAttentionKind; label: string }> = [];
    if (enrollment.pendingReviews > 0) attention.push({ kind: "review", label: `${enrollment.pendingReviews} waiting` });
    if (openHelpRequests > 0) attention.push({ kind: "help", label: helpUiCopy.menteeAttentionLabel(openHelpRequests) });
    if (revisionDue.has(enrollment.id)) attention.push({ kind: "revision", label: "Revision due" });
    if (activity === "inactive" && enrollment.status === "IN_PROGRESS") attention.push({ kind: "inactive", label: "Inactive 7+ days" });
    if (stalled) attention.push({ kind: "stalled", label: "Long-running chapter" });

    return [
      {
        id: enrollment.id,
        userId: enrollment.userId,
        name: enrollment.user.name ?? enrollment.user.email ?? "Unnamed learner",
        email: enrollment.user.email,
        image: enrollment.user.image,
        status: enrollment.status,
        progressState: progressState(enrollment.status, enrollment.percentComplete),
        percentComplete: enrollment.percentComplete,
        chaptersCompleted: enrollment.chaptersCompleted,
        chapterCount: chapterCountFor(enrollment.releaseId, enrollment.variantSlug),
        score: enrollment.totalScore,
        maxScore: enrollment.maxScore,
        pendingReviews: enrollment.pendingReviews,
        openHelpRequests,
        currentChapter: current?.chapter.title ?? null,
        studySeconds,
        lastActiveAt: enrollment.lastActiveAt?.toISOString() ?? null,
        lastActiveLabel: formatLastActive(enrollment.lastActiveAt, now),
        activityState: activity,
        attention,
        evaluationHref: `/courses/${course.slug}/mentees/${enrollment.id}`,
        track: summarizeLearnerTrack(resolveCourseFamily(course.familySlug, course.variantFamily), enrollment),
      },
    ];
  });

  const linkInvite = course.invites.find((invite) => invite.email === null) ?? null;

  return {
    course: { id: course.id, slug: course.slug, title: course.title, status: course.status, chapterCount: chapterCountFor(null, null) },
    linkInvite: linkInvite ? { id: linkInvite.id, token: linkInvite.token, url: inviteAcceptUrl(linkInvite.token) } : null,
    pendingEmailInvites: course.invites.flatMap((invite) =>
      invite.email ? [{ id: invite.id, email: invite.email, createdAt: invite.createdAt.toISOString() }] : []
    ),
    mentees,
    attentionMentees: mentees.filter((mentee) => mentee.attention.length > 0),
    summary: {
      total: mentees.length,
      active: mentees.filter((mentee) => mentee.activityState === "recent").length,
      averageCompletion: average(mentees.map((mentee) => mentee.percentComplete)),
      completed: mentees.filter((mentee) => mentee.progressState === "completed").length,
      pendingReviews: mentees.reduce((sum, mentee) => sum + mentee.pendingReviews, 0),
      openHelpRequests: mentees.reduce((sum, mentee) => sum + mentee.openHelpRequests, 0),
      inactive: mentees.filter((mentee) => mentee.activityState === "inactive" && mentee.status === "IN_PROGRESS").length,
    },
  };
}

/** One learner's full evaluation page; 404 unless the enrollment belongs to this course. */
export async function loadMenteeEvaluationForCourse(user: SessionUser, courseSlug: string, enrollmentId: string): Promise<MenteeEvaluation> {
  const course = await requireCourseBySlug(user, courseSlug);
  const evaluation = await loadMenteeEvaluation({ course: { id: course.id, slug: course.slug, title: course.title }, enrollmentId });
  if (!evaluation) throw new NotFoundError("Enrollment not found");
  return evaluation;
}
