import type { MentorHelpInboxView } from "../../shared/api/teach.js";
import { prisma } from "../../db/prisma.js";
import type { SessionUser } from "../../types/auth.js";
import type { HelpInboxQuery } from "../../validations/teach.js";
import { mentoredCoursesWhere } from "./access.js";

// The mentor's question inbox across every course they teach. Thread detail,
// replies and resolution reuse the shared /api/v1/help endpoints.

export async function countOpenHelpRequests(user: SessionUser): Promise<number> {
  return prisma.helpThread.count({ where: { status: "OPEN", course: mentoredCoursesWhere(user) } });
}

export async function loadMentorHelpInbox(user: SessionUser, query: HelpInboxQuery): Promise<MentorHelpInboxView> {
  const [courses, openCount] = await Promise.all([
    prisma.course.findMany({ where: mentoredCoursesWhere(user), orderBy: { title: "asc" }, select: { id: true, title: true } }),
    countOpenHelpRequests(user),
  ]);
  const courseIds = courses.map((course) => course.id);
  const status = query.status ?? "open";

  const kind = query.kind ?? "all";
  const threads =
    courseIds.length === 0
      ? []
      : await prisma.helpThread.findMany({
          where: {
            courseId: query.courseId && courseIds.includes(query.courseId) ? query.courseId : { in: courseIds },
            ...(status === "resolved" ? { status: "RESOLVED" } : status === "all" ? {} : { status: "OPEN" }),
            ...(kind === "reports" ? { kind: "LESSON_REPORT" } : kind === "questions" ? { kind: "QUESTION" } : {}),
          },
          // Open questions oldest first so nobody waits unnoticed; resolved ones newest first.
          orderBy: { updatedAt: status === "resolved" ? "desc" : "asc" },
          include: {
            mentee: { select: { name: true, email: true } },
            course: { select: { title: true } },
            chapter: { select: { title: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
          },
        });

  const now = Date.now();
  return {
    courses,
    openCount,
    threads: threads.map((thread) => {
      const preview = thread.messages[0] ?? null;
      return {
        id: thread.id,
        status: thread.status,
        kind: thread.kind,
        category: thread.category,
        quote: thread.quote,
        menteeLabel: thread.mentee.name ?? thread.mentee.email,
        courseTitle: thread.course.title,
        chapterTitle: thread.chapter?.title ?? null,
        preview: preview ? { body: preview.body, createdAt: preview.createdAt.toISOString() } : null,
        ageHours: preview ? (now - preview.createdAt.getTime()) / (1000 * 60 * 60) : 0,
      };
    }),
  };
}
