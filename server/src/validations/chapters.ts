import { z } from "zod";
import { id, params } from "./common.js";

export const chapterParams = params("chapterId");

export const quizSubmitBody = z.object({
  answers: z
    .array(z.object({ blockId: id, selected: z.array(z.string()) }))
    .min(1)
    .max(100),
});
export type QuizSubmitBody = z.infer<typeof quizSubmitBody>;

export const checklistItemParams = z.object({ chapterId: id, itemId: z.string().min(1).max(200) });
export const checklistItemBody = z.object({ checked: z.boolean() });

export const learningLogBody = z.object({ answers: z.record(z.string(), z.string()) });

export const headingNoteParams = z.object({ chapterId: id, headingId: z.string().min(1).max(160) });
export const headingNoteBody = z.object({ body: z.string().max(2000) });

export const highlightColor = z.enum(["YELLOW", "GREEN", "BLUE", "PINK"]);
export const highlightParams = z.object({ chapterId: id, highlightId: id });
export const highlightIdParams = z.object({ highlightId: id });
export const highlightCreateBody = z.object({
  color: highlightColor.optional(),
  quote: z.string().min(1).max(500),
  prefix: z.string().max(100).nullable().optional(),
  suffix: z.string().max(100).nullable().optional(),
  occurrence: z.number().int().min(0).max(1000).optional(),
  note: z.string().max(5000).nullable().optional(),
});
export const highlightUpdateBody = z.object({
  color: highlightColor.optional(),
  note: z.string().max(5000).nullable().optional(),
});
export type HighlightCreateBody = z.infer<typeof highlightCreateBody>;
export type HighlightUpdateBody = z.infer<typeof highlightUpdateBody>;

export const askChapterBody = z.object({
  question: z.string().trim().min(3).max(500),
  /** Ask for the answer as a plain text stream instead of one JSON response. */
  stream: z.boolean().optional(),
  /** A follow-up carries the one turn before it; the service cuts both halves to size. */
  previous: z.object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(6000) }).optional(),
});
export type AskChapterBody = z.infer<typeof askChapterBody>;
