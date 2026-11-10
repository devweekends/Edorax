import type { AdminMfaStatus } from "@/shared/api/admin";
import type { NotificationPreferences } from "@/shared/api/notifications";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { AdminProfileForms } from "@/components/admin/admin-profile-forms";
import { AdminMfaCard } from "@/components/admin/admin-mfa-card";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { AdminPageHeader } from "@/components/admin/admin-ui";

export default async function AdminProfilePage() {
  const user = await requireRole("ADMIN");
  const [{ enabled, recoveryCodesRemaining }, notificationPreferences] = await Promise.all([
    serverApiFetch<AdminMfaStatus>("/api/v1/admin/mfa"),
    serverApiFetch<NotificationPreferences>("/api/v1/notifications/preferences"),
  ]);
  return (
    <div className="max-w-3xl space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Account"
        title="Profile settings"
        description="Manage your admin account, alerts, and sign-in details."
      />
      <AdminProfileForms
        name={user.name ?? ""}
        email={user.email}
        security={<AdminMfaCard enabled={enabled} recoveryCodesRemaining={recoveryCodesRemaining} />}
        notifications={<NotificationPreferencesForm initial={notificationPreferences} showAdmin />}
      />
    </div>
  );
}
