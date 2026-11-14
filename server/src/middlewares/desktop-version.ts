import type { RequestHandler } from "express";
import { getDesktopPolicy, parseDesktopPlatform } from "../services/desktop-update-policy.js";
import { compareParsed, parseSemver } from "../utils/semver.js";

export const DESKTOP_VERSION_HEADER = "x-edorax-desktop-version";
export const DESKTOP_PLATFORM_HEADER = "x-edorax-desktop-platform";
export const DESKTOP_UPDATE_REQUIRED_CODE = "DESKTOP_UPDATE_REQUIRED";
const DEFAULT_UPDATE_MESSAGE = "This version of Edorax is out of date. Download the new version to continue.";

/** The version route is mounted at /desktop/version on the v1 router; it must always answer. */
const isVersionRoute = (method: string, path: string) =>
  (method === "GET" || method === "HEAD") && /^\/desktop\/version\/?$/.test(path);

/**
 * Forces old desktop apps to update. The app sends X-Edorax-Desktop-Version and
 * X-Edorax-Desktop-Platform (darwin, win32, linux) on every request. The answer is 426
 * DESKTOP_UPDATE_REQUIRED when the version is valid semver and is lower than the platform's minimum
 * version, or is exactly one of its blocked versions. A missing or unknown platform uses the default
 * policy. Requests without the version header (web app, older apps) or with an invalid value pass
 * untouched. The policy is cached in memory (see services/desktop-update-policy) and a database
 * failure never blocks a request.
 */
export const enforceDesktopMinVersion: RequestHandler = async (req, res, next) => {
  const raw = req.get(DESKTOP_VERSION_HEADER);
  if (raw === undefined) return next();

  const current = parseSemver(raw);
  if (!current) return next();
  if (isVersionRoute(req.method, req.path)) return next();

  const policy = await getDesktopPolicy(parseDesktopPlatform(req.get(DESKTOP_PLATFORM_HEADER)));

  const minimum = parseSemver(policy.minimumVersion);
  // 0.0.0 is the "nothing is blocked" default.
  const hasMinimum = !!minimum && !(minimum.major === 0n && minimum.minor === 0n && minimum.patch === 0n && minimum.prerelease.length === 0);
  const belowMinimum = hasMinimum && compareParsed(current, minimum) < 0;
  const isBlocked = policy.blockedVersions.some((blocked) => {
    const parsed = parseSemver(blocked);
    return parsed !== null && compareParsed(current, parsed) === 0;
  });
  if (!belowMinimum && !isBlocked) return next();

  res.status(426).json({
    success: false,
    code: DESKTOP_UPDATE_REQUIRED_CODE,
    message: policy.message || DEFAULT_UPDATE_MESSAGE,
    data: {
      minimumVersion: policy.minimumVersion,
      latestVersion: policy.latestVersion,
      downloadUrl: policy.downloadUrl,
      blockedVersions: policy.blockedVersions,
    },
  });
};
