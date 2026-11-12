import type { LearnerProfile } from "@/shared/api/learner";
import type { AdminMfaStatus } from "@/shared/api/admin";
import type { NotificationPreferences } from "@/shared/api/notifications";
import type { AiCredentialStatus } from "@/shared/api/ai";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PasswordForm } from "@/components/auth/password-form";
import { ProfileSettingsTabs } from "@/components/auth/profile-settings-tabs";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { MfaSettingsCard } from "@/components/admin/admin-mfa-card";
import { AiKeySettings } from "@/components/learner/ai-key-settings";

export default async function InstructorProfilePage() {
  await requireTeachSurface();
  const [profile, notifications, mfa, aiStatus] = await Promise.all([
    serverApiFetch<LearnerProfile>("/api/v1/learner/profile"),
    serverApiFetch<NotificationPreferences>("/api/v1/notifications/preferences"),
    serverApiFetch<AdminMfaStatus>("/api/v1/auth/mfa"),
    serverApiFetch<AiCredentialStatus>("/api/v1/learner/ai-credential"),
  ]);
  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profile settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your profile, alerts, and password. Your details are shared across Learn and Teach.
        </p>
      </header>
      <ProfileSettingsTabs
        tabs={[
          {
            id: "profile",
            label: "Profile",
            content: (
              <ProfileForm
                email={profile.email}
                initial={{ name: profile.name ?? "", timezone: profile.timezone, skills: profile.skills.join(", ") }}
              />
            ),
          },
          {
            id: "notifications",
            label: "Notifications",
            content: (
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Notification settings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose where each kind of update reaches you — questions, reviews, and course activity.
                </p>
                <NotificationPreferencesForm initial={notifications} showAdmin={false} />
              </div>
            ),
          },
          {
            id: "ai",
            label: "AI drafting",
            content: (
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">AI drafting key</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drafts for mentor reviews use your own OpenRouter key, so the cost stays with your account.
                </p>
                <div className="mt-4">
                  <AiKeySettings initial={aiStatus} />
                </div>
              </div>
            ),
          },
          {
            id: "security",
            label: "Security",
            content: (
              <div className="space-y-4">
                <MfaSettingsCard mode="account" enabled={mfa.enabled} recoveryCodesRemaining={mfa.recoveryCodesRemaining} />
                <PasswordForm />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
