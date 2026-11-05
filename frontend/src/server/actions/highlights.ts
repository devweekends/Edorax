"use server";

import { ApiError } from "@/lib/api-client";
import { serverApiFetch } from "@/lib/api-server";

export type HighlightColor = "YELLOW" | "GREEN" | "BLUE" | "PINK";

export type HighlightView = {
  id: string;
  color: HighlightColor;
  quote: string;
  prefix: string | null;
  suffix: string | null;
  occurrence: number;
  note: string | null;
};

export type UserHighlightView = HighlightView & {
  chapterId: string;
  chapterTitle: string;
  chapterSlug: string;
  courseSlug: string;
  courseTitle: string;
};

export async function saveHighlight(raw: {
  chapterId: string;
  color?: HighlightColor;
  quote: string;
  prefix?: string | null;
  suffix?: string | null;
  occurrence?: number;
  note?: string | null;
}) {
  try {
    const data = await serverApiFetch<HighlightView>(
      `/api/v1/chapters/${encodeURIComponent(raw.chapterId)}/highlights`,
      { method: "POST", json: raw }
    );
    return { ok: true as const, data };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}

export async function updateHighlight(raw: { highlightId: string; color?: HighlightColor; note?: string | null }) {
  try {
    const data = await serverApiFetch<HighlightView>(
      `/api/v1/learner/highlights/${encodeURIComponent(raw.highlightId)}`,
      { method: "PATCH", json: { color: raw.color, note: raw.note } }
    );
    return { ok: true as const, data };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}

export async function deleteHighlight(raw: { highlightId: string }) {
  try {
    await serverApiFetch(`/api/v1/learner/highlights/${encodeURIComponent(raw.highlightId)}`, { method: "DELETE" });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}
