"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction, type AdminActionState } from "./action-result";
import {
  describeForcePlan,
  describeSave,
  isDesktopPlatform,
  isValidVersion,
  joinPlatformLabels,
  planForceToLatest,
  platformLabel,
  buildUpdateRequest,
} from "@/lib/desktop-updates";
import type {
  DesktopPlatform,
  DesktopUpdateRequest,
  DesktopUpdatesView,
} from "@/shared/api/desktop-updates";

const PATH = "/api/v1/admin/desktop-updates";

/** Saves the "Change the update rules" form. The input is checked again here. */
export async function saveDesktopUpdateRules(input: DesktopUpdateRequest): Promise<AdminActionState> {
  return runAdminAction(async () => {
    const platforms = Array.isArray(input?.platforms) ? input.platforms.filter(isDesktopPlatform) : [];
    const fields = input?.fields ?? {};
    // Re-run the same checks the form ran, on the exact values received.
    const checked = buildUpdateRequest({
      platforms,
      values: {
        minimumVersion: fields.minimumVersion ?? "",
        latestVersion: fields.latestVersion ?? "",
        downloadUrl: fields.downloadUrl ?? "",
        message: fields.message ?? "",
        blockedVersions: fields.blockedVersions ?? [],
      },
      clear: {
        message: fields.message === "",
        blockedVersions: Array.isArray(fields.blockedVersions) && fields.blockedVersions.length === 0,
      },
    });
    if (!checked.ok) throw new Error(checked.errors.join(" "));

    await adminCall<DesktopUpdatesView>(PATH, { method: "PUT", json: checked.request });
    revalidatePath("/admin/desktop-updates");
    revalidatePath("/admin/audit");
    return describeSave(checked.request);
  });
}

/**
 * "Force everyone to the latest version". The PUT applies one value to every platform
 * it lists, and the platforms can have different latest versions, so this reads the
 * saved policies, groups the platforms by latest version and sends one PUT per group.
 * `confirmed` is what the admin saw in the dialog; if a latest version changed since
 * then, nothing is sent.
 */
export async function forceDesktopUpdateToLatest(input: {
  confirmed: Partial<Record<DesktopPlatform, string>>;
}): Promise<AdminActionState> {
  return runAdminAction(async () => {
    const platforms = Object.keys(input?.confirmed ?? {}).filter(isDesktopPlatform);
    if (platforms.length === 0) throw new Error("Choose at least one platform.");

    const view = await adminCall<DesktopUpdatesView>(PATH);
    for (const platform of platforms) {
      const saved = view.policies.find((policy) => policy.platform === platform)?.latestVersion;
      const shown = input.confirmed[platform];
      if (!shown || !isValidVersion(shown) || saved !== shown) {
        throw new Error(
          `The latest version for ${platformLabel(platform)} changed to ${saved ?? "an unknown value"} since you opened this page. Reload and try again.`
        );
      }
    }

    const plan = planForceToLatest(platforms, view.policies);
    if (plan.groups.length === 0) {
      throw new Error(plan.skipped.map((item) => `${platformLabel(item.platform)}: ${item.reason}`).join(" ") || "Nothing to change.");
    }

    const done: typeof plan.groups = [];
    for (const group of plan.groups) {
      try {
        await adminCall<DesktopUpdatesView>(PATH, {
          method: "PUT",
          json: { platforms: group.platforms, fields: { minimumVersion: group.version } },
        });
        done.push(group);
      } catch (error) {
        revalidatePath("/admin/desktop-updates");
        const reason = error instanceof Error ? error.message : "Something went wrong.";
        const saved = done.length ? ` Already saved: ${describeForcePlan(done)}.` : "";
        throw new Error(`Could not update ${joinPlatformLabels(group.platforms)}: ${reason}${saved}`);
      }
    }
    revalidatePath("/admin/desktop-updates");
    revalidatePath("/admin/audit");
    const skipped = plan.skipped.length
      ? ` Left unchanged: ${plan.skipped.map((item) => `${platformLabel(item.platform)} (${item.reason})`).join(" ")}`
      : "";
    return `Minimum version set to the latest version: ${describeForcePlan(done)}.${skipped}`;
  });
}
