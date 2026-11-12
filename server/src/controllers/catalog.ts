import type { Request, Response } from "express";
import { ok } from "../utils/responses.js";
import { getCatalogCourse, listCatalog } from "../services/catalog/catalog.js";
import { listCourseReviews } from "../services/courses/ratings.js";

// GET /api/v1/catalog
export async function list(req: Request, res: Response) {
  ok(res, { courses: await listCatalog(req.user?.id) });
}

// GET /api/v1/catalog/:courseSlug
export async function detail(req: Request, res: Response) {
  ok(res, {
    ...await getCatalogCourse(req.params.courseSlug as string, req.user?.id),
    signedIn: Boolean(req.user),
  });
}

// GET /api/v1/catalog/:courseSlug/reviews
export async function reviews(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
  ok(res, await listCourseReviews(req.params.courseSlug as string, { page, pageSize }));
}
