import { z } from "zod";
import { id } from "./common.js";
import { params } from "./common.js";

export const courseSlugParams = params("courseSlug");

export const chapterPathParams = z.object({ courseSlug: id, chapterSlug: id });

export const chooseVariantBody = z.object({ variantSlug: id });
export const chooseSpecialisationBody = z.object({ specialisationSlug: id });

export const courseRatingBody = z.object({
  /** 1–5 stars. */
  rating: z.number().int().min(1).max(5),
  /** Optional written review, shown publicly on the course page. */
  review: z.string().trim().max(1000).nullable().optional(),
});
export type CourseRatingBody = z.infer<typeof courseRatingBody>;

export const courseReviewsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(5),
});
