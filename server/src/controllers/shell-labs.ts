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
