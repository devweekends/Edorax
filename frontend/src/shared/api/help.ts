// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { HelpThreadStatus, Role } from "../domain/enums";

// Wire contract for /api/v1/help. Dates travel as ISO strings.

/** Minimal preview of the message a reply points at — enough to render "replying to …". */
export type HelpMessageReplyPreview = {
  id: string;
  body: string;
  authorName: string;
};

export type HelpMessageView = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  /** Set when this message was sent as a reply to a specific earlier message. */
  replyTo: HelpMessageReplyPreview | null;
  /** When the other side's device received it (grey double tick). Null = only sent. */
  deliveredAt: string | null;
  /** When the other side opened the conversation and saw it (blue double tick). */
  seenAt: string | null;
};

export type HelpThreadKind = "QUESTION" | "LESSON_REPORT";

export type HelpThreadCategory =
  | "ERROR"
  | "TYPO"
  | "CONFUSING"
  | "BROKEN_LINK"
  | "SUGGESTION"
  | "OTHER";

export type HelpThreadView = {
  id: string;
  status: HelpThreadStatus;
  messages: HelpMessageView[];
};

/** One row of the learner's "my questions" list. */
export type HelpThreadSummary = {
  id: string;
  status: HelpThreadStatus;
  kind: HelpThreadKind;
  category: HelpThreadCategory | null;
  blockId: string | null;
  quote: string | null;
  createdAt: string;
  updatedAt: string;
  course: { slug: string; title: string };
  chapter: { slug: string; title: string } | null;
  question: string | null;
  preview: { body: string; createdAt: string; fromMentor: boolean } | null;
  /** The mentor replied after the learner last opened the thread. */
  unread: boolean;
};

export type HelpThreadDetail = HelpThreadView & {
  courseId: string;
  chapterId: string | null;
  menteeId: string;
  mentee: { id: string; name: string | null; email: string };
  course: { slug: string; title: string };
  chapter: { slug: string; title: string } | null;
  kind: HelpThreadKind;
  category: HelpThreadCategory | null;
  blockId: string | null;
  quote: string | null;
};

/** Result of sending a message — carries the saved message so the sender's UI can settle it. */
export type HelpSendResult = { threadId: string; message: HelpMessageView };

export const HELP_ERROR_CODES = {
  THREAD_CLOSED: "THREAD_CLOSED",
  CHAPTER_LOCKED: "CHAPTER_LOCKED",
  REPLY_TARGET_NOT_IN_THREAD: "REPLY_TARGET_NOT_IN_THREAD",
} as const;
