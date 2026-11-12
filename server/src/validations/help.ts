import { z } from "zod";
import { id, params } from "./common.js";

const messageBody = z
  .string()
  .trim()
  .min(10, "Please add a bit more detail (at least 10 characters).")
  .max(4000, "Message is too long (max 4000 characters).");

export const threadParams = params("threadId");

export const askFromChapterBody = z.object({
  courseId: id,
  chapterId: id,
  body: messageBody,
});
export type AskFromChapterBody = z.infer<typeof askFromChapterBody>;

export const replyBody = z.object({
  body: messageBody,
  replyToId: id.optional(),
});
export type ReplyBody = z.infer<typeof replyBody>;

export const lessonReportCategory = z.enum([
  "ERROR",
  "TYPO",
  "CONFUSING",
  "BROKEN_LINK",
  "SUGGESTION",
  "OTHER",
]);

export const lessonReportBody = z.object({
  courseId: id,
  chapterId: id,
  category: lessonReportCategory,
  body: messageBody,
  /** The exact block the learner is reporting, when the UI knows it. */
  blockId: id.optional(),
  /** The passage the learner selected, so the instructor can find it. */
  quote: z.string().trim().max(500).optional(),
});
export type LessonReportBody = z.infer<typeof lessonReportBody>;
