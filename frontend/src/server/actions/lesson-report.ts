"use server";

import { ApiError } from "@/lib/api-client";
import { serverApiFetch } from "@/lib/api-server";

export type LessonReportCategory =
  | "ERROR"
  | "TYPO"
  | "CONFUSING"
  | "BROKEN_LINK"
  | "SUGGESTION"
  | "OTHER";

export async function reportLessonIssue(raw: {
  courseId: string;
  chapterId: string;
  category: LessonReportCategory;
  body: string;
  blockId?: string;
  quote?: string;
}) {
  try {
    const data = await serverApiFetch<{ threadId: string; created: boolean }>(
      "/api/v1/help/reports",
      { method: "POST", json: raw }
    );
    return { ok: true as const, data };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}
