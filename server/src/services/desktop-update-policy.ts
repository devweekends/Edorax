import type { DesktopPlatform as DbPlatform } from "../generated/prisma/index.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../utils/logger.js";

// The forced-update policy of the desktop app, per platform. Rows live in desktop_update_policies
// and are edited by platform admins. A platform without a row uses the default policy, which comes
// from the DESKTOP_* environment variables (read on each call, so they stay plain configuration).

export const DESKTOP_PLATFORMS = ["darwin", "win32", "linux"] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export const DESKTOP_PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

const TO_DB: Record<DesktopPlatform, DbPlatform> = { darwin: "DARWIN", win32: "WIN32", linux: "LINUX" };
const FROM_DB: Record<DbPlatform, DesktopPlatform> = { DARWIN: "darwin", WIN32: "win32", LINUX: "linux" };

export const toDbPlatform = (platform: DesktopPlatform): DbPlatform => TO_DB[platform];
export const fromDbPlatform = (platform: DbPlatform): DesktopPlatform => FROM_DB[platform];

/** Returns the platform for a header or query value, or null when it is missing or unknown. */
export function parseDesktopPlatform(input: unknown): DesktopPlatform | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  return (DESKTOP_PLATFORMS as readonly string[]).includes(value) ? (value as DesktopPlatform) : null;
}

export type DesktopPolicy = {
  minimumVersion: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
  blockedVersions: string[];
};

/** The policy from the environment variables. Used for any platform that has no saved row. */
export function defaultDesktopPolicy(): DesktopPolicy {
  return {
    minimumVersion: env.DESKTOP_MIN_VERSION,
    latestVersion: env.DESKTOP_LATEST_VERSION,
    downloadUrl: env.DESKTOP_DOWNLOAD_URL,
    message: env.DESKTOP_UPDATE_MESSAGE ?? "",
    blockedVersions: [],
  };
}

/** How long saved policies are kept in memory. A change made on another instance shows up within this time. */
export const POLICY_CACHE_TTL_MS = 30_000;
/** After a failed read, wait this long before asking the database again. */
const FAILURE_RETRY_MS = 5_000;

type Rows = Partial<Record<DesktopPlatform, DesktopPolicy>>;

let cache: { rows: Rows; expiresAt: number } | null = null;
let inFlight: Promise<Rows> | null = null;
/** Bumped by clearDesktopPolicyCache so a read that started before a save never stores old rows. */
let generation = 0;

/** Drops the in-memory policies. Called when an admin saves, so the change is live at once on this instance. */
export function clearDesktopPolicyCache(): void {
  generation++;
  cache = null;
  inFlight = null;
}

async function readRows(): Promise<Rows> {
  const found = await prisma.desktopUpdatePolicy.findMany();
  const rows: Rows = {};
  for (const row of found) {
    rows[fromDbPlatform(row.platform)] = {
      minimumVersion: row.minimumVersion,
      latestVersion: row.latestVersion,
      downloadUrl: row.downloadUrl,
      message: row.message,
      blockedVersions: row.blockedVersions,
    };
  }
  return rows;
}

async function loadRows(): Promise<Rows> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.rows;
  if (inFlight) return inFlight;

  const startedIn = generation;
  const stale = cache?.rows;
  const pending = readRows()
    .then((rows) => {
      if (startedIn === generation) cache = { rows, expiresAt: Date.now() + POLICY_CACHE_TTL_MS };
      return rows;
    })
    .catch((err: unknown) => {
      // Never block requests on the database: keep the last known policy, else use the defaults.
      logger.error({ err }, "Could not load the desktop update policy; using the last known or the default policy");
      const rows = stale ?? {};
      if (startedIn === generation) cache = { rows, expiresAt: Date.now() + FAILURE_RETRY_MS };
      return rows;
    })
    .finally(() => {
      if (inFlight === pending) inFlight = null;
    });
  inFlight = pending;
  return pending;
}

/** The policy for a platform, or the default policy when the platform is missing, unknown or has no row. */
export async function getDesktopPolicy(platform: DesktopPlatform | null): Promise<DesktopPolicy> {
  if (!platform) return defaultDesktopPolicy();
  const rows = await loadRows();
  return rows[platform] ?? defaultDesktopPolicy();
}
