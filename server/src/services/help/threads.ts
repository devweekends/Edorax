import {
  HELP_ERROR_CODES,
  type HelpMessageView,
  type HelpThreadDetail,
  type HelpThreadSummary,
} from "../../shared/api/help.js";
import { prisma } from "../../db/prisma.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { shouldBypassProgressGating } from "../auth/seed-access.js";
import type { HelpThreadCategory } from "../../generated/prisma/index.js";
import {
  notifyMenteeHelpReply,
  notifyMenteeHelpThreadResolved,
  notifyMentorHelpQuestion,
  notifyMentorLessonReport,
} from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { requireBlockSubmissionAccess } from "../enrollment/api-learn-access.js";
import { mentorReplyUnread } from "../progress/attention.js";
import { isOnline, publish } from "../realtime/hub.js";
import { ChapterLockedError, assertChapterUnlocked } from "../progress/gate.js";
import {
  canAccessHelpThread,
  canReplyToHelpThread,
  canResolveHelpThread,
} from "./access.js";
import { mapHelpMessages } from "./serialize.js";

const messageRelations = {
  author: { select: { id: true, name: true, role: true } },
  replyTo: {
    select: { id: true, body: true, author: { select: { name: true } } },
  },
} as const;
const messageInclude = {
  orderBy: { createdAt: "asc" },
  include: messageRelations,
} as const;

/** Everyone who takes part in a thread: the learner and the course's mentor. */
function participantIds(thread: {
  menteeId: string;
  course: { mentorId: string };
}): string[] {
  return [...new Set([thread.menteeId, thread.course.mentorId])];
}

export async function listMenteeThreads(
  user: SessionUser,
): Promise<HelpThreadSummary[]> {
  const threads = await prisma.helpThread.findMany({
    where: { menteeId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      course: { select: { slug: true, title: true } },
      chapter: { select: { slug: true, title: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, authorId: true },
      },
    },
  });

  const firstMessages = threads.length
    ? await prisma.helpMessage.findMany({
        where: { threadId: { in: threads.map((thread) => thread.id) } },
        orderBy: { createdAt: "asc" },
        distinct: ["threadId"],
        select: { threadId: true, body: true },
      })
    : [];
  const questionsByThread = new Map(
    firstMessages.map((message) => [message.threadId, message.body]),
  );

  return threads.map((thread) => {
    const preview = thread.messages[0] ?? null;
    return {
      id: thread.id,
      status: thread.status,
      kind: thread.kind,
      category: thread.category,
      blockId: thread.blockId,
      quote: thread.quote,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      course: thread.course,
      chapter: thread.chapter,
      question: questionsByThread.get(thread.id) ?? null,
      preview: preview
        ? {
            body: preview.body,
            createdAt: preview.createdAt.toISOString(),
            fromMentor: preview.authorId !== user.id,
          }
        : null,
      unread: mentorReplyUnread({
        menteeId: user.id,
        menteeLastReadAt: thread.menteeLastReadAt,
        latestMessage: preview
          ? { authorId: preview.authorId, createdAt: preview.createdAt }
          : null,
      }),
    };
  });
}

/** Thread with its course for authorization decisions; 404 when missing, 403 when not the mentee or course mentor. */
async function loadAccessibleThread(threadId: string, user: SessionUser) {
  const thread = await prisma.helpThread.findUnique({
    where: { id: threadId },
    include: {
      course: { select: { id: true, slug: true, title: true, mentorId: true } },
      chapter: { select: { id: true, slug: true, title: true } },
      mentee: { select: { id: true, name: true, email: true } },
    },
  });
  if (!thread) throw new NotFoundError("Thread not found");
  if (!canAccessHelpThread(user, thread, thread.course)) {
    throw new ForbiddenError("You cannot access this conversation.");
  }
  return thread;
}

/** Opening a thread as its mentee marks the mentor's replies as read. */
export async function getThread(
  threadId: string,
  user: SessionUser,
): Promise<HelpThreadDetail> {
  const thread = await loadAccessibleThread(threadId, user);
  const messages = await prisma.helpMessage.findMany({
    where: { threadId: thread.id },
    ...messageInclude,
  });

  if (user.id === thread.menteeId) {
    await prisma.helpThread.update({
      where: { id: thread.id },
      data: { menteeLastReadAt: new Date() },
    });
  }

  return {
    id: thread.id,
    status: thread.status,
    courseId: thread.courseId,
    chapterId: thread.chapterId,
    menteeId: thread.menteeId,
    mentee: thread.mentee,
    course: { slug: thread.course.slug, title: thread.course.title },
    chapter: thread.chapter
      ? { slug: thread.chapter.slug, title: thread.chapter.title }
      : null,
    kind: thread.kind,
    category: thread.category,
    blockId: thread.blockId,
    quote: thread.quote,
    messages: mapHelpMessages(messages),
  };
}

/** Mentee asks from a chapter — creates a thread or adds to the open one for this chapter. */
export async function askFromChapter(
  user: SessionUser,
  input: { courseId: string; chapterId: string; body: string },
) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: {
      id: true,
      courseId: true,
      title: true,
      course: { select: { mentorId: true, title: true } },
    },
  });
  if (!chapter || chapter.courseId !== input.courseId)
    throw new NotFoundError("Chapter not found.");

  const enrollment = await requireBlockSubmissionAccess(chapter.courseId, user);

  const existingOpen = await prisma.helpThread.findFirst({
    where: { menteeId: user.id, chapterId: chapter.id, kind: "QUESTION", status: "OPEN" },
    select: { id: true },
  });

  if (!existingOpen) {
    try {
      await assertChapterUnlocked({
        courseId: chapter.courseId,
        enrollmentId: enrollment.id,
        chapterId: chapter.id,
        bypassLocking: shouldBypassProgressGating(user),
      });
    } catch (error) {
      if (error instanceof ChapterLockedError) {
        throw new ForbiddenError(
          "Finish the previous chapter before asking for help here.",
          HELP_ERROR_CODES.CHAPTER_LOCKED,
        );
      }
      throw error;
    }
  }

  const thread =
    existingOpen ??
    (await prisma.helpThread.create({
      data: {
        courseId: chapter.courseId,
        chapterId: chapter.id,
        menteeId: user.id,
      },
      select: { id: true },
    }));

  const message = await appendMessage(
    thread.id,
    user.id,
    input.body,
    undefined,
    [user.id, chapter.course.mentorId],
  );
  await dispatchNotification(() =>
    notifyMentorHelpQuestion({
      threadId: thread.id,
      messageId: message.id,
      body: input.body,
      menteeName: user.name,
    }),
  );

  return { threadId: thread.id, created: !existingOpen };
}

/**
 * A learner reports an error, typo, confusing passage or improvement idea on a
 * lesson. Unlike questions, every report is its own thread: two different
 * mistakes on the same chapter are two tickets the instructor can resolve
 * independently. The optional block/quote points at the exact passage.
 */
export async function createLessonReport(
  user: SessionUser,
  input: {
    courseId: string;
    chapterId: string;
    category: HelpThreadCategory;
    body: string;
    blockId?: string;
    quote?: string;
  },
) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: {
      id: true,
      courseId: true,
      title: true,
      course: { select: { mentorId: true, title: true } },
    },
  });
  if (!chapter || chapter.courseId !== input.courseId) {
    throw new NotFoundError("Chapter not found.");
  }

  const enrollment = await requireBlockSubmissionAccess(chapter.courseId, user);

  try {
    await assertChapterUnlocked({
      courseId: chapter.courseId,
      enrollmentId: enrollment.id,
      chapterId: chapter.id,
      bypassLocking: shouldBypassProgressGating(user),
    });
  } catch (error) {
    if (error instanceof ChapterLockedError) {
      throw new ForbiddenError(
        "Finish the previous chapter before reporting an issue here.",
        HELP_ERROR_CODES.CHAPTER_LOCKED,
      );
    }
    throw error;
  }

  const thread = await prisma.helpThread.create({
    data: {
      courseId: chapter.courseId,
      chapterId: chapter.id,
      menteeId: user.id,
      kind: "LESSON_REPORT",
      category: input.category,
      blockId: input.blockId ?? null,
      quote: input.quote?.trim() || null,
    },
    select: { id: true },
  });

  const message = await appendMessage(
    thread.id,
    user.id,
    input.body,
    undefined,
    [user.id, chapter.course.mentorId],
  );
  await dispatchNotification(() =>
    notifyMentorLessonReport({
      threadId: thread.id,
      messageId: message.id,
      body: input.body,
      category: input.category,
      menteeName: user.name,
    }),
  );

  return { threadId: thread.id, created: true };
}

export async function reply(
  user: SessionUser,
  threadId: string,
  body: string,
  replyToId?: string,
) {
  const thread = await loadAccessibleThread(threadId, user);
  if (
    !canReplyToHelpThread(
      user,
      { menteeId: thread.menteeId, status: thread.status },
      thread.course,
    )
  ) {
    throw new ConflictError(
      "This conversation is closed.",
      HELP_ERROR_CODES.THREAD_CLOSED,
    );
  }

  if (replyToId) {
    const replyTarget = await prisma.helpMessage.findFirst({
      where: { id: replyToId, threadId: thread.id },
      select: { id: true },
    });
    if (!replyTarget) {
      throw new BadRequestError(
        "The message you are replying to is not in this conversation.",
        HELP_ERROR_CODES.REPLY_TARGET_NOT_IN_THREAD,
      );
    }
  }

  const message = await appendMessage(
    thread.id,
    user.id,
    body,
    replyToId,
    participantIds(thread),
  );

  if (user.id === thread.menteeId) {
    await dispatchNotification(() =>
      notifyMentorHelpQuestion({
        threadId: thread.id,
        messageId: message.id,
        body,
        menteeName: user.name,
      }),
    );
  } else {
    await dispatchNotification(() =>
      notifyMenteeHelpReply({
        threadId: thread.id,
        messageId: message.id,
        body,
        mentorName: user.name,
      }),
    );
  }
  return { threadId: thread.id, message };
}

/** Marks incoming messages as seen and sends receipts to their authors. */
export async function markThreadSeen(user: SessionUser, threadId: string) {
  const thread = await loadAccessibleThread(threadId, user);
  const now = new Date();
  const unseen = await prisma.helpMessage.findMany({
    where: { threadId: thread.id, authorId: { not: user.id }, seenAt: null },
    select: { id: true, authorId: true },
  });

  if (unseen.length > 0) {
    await prisma.helpMessage.updateMany({
      where: { id: { in: unseen.map((message) => message.id) }, seenAt: null },
      data: { deliveredAt: now, seenAt: now },
    });
    const messagesByAuthor = new Map<string, string[]>();
    for (const message of unseen) {
      const messageIds = messagesByAuthor.get(message.authorId) ?? [];
      messageIds.push(message.id);
      messagesByAuthor.set(message.authorId, messageIds);
    }
    for (const [authorId, messageIds] of messagesByAuthor) {
      publish(authorId, "help-status", {
        threadId: thread.id,
        messageIds,
        status: "seen",
        at: now.toISOString(),
      });
    }
  }

  if (user.id === thread.menteeId) {
    await prisma.helpThread.update({
      where: { id: thread.id },
      data: { menteeLastReadAt: now },
    });
  }

  return { threadId: thread.id, seenAt: now.toISOString() };
}

export async function resolve(user: SessionUser, threadId: string) {
  const thread = await loadAccessibleThread(threadId, user);
  if (!canResolveHelpThread(user, thread.course)) {
    throw new ForbiddenError("Only the course mentor can resolve this thread.");
  }
  if (thread.status === "RESOLVED")
    return { threadId: thread.id, alreadyResolved: true };

  await prisma.helpThread.update({
    where: { id: thread.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  for (const participantId of participantIds(thread)) {
    publish(participantId, "help-thread", {
      threadId: thread.id,
      status: "RESOLVED",
    });
  }
  await dispatchNotification(() => notifyMenteeHelpThreadResolved(thread.id));
  return { threadId: thread.id, alreadyResolved: false };
}

async function appendMessage(
  threadId: string,
  authorId: string,
  body: string,
  replyToId: string | undefined,
  participants: string[],
): Promise<HelpMessageView> {
  const deliveredAt = new Date();
  const onlineRecipients = participants.filter(
    (participantId) => participantId !== authorId && isOnline(participantId),
  );
  const message = await prisma.helpMessage.create({
    data: {
      threadId,
      authorId,
      body,
      ...(replyToId ? { replyToId } : {}),
      ...(onlineRecipients.length > 0 ? { deliveredAt } : {}),
    },
    include: messageRelations,
  });
  await prisma.helpThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  const messageView = mapHelpMessages([message])[0];
  if (!messageView) throw new Error("Created help message could not be serialized.");

  for (const participantId of participants) {
    if (onlineRecipients.includes(participantId)) {
      publish(participantId, "help-message", { threadId, message: messageView });
    }
  }
  if (onlineRecipients.length > 0) {
    publish(authorId, "help-status", {
      threadId,
      messageIds: [message.id],
      status: "delivered",
      at: deliveredAt.toISOString(),
    });
  }
  return messageView;
}

/** Latest mentor Q&A thread for this mentee + chapter (open or resolved), for the chapter reader. */
export async function loadChapterThread(menteeId: string, chapterId: string) {
  return prisma.helpThread.findFirst({
    where: { menteeId, chapterId, kind: "QUESTION" },
    orderBy: { updatedAt: "desc" },
    include: { messages: messageInclude },
  });
}
