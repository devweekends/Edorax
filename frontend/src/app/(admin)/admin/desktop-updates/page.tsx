import { serverApiFetch } from "@/lib/api-server";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { DesktopUpdatesPanel } from "@/components/admin/desktop-updates-panel";
import { forceDesktopUpdateToLatest, saveDesktopUpdateRules } from "@/server/actions/admin/desktop-updates";
import type { DesktopUpdatesView } from "@/shared/api/desktop-updates";

// The admin layout already requires the ADMIN role for everything under /admin.
export default async function AdminDesktopUpdatesPage() {
  const { policies } = await serverApiFetch<DesktopUpdatesView>("/api/v1/admin/desktop-updates");

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Operations"
        title="Desktop updates"
        description="Each platform has a latest version and a minimum version. An app below the minimum is stopped until the user installs the new version. An app below the latest only sees a small note. Apps older than 0.1.0 cannot be stopped."
      />
      <DesktopUpdatesPanel policies={policies} saveRules={saveDesktopUpdateRules} forceToLatest={forceDesktopUpdateToLatest} />
    </div>
  );
}
