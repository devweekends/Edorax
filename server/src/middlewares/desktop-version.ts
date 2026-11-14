import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { compareParsed, parseSemver } from "../utils/semver.js";

export const DESKTOP_VERSION_HEADER = "x-edorax-desktop-version";
export const DESKTOP_UPDATE_REQUIRED_CODE = "DESKTOP_UPDATE_REQUIRED";
const DEFAULT_UPDATE_MESSAGE = "This version of Edorax is out of date. Download the new version to continue.";

/** The version route is mounted at /desktop/version on the v1 router; it must always answer. */
const isVersionRoute = (method: string, path: string) =>
  (method === "GET" || method === "HEAD") && /^\/desktop\/version\/?$/.test(path);

/**
 * Forces old desktop apps to update. The app sends X-Edorax-Desktop-Version on every request; when
 * it is valid semver lower than DESKTOP_MIN_VERSION the answer is 426 DESKTOP_UPDATE_REQUIRED.
 * Requests without the header (web app, older apps) or with an invalid value pass untouched. Values
 * are read from `env` on each request, so the limit is just configuration.
 */
export const enforceDesktopMinVersion: RequestHandler = (req, res, next) => {
  const raw = req.get(DESKTOP_VERSION_HEADER);
  if (raw === undefined) return next();

  const minimum = parseSemver(env.DESKTOP_MIN_VERSION);
  // 0.0.0 is the "nothing is blocked" default.
  if (!minimum || (minimum.major === 0n && minimum.minor === 0n && minimum.patch === 0n && minimum.prerelease.length === 0)) {
    return next();
  }
  if (isVersionRoute(req.method, req.path)) return next();

  const current = parseSemver(raw);
  if (!current || compareParsed(current, minimum) >= 0) return next();

  res.status(426).json({
    success: false,
    code: DESKTOP_UPDATE_REQUIRED_CODE,
    message: env.DESKTOP_UPDATE_MESSAGE ?? DEFAULT_UPDATE_MESSAGE,
    data: { minimumVersion: env.DESKTOP_MIN_VERSION, downloadUrl: env.DESKTOP_DOWNLOAD_URL },
  });
};
