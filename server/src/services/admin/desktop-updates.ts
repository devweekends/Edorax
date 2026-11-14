import { prisma } from "../../db/prisma.js";
import { ValidationError } from "../../utils/errors.js";
import { compareSemver } from "../../utils/semver.js";
import {
  DESKTOP_PLATFORMS,
  DESKTOP_PLATFORM_LABELS,
  clearDesktopPolicyCache,
  defaultDesktopPolicy,
  fromDbPlatform,
  toDbPlatform,
  type DesktopPlatform,
  type DesktopPolicy,
} from "../desktop-update-policy.js";
import { ADMIN_AUDIT_ACTIONS, recordAdminAction, type AdminActor } from "./audit.js";

// Forced desktop updates, managed per platform from the admin dashboard. A platform without a saved
// row shows (and uses) the default policy from the DESKTOP_* environment variables.

export type DesktopUpdatePolicyRow = DesktopPolicy & {
  platform: DesktopPlatform;
  updatedAt: string | null;
  updatedBy: { id: string; name: string | null; email: string } | null;
  /** True when no row is saved: the values are the environment defaults. */
  isDefault: boolean;
};

export type DesktopUpdatePolicyView = { policies: DesktopUpdatePolicyRow[] };

/** The fields an admin can change. Each one is applied to every platform in the request. */
export type DesktopUpdateFields = Partial<DesktopPolicy>;

/** Always three entries in the order darwin, win32, linux. */
export async function listDesktopUpdatePolicies(): Promise<DesktopUpdatePolicyView> {
  const rows = await prisma.desktopUpdatePolicy.findMany({
    include: { updatedBy: { select: { id: true, name: true, email: true } } },
  });
  const byPlatform = new Map(rows.map((row) => [fromDbPlatform(row.platform), row]));
  return {
    policies: DESKTOP_PLATFORMS.map((platform): DesktopUpdatePolicyRow => {
      const row = byPlatform.get(platform);
      if (!row) return { platform, ...defaultDesktopPolicy(), updatedAt: null, updatedBy: null, isDefault: true };
      return {
        platform,
        minimumVersion: row.minimumVersion,
        latestVersion: row.latestVersion,
        downloadUrl: row.downloadUrl,
        message: row.message,
        blockedVersions: row.blockedVersions,
        updatedAt: row.updatedAt.toISOString(),
        updatedBy: row.updatedBy,
        isDefault: false,
      };
    }),
  };
}

const POLICY_KEYS = ["minimumVersion", "latestVersion", "downloadUrl", "message", "blockedVersions"] as const;

/**
 * Applies the given fields to each listed platform (creating its row from the defaults first), in one
 * transaction, with one audit entry. After applying, latestVersion must not be lower than
 * minimumVersion for any platform touched. Clears the policy cache so the change is live at once on
 * this instance (other instances pick it up within the cache time).
 */
export async function saveDesktopUpdatePolicies(
  actor: AdminActor,
  platforms: DesktopPlatform[],
  fields: DesktopUpdateFields
): Promise<DesktopUpdatePolicyView> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.desktopUpdatePolicy.findMany({ where: { platform: { in: platforms.map(toDbPlatform) } } });
    const current = new Map(existing.map((row) => [fromDbPlatform(row.platform), row]));
    const changes: Record<string, { from: DesktopPolicy & { isDefault: boolean }; to: DesktopPolicy }> = {};

    for (const platform of platforms) {
      const row = current.get(platform);
      const before: DesktopPolicy = row
        ? {
            minimumVersion: row.minimumVersion,
            latestVersion: row.latestVersion,
            downloadUrl: row.downloadUrl,
            message: row.message,
            blockedVersions: row.blockedVersions,
          }
        : defaultDesktopPolicy();
      const after: DesktopPolicy = { ...before, ...fields };

      if (compareSemver(after.latestVersion, after.minimumVersion) < 0) {
        throw new ValidationError(
          `latestVersion (${after.latestVersion}) must not be lower than minimumVersion (${after.minimumVersion}) for ${DESKTOP_PLATFORM_LABELS[platform]}.`,
          [{ field: "fields.latestVersion", message: `Must be at least minimumVersion (${after.minimumVersion}) for ${DESKTOP_PLATFORM_LABELS[platform]}.` }]
        );
      }

      await tx.desktopUpdatePolicy.upsert({
        where: { platform: toDbPlatform(platform) },
        create: { platform: toDbPlatform(platform), ...after, updatedById: actor.id },
        update: { ...after, updatedById: actor.id },
      });
      changes[platform] = { from: { ...before, isDefault: !row }, to: after };
    }

    const changed = POLICY_KEYS.filter((key) => key in fields);
    await recordAdminAction(tx, {
      actor,
      action: ADMIN_AUDIT_ACTIONS.DESKTOP_UPDATE_POLICY_CHANGED,
      targetType: "DesktopUpdatePolicy",
      targetId: platforms.join(","),
      summary: `Changed desktop update policy for ${platforms.map((p) => DESKTOP_PLATFORM_LABELS[p]).join(", ")}: ${changed.join(", ")}`,
      metadata: { platforms, fields: changed, changes },
    });
  });

  clearDesktopPolicyCache();
  return listDesktopUpdatePolicies();
}
