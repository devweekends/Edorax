import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../utils/responses.js";
import { loadPublicProfile } from "../../services/profile/public-profile.js";

// Unauthenticated, read-only Career Identity pages. Only curated public fields are returned; a
// learner who has not opted in (profilePublic) yields 404, never a leak.
const router = Router();

router.get("/profiles/:slug", async (req: Request, res: Response) => {
  ok(res, await loadPublicProfile(String(req.params.slug)));
});

export default router;
