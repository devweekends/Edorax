import type { Request, Response } from "express";
import { ok } from "../utils/responses.js";
import * as shellLabs from "../services/shell-labs.service.js";

// GET /api/v1/shell-labs/version — cheap check the desktop app runs before downloading
export async function version(_req: Request, res: Response) {
  ok(res, await shellLabs.shellLabsSummary());
}

// GET /api/v1/shell-labs — every active lab in order, checks and solutions included
export async function list(_req: Request, res: Response) {
  ok(res, await shellLabs.shellLabsWithVersion());
}

// GET /api/v1/shell-labs/progress — the steps this learner has passed, per lab
export async function progress(req: Request, res: Response) {
  ok(res, { progress: await shellLabs.shellLabProgress(req.user!.id) });
}

// PUT /api/v1/shell-labs/progress/:slug — replace the passed steps of one lab
export async function saveProgress(req: Request, res: Response) {
  const slug = String(req.params.slug);
  const steps = await shellLabs.saveShellLabProgress(req.user!.id, slug, (req.body as { steps?: unknown } | undefined)?.steps);
  ok(res, { slug, steps });
}
