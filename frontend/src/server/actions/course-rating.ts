"use server";

import { ApiError } from "@/lib/api-client";
import { serverApiFetch } from "@/lib/api-server";

export type CourseRatingView = {
  rating: number;
  review: string | null;
  updatedAt: string;
};

export async function saveCourseRatingAction(raw: {
  courseSlug: string;
  rating: number;
  review?: string | null;
}) {
  try {
    const data = await serverApiFetch<CourseRatingView>(
      `/api/v1/courses/${encodeURIComponent(raw.courseSlug)}/rating`,
      { method: "PUT", json: { rating: raw.rating, review: raw.review } }
    );
    return { ok: true as const, data };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}

/** Remember "Not now" so the full prompt does not come back on the next visit. */
export async function dismissCourseRatingAction(raw: { courseSlug: string }) {
  try {
    await serverApiFetch(`/api/v1/courses/${encodeURIComponent(raw.courseSlug)}/rating/dismiss`, {
      method: "POST",
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.message };
    throw error;
  }
}
