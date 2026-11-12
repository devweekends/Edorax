import type {
  EnrollStatus,
  EnrollmentLifecycle,
  HelpThreadStatus,
  ProgressStatus,
  ResponseStatus,
  StudySessionStatus,
} from "../../generated/prisma/index.js";
import { cleanChapterSlug } from "../chapters/chapter-slug.js";
import { decorateSyllabus } from "../progress/syllabus.js";
import { pickContinueTarget } from "../progress/enrollment-syllabus.js";
import { isCompletableBlock } from "../progress/rules.js";
import { mentorReplyUnread } from "../progress/attention.js";

function chapterPath(courseSlug: string, chapterSlug: string): string {
  return `/courses/${courseSlug}/${cleanChapterSlug(chapterSlug)}`;
}
import type { LearnerHabit } from "../../shared/lib/streak.js";
import type { GamificationSummary } from "../../shared/api/gamification.js";
import type {
  DashboardAction,
  DashboardCourse,
  DashboardDay,
  DashboardEvent,
  MenteeDashboardViewModel,
} from "../../shared/api/learner.js";
import { helpUiCopy as copy } from "../../shared/lib/help-ui-copy.js";

export type DashboardChapterInput = {
  id: string;
  slug: string;
  title: string;
  order: number;
  blocks: Array<{ type: Parameters<typeof isCompletableBlock>[0]["type"]; required: boolean; archivedAt: Date | null }>;
};

export type DashboardEnrollmentInput = {
  id: string;
  lifecycle: EnrollmentLifecycle;
  status: EnrollStatus;
  percentComplete: number;
  chaptersCompleted: number;
  totalScore: number;
  maxScore: number;
  pendingReviews: number;
  xpTotal?: number;
  lastActiveAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  course: {
    id: string;
    slug: string;
    title: string;
    coverUrl: string | null;
    sequential: boolean;
    modules: Array<{
      id: string;
      order: number;
      title: string;
      chapters: DashboardChapterInput[];
    }>;
  };
  chapterProgress: Array<{
    chapterId: string;
    status: ProgressStatus;
    blocksCompleted: number;
    blocksTotal: number;
    timeSpentSeconds: number;
    startedAt: Date | null;
    completedAt: Date | null;
  }>;
};

export type DashboardResponseInput = {
  id: string;
  blockId: string;
  enrollmentId: string;
  attempt: number;
  status: ResponseStatus;
  submittedAt: Date;
  review: { feedback: string; verdict: "APPROVED" | "NEEDS_REVISION"; createdAt: Date; seenAt?: Date | null } | null;
  block: { chapter: { id: string; slug: string; title: string; course: { slug: string; title: string } } };
};

export type DashboardHelpInput = {
  id: string;
  status: HelpThreadStatus;
  createdAt: Date;
  updatedAt: Date;
  course: { slug: string; title: string };
  chapter: { slug: string; title: string } | null;
  menteeLastReadAt?: Date | null;
  messages: Array<{ authorId: string; createdAt: Date }>;
};

export type DashboardSessionInput = {
  id: string;
  enrollmentId: string;
  status: StudySessionStatus;
  startedAt: Date;
  endedAt: Date | null;
  activeSeconds: number;
  updatedAt: Date;
  chapter: { slug: string; title: string };
  enrollment: { course: { slug: string; title: string } };
};

export type {
  DashboardAction,
  DashboardCourse,
  DashboardDay,
  DashboardEvent,
  MenteeDashboardViewModel,
} from "../../shared/api/learner.js";

/** What a caller that loads no gamification gets: every feature off. */
export const GAMIFICATION_OFF: GamificationSummary = {
  features: { xp: false, streakFreezes: false, levels: false, career: false, credits: false, leaderboards: false },
  hidden: false,
  leaderboardOptIn: false,
  xp: null,
  level: null,
  career: null,
  credits: null,
  freezes: null,
  topThree: null,
};

/** "Stage 2 of 5": the module that holds the next chapter, among modules that have chapters. */
export function moduleStage(
  modules: Array<{ title: string; chapters: Array<{ id: string }> }>,
  targetChapterId: string | null
): DashboardCourse["stage"] {
  const stages = modules.filter((module) => module.chapters.length > 0);
  if (stages.length === 0) return null;
  const index = targetChapterId ? stages.findIndex((module) => module.chapters.some((chapter) => chapter.id === targetChapterId)) : -1;
  const current = index >= 0 ? index : stages.length - 1;
  return { current: current + 1, total: stages.length, title: stages[current]!.title };
}

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function latestResponses(responses: DashboardResponseInput[]) {
  const byBlock = new Map<string, DashboardResponseInput>();
  for (const response of [...responses].sort((a, b) => b.attempt - a.attempt || b.submittedAt.getTime() - a.submittedAt.getTime())) {
    if (!byBlock.has(response.blockId)) byBlock.set(response.blockId, response);
  }
  return [...byBlock.values()];
}

export function buildMenteeDashboardViewModel(args: {
  learnerId?: string;
  learnerName: string;
  enrollments: DashboardEnrollmentInput[];
  responses: DashboardResponseInput[];
  helpThreads: DashboardHelpInput[];
  sessions: DashboardSessionInput[];
  week: DashboardDay[];
  todayKey: string;
  openHelpCount?: number;
  bypassLocking?: boolean;
  habit?: LearnerHabit;
  gamification?: GamificationSummary;
}): MenteeDashboardViewModel {
  const gamification = args.gamification ?? GAMIFICATION_OFF;
  const showXp = gamification.features.xp && !gamification.hidden;
  const latest = latestResponses(args.responses);
  const latestByEnrollment = new Map<string, DashboardResponseInput[]>();
  for (const response of latest) {
    const list = latestByEnrollment.get(response.enrollmentId) ?? [];
    list.push(response);
    latestByEnrollment.set(response.enrollmentId, list);
  }

  const courses: DashboardCourse[] = args.enrollments.map((enrollment) => {
    const progressByChapter = new Map(enrollment.chapterProgress.map((row) => [row.chapterId, row.status]));
    const countsByChapter = new Map(enrollment.chapterProgress.map((row) => [row.chapterId, row]));
    const modules = decorateSyllabus({
      sequential: enrollment.course.sequential,
      bypassLocking: args.bypassLocking,
      progressByChapter,
      modules: enrollment.course.modules.map((module) => ({
        ...module,
        chapters: module.chapters.map((chapter) => ({
          ...chapter,
          blockCount: chapter.blocks.filter(isCompletableBlock).length,
          blocksCompleted: countsByChapter.get(chapter.id)?.blocksCompleted ?? 0,
        })),
      })),
    });
    const flat = modules.flatMap((module) => module.chapters);
    const target = pickContinueTarget(flat);
    const targetModule = target ? modules.find((module) => module.chapters.some((chapter) => chapter.id === target.id)) : null;
    const enrollmentResponses = latestByEnrollment.get(enrollment.id) ?? [];
    const revision = enrollmentResponses.find((response) => response.status === "NEEDS_REVISION");
    const totalStudySeconds = enrollment.chapterProgress.reduce((sum, row) => sum + row.timeSpentSeconds, 0);
    const chaptersTotal = flat.length;
    const overviewHref = `/courses/${enrollment.course.slug}`;
    const chapterHref = target ? `${overviewHref}/${cleanChapterSlug(target.slug)}` : overviewHref;
    let state: DashboardCourse["state"];
    let actionLabel: string;
    let actionReason: string;
    let href = chapterHref;
    let priority: number;

    if (enrollment.status === "DROPPED") {
      state = "DROPPED";
      actionLabel = "View course overview";
      actionReason = "This enrollment is no longer active.";
      href = overviewHref;
      priority = 90;
    } else if (enrollment.lifecycle === "PAYMENT_REQUIRED") {
      state = "PAYMENT_REQUIRED";
      actionLabel = "Complete payment";
      actionReason = "Checkout is required before you can open chapters.";
      href = `/courses/${enrollment.course.slug}/checkout`;
      priority = 1;
    } else if (revision) {
      state = "NEEDS_REVISION";
      actionLabel = `Revise ${revision.block.chapter.title}`;
      actionReason = "Your mentor requested a new attempt on your latest submission.";
      href = chapterPath(revision.block.chapter.course.slug, revision.block.chapter.slug);
      priority = 0;
    } else if (enrollment.percentComplete >= 100 || enrollment.status === "COMPLETED") {
      state = "COMPLETED";
      actionLabel = "Review completed course";
      actionReason = "The course is complete and available to revisit.";
      priority = 50;
    } else if (enrollment.percentComplete === 0 && !enrollment.startedAt) {
      state = "NOT_STARTED";
      actionLabel = target ? `Start ${target.title}` : "Open course";
      actionReason = target ? "Begin with the first available chapter." : "This course has no published chapters yet.";
      priority = 30;
    } else if (enrollment.pendingReviews > 0) {
      state = "AWAITING_REVIEW";
      actionLabel = target?.status === "IN_PROGRESS" ? `Continue ${target.title}` : "Continue learning";
      actionReason = "A submission is awaiting mentor review; you can continue with available work.";
      priority = 20;
    } else {
      state = "IN_PROGRESS";
      actionLabel = target?.status === "IN_PROGRESS" ? `Continue ${target.title}` : target ? `Start ${target.title}` : "Open course";
      actionReason = target?.status === "IN_PROGRESS" ? "Pick up the chapter already in progress." : "Continue with the next available chapter.";
      priority = 10;
    }

    return {
      id: enrollment.id,
      courseId: enrollment.course.id,
      slug: enrollment.course.slug,
      title: enrollment.course.title,
      coverUrl: enrollment.course.coverUrl,
      enrollmentStatus: enrollment.status,
      state,
      percentComplete: enrollment.percentComplete,
      chaptersCompleted: enrollment.chaptersCompleted,
      chaptersTotal,
      pendingReviews: enrollment.pendingReviews,
      totalScore: enrollment.totalScore,
      maxScore: enrollment.maxScore,
      totalStudySeconds,
      lastActiveAt: iso(enrollment.lastActiveAt),
      currentModule: targetModule?.title ?? null,
      xp: showXp ? (enrollment.xpTotal ?? 0) : null,
      stage: gamification.features.levels ? moduleStage(modules, target?.id ?? null) : null,
      targetChapter: target
        ? { title: target.title, slug: target.slug, status: target.status, blocksCompleted: target.blocksCompleted ?? 0, blocksTotal: target.blockCount }
        : null,
      href,
      overviewHref,
      actionLabel,
      actionReason,
      priority,
    };
  });

  const running = args.sessions.find((session) => session.status === "RUNNING");
  const primaryCourse = [...courses]
    .filter((course) => course.state !== "DROPPED")
    .sort((a, b) => {
      if (a.priority === 0 || b.priority === 0) return a.priority - b.priority;
      if (running) {
        if (a.id === running.enrollmentId && b.id !== running.enrollmentId) return -1;
        if (b.id === running.enrollmentId && a.id !== running.enrollmentId) return 1;
      }
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aDate = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
      const bDate = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
      return bDate - aDate || a.title.localeCompare(b.title);
    })[0] ?? null;

  const actions: DashboardAction[] = [];
  for (const response of latest) {
    const chapterHref = chapterPath(response.block.chapter.course.slug, response.block.chapter.slug);
    if (response.status === "NEEDS_REVISION") {
      actions.push({ id: `revision-${response.id}`, kind: "REVISION", title: "Revise submission", context: `${response.block.chapter.course.title} · ${response.block.chapter.title}`, reason: response.review?.feedback ?? "Your mentor requested a new attempt.", statusLabel: "Needs revision", href: chapterHref, occurredAt: iso(response.review?.createdAt ?? response.submittedAt) });
    } else if (response.review && !response.review.seenAt) {
      actions.push({ id: `feedback-${response.id}`, kind: "FEEDBACK", title: "Read mentor feedback", context: `${response.block.chapter.course.title} · ${response.block.chapter.title}`, reason: response.review.feedback, statusLabel: "Unread", href: chapterHref, occurredAt: iso(response.review.createdAt), unread: true });
    } else if (response.status === "PENDING_REVIEW") {
      actions.push({ id: `pending-${response.id}`, kind: "PENDING_REVIEW", title: "Awaiting mentor review", context: `${response.block.chapter.course.title} · ${response.block.chapter.title}`, reason: "Your submission is queued for review. No resubmission is needed right now.", statusLabel: "Waiting", href: chapterHref, occurredAt: iso(response.submittedAt) });
    }
  }
  for (const thread of args.helpThreads) {
    const unread = args.learnerId
      ? mentorReplyUnread({
          menteeId: args.learnerId,
          menteeLastReadAt: thread.menteeLastReadAt ?? null,
          latestMessage: thread.messages[0] ?? null,
        })
      : false;
    if (thread.status !== "OPEN" && !unread) continue;
    actions.push({
      id: `help-${thread.id}`,
      kind: "HELP",
      title: unread ? copy.dashboardTitleUnread : copy.dashboardTitleOpen,
      context: `${thread.course.title}${thread.chapter ? ` · ${thread.chapter.title}` : ""}`,
      reason: unread ? copy.dashboardReasonUnread : copy.dashboardReasonOpen,
      statusLabel: unread ? "Unread" : "Open",
      href: `/my-questions/${thread.id}`,
      occurredAt: iso(thread.messages[0]?.createdAt ?? thread.updatedAt),
      unread,
    });
  }
  for (const course of courses) {
    if (course.id === primaryCourse?.id) continue;
    if (course.state === "NOT_STARTED") actions.push({ id: `start-${course.id}`, kind: "START", title: "Start assigned course", context: course.title, reason: course.actionReason, statusLabel: "Not started", href: course.href, occurredAt: course.lastActiveAt });
    else if (course.state === "IN_PROGRESS") actions.push({ id: `continue-${course.id}`, kind: "CONTINUE", title: "Continue active work", context: course.title, reason: course.actionReason, statusLabel: "In progress", href: course.href, occurredAt: course.lastActiveAt });
    else if (course.state === "COMPLETED") actions.push({ id: `review-${course.id}`, kind: "REVIEW", title: "Review completed material", context: course.title, reason: course.actionReason, statusLabel: "Completed", href: course.href, occurredAt: course.lastActiveAt });
  }
  const actionPriority: Record<DashboardAction["kind"], number> = { REVISION: 0, CONTINUE: 1, HELP: 2, START: 3, FEEDBACK: 4, PENDING_REVIEW: 5, REVIEW: 6 };
  actions.sort((a, b) => actionPriority[a.kind] - actionPriority[b.kind] || (Date.parse(b.occurredAt ?? "") || 0) - (Date.parse(a.occurredAt ?? "") || 0));

  const totalSeconds = courses.reduce((sum, course) => sum + course.totalStudySeconds, 0);
  const openHelp = args.helpThreads.filter((thread) => thread.status === "OPEN");
  const openHelpCount = args.openHelpCount ?? openHelp.length;
  const latestFeedback = actions.find((action) => action.kind === "REVISION" || action.kind === "FEEDBACK") ?? null;
  const latestHelp = args.helpThreads[0];
  const latestProgress = args.enrollments
    .flatMap((enrollment) => enrollment.chapterProgress.map((progress) => ({ enrollment, progress })))
    .filter(({ progress }) => progress.startedAt)
    .sort((a, b) => (b.progress.startedAt?.getTime() ?? 0) - (a.progress.startedAt?.getTime() ?? 0))[0];
  const latestProgressChapter = latestProgress
    ? latestProgress.enrollment.course.modules.flatMap((module) => module.chapters).find((chapter) => chapter.id === latestProgress.progress.chapterId)
    : null;

  const events: DashboardEvent[] = [];
  for (const response of args.responses.slice(0, 12)) {
    const href = chapterPath(response.block.chapter.course.slug, response.block.chapter.slug);
    events.push({ id: `response-${response.id}`, type: "SUBMISSION", title: "Submission sent", context: `${response.block.chapter.course.title} · ${response.block.chapter.title}`, occurredAt: response.submittedAt.toISOString(), href });
    if (response.review) events.push({ id: `review-${response.id}`, type: response.review.verdict === "NEEDS_REVISION" ? "REVISION" : "REVIEW", title: response.review.verdict === "NEEDS_REVISION" ? "Revision requested" : "Mentor review received", context: `${response.block.chapter.course.title} · ${response.block.chapter.title}`, occurredAt: response.review.createdAt.toISOString(), href });
  }
  for (const thread of args.helpThreads.slice(0, 6)) {
    events.push({ id: `help-${thread.id}-${thread.status}`, type: thread.status === "RESOLVED" ? "HELP_RESOLVED" : "HELP_CREATED", title: thread.status === "RESOLVED" ? copy.eventQuestionResolved : copy.eventQuestionCreated, context: `${thread.course.title}${thread.chapter ? ` · ${thread.chapter.title}` : ""}`, occurredAt: (thread.status === "RESOLVED" ? thread.updatedAt : thread.createdAt).toISOString(), href: `/my-questions/${thread.id}` });
  }
  for (const enrollment of args.enrollments) {
    const chapters = enrollment.course.modules.flatMap((module) => module.chapters);
    for (const progress of enrollment.chapterProgress) {
      const chapter = chapters.find((item) => item.id === progress.chapterId);
      if (!chapter) continue;
      const href = chapterPath(enrollment.course.slug, chapter.slug);
      if (progress.completedAt) events.push({ id: `chapter-complete-${progress.chapterId}`, type: "CHAPTER_COMPLETED", title: "Chapter completed", context: `${enrollment.course.title} · ${chapter.title}`, occurredAt: progress.completedAt.toISOString(), href });
      else if (progress.startedAt) events.push({ id: `chapter-start-${progress.chapterId}`, type: "CHAPTER_STARTED", title: "Chapter started", context: `${enrollment.course.title} · ${chapter.title}`, occurredAt: progress.startedAt.toISOString(), href });
    }
  }
  for (const session of args.sessions.filter((item) => item.status === "ENDED").slice(0, 4)) {
    events.push({ id: `session-${session.id}`, type: "STUDY_SESSION", title: "Study session completed", context: `${session.enrollment.course.title} · ${session.chapter.title}`, occurredAt: (session.endedAt ?? session.updatedAt).toISOString(), href: chapterPath(session.enrollment.course.slug, session.chapter.slug) });
  }
  events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    learner: { name: args.learnerName },
    primaryCourse,
    actions: actions.slice(0, 6),
    courses,
    overview: {
      assignedCourses: courses.filter((course) => course.state !== "DROPPED").length,
      inProgressCourses: courses.filter((course) => ["IN_PROGRESS", "NEEDS_REVISION", "AWAITING_REVIEW"].includes(course.state)).length,
      completedCourses: courses.filter((course) => course.state === "COMPLETED").length,
      chaptersCompleted: courses.reduce((sum, course) => sum + course.chaptersCompleted, 0),
      chaptersTotal: courses.reduce((sum, course) => sum + course.chaptersTotal, 0),
      todaySeconds: args.week.find((day) => day.day === args.todayKey)?.seconds ?? 0,
      weekSeconds: args.week.reduce((sum, day) => sum + day.seconds, 0),
      totalSeconds,
      pendingReviews: courses.reduce((sum, course) => sum + course.pendingReviews, 0),
      openHelpRequests: openHelpCount,
    },
    activity: {
      week: args.week,
      activeDays: args.week.filter((day) => day.seconds > 0).length,
      maxDaySeconds: Math.max(1, ...args.week.map((day) => day.seconds)),
      lastActiveAt: courses.map((course) => course.lastActiveAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
      recentChapter: latestProgress && latestProgressChapter ? { title: latestProgressChapter.title, courseTitle: latestProgress.enrollment.course.title, href: chapterPath(latestProgress.enrollment.course.slug, latestProgressChapter.slug) } : null,
      runningSession: running ? { chapterTitle: running.chapter.title, courseTitle: running.enrollment.course.title, href: chapterPath(running.enrollment.course.slug, running.chapter.slug), startedAt: running.startedAt.toISOString() } : null,
    },
    latestFeedback,
    help: {
      openCount: openHelpCount,
      latest: latestHelp ? { title: latestHelp.chapter?.title ?? latestHelp.course.title, courseTitle: latestHelp.course.title, status: latestHelp.status, href: `/my-questions/${latestHelp.id}`, updatedAt: latestHelp.updatedAt.toISOString() } : null,
    },
    recentEvents: events.slice(0, 10),
    habit: args.habit ?? {
      streakCount: 0,
      graceUsed: false,
      streakMilestone: null,
      weeklyGoal: null,
      goal: null,
    },
    gamification,
  };
}
