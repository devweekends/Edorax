import { serverApiFetch } from "@/lib/api-server";
import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-ui";
import { DesktopUpdatesPanel } from "@/components/admin/desktop-updates-panel";
import { forceDesktopUpdateToLatest, saveDesktopUpdateRules } from "@/server/actions/admin/desktop-updates";
import { formatUpdatedAt, platformLabel } from "@/lib/desktop-updates";
import type { DesktopUpdatesView } from "@/shared/api/desktop-updates";

// The admin layout already requires the ADMIN role for everything under /admin.
export default async function AdminDesktopUpdatesPage() {
  const { policies } = await serverApiFetch<DesktopUpdatesView>("/api/v1/admin/desktop-updates");

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Operations"
        title="Desktop updates"
        description="An app below the minimum version, or on a blocked version, is stopped at a full-screen Update required page until the user installs the new version. Apps between the minimum and the latest version only see a small new version available note, and apps built before version 0.1.0 cannot be forced."
      />

      <section aria-label="Current rules" className="grid gap-4 md:grid-cols-3">
        {policies.map((policy) => (
          <AdminPanel key={policy.platform} className="space-y-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{platformLabel(policy.platform)}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Minimum version</dt>
                <dd className="font-mono">{policy.minimumVersion}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Latest version</dt>
                <dd className="font-mono">{policy.latestVersion}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Blocked versions</dt>
                <dd className="break-words text-right font-mono">
                  {policy.blockedVersions.length > 0 ? policy.blockedVersions.join(", ") : "None"}
                </dd>
              </div>
            </dl>
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              {policy.isDefault || !policy.updatedAt ? (
                "Not set: using defaults"
              ) : (
                <>
                  Changed by {policy.updatedBy ? policy.updatedBy.name || policy.updatedBy.email : "unknown"} on{" "}
                  <time dateTime={policy.updatedAt}>{formatUpdatedAt(policy.updatedAt)}</time>
                </>
              )}
            </p>
          </AdminPanel>
        ))}
      </section>

      <DesktopUpdatesPanel policies={policies} saveRules={saveDesktopUpdateRules} forceToLatest={forceDesktopUpdateToLatest} />
    </div>
  );
}
