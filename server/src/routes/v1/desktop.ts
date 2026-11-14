import { Router } from "express";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { ok } from "../../utils/responses.js";

// Public (no sign-in): the desktop app reads the version it must run before it signs in. Values come
// from the environment (DESKTOP_*), so forcing an update is a config change and a restart.
const router = Router();

router.get("/version", (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=60");
  ok(res, {
    minimumVersion: env.DESKTOP_MIN_VERSION,
    latestVersion: env.DESKTOP_LATEST_VERSION,
    downloadUrl: env.DESKTOP_DOWNLOAD_URL,
    message: env.DESKTOP_UPDATE_MESSAGE ?? "",
  });
});

export default router;
