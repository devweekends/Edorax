import { Router } from "express";
import type { Request, Response } from "express";
import { getDesktopPolicy, parseDesktopPlatform } from "../../services/desktop-update-policy.js";
import { ok } from "../../utils/responses.js";

// Public (no sign-in): the desktop app reads the version it must run before it signs in. Pass
// ?platform=darwin|win32|linux for that platform's policy; a missing or unknown platform gets the
// default policy (the DESKTOP_* environment variables). Admins edit the per-platform policy.
const router = Router();

router.get("/version", async (req: Request, res: Response) => {
  const policy = await getDesktopPolicy(parseDesktopPlatform(req.query.platform));
  res.set("Cache-Control", "public, max-age=60");
  ok(res, {
    minimumVersion: policy.minimumVersion,
    latestVersion: policy.latestVersion,
    downloadUrl: policy.downloadUrl,
    message: policy.message,
    blockedVersions: policy.blockedVersions,
  });
});

export default router;
