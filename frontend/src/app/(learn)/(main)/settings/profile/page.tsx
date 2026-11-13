import type { Metadata } from "next";
import type { LearnerProfile } from "@/shared/api/learner";
import type { AiCredentialStatus } from "@/shared/api/ai";
import type { GamificationSummary } from "@/shared/api/gamification";
import type { PublicProfileSettings } from "@/shared/api/public-profile";
import type { NotificationPreferences } from "@/shared/api/notifications";
import type { AdminMfaStatus } from "@/shared/api/admin";
import { requireVerifiedUser } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PasswordForm } from "@/components/auth/password-form";
import { AiKeySettings } from "@/components/learner/ai-key-settings";
import { ProfileSettingsHero } from "@/components/auth/profile-settings-hero";
import { GamificationPreferences } from "@/components/auth/gamification-preferences";
import { ProfileSettingsTabs } from "@/components/auth/profile-settings-tabs";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { MfaSettingsCard } from "@/components/admin/admin-mfa-card";
import { PublicProfileSettingsForm } from "@/components/profile/public-profile-settings";
import { showsGameElements } from "@/lib/gamification";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  await requireVerifiedUser();
  const [profile, aiStatus, gamification, notifications, mfa, publicProfile] = await Promise.all([
    serverApiFetch<LearnerProfile>("/api/v1/learner/profile"),
    serverApiFetch<AiCredentialStatus>("/api/v1/learner/ai-credential"),
    serverApiFetch<GamificationSummary>("/api/v1/learner/gamification").catch(() => null),
    serverApiFetch<NotificationPreferences>("/api/v1/notifications/preferences"),
    serverApiFetch<AdminMfaStatus>("/api/v1/auth/mfa"),
    serverApiFetch<PublicProfileSettings>("/api/v1/learner/public-profile").catch(() => null),
  ]);
  const gameFeaturesOn = Boolean(gamification && (gamification.features.xp || gamification.features.streakFreezes));

  return (
    <div className="min-h-dvh bg-background">
      <ProfileSettingsHero
        name={profile.name}
        email={profile.email}
        image={profile.image}
        topThree={gamification && showsGameElements(gamification) ? gamification.topThree : null}
      />

      <div className="mx-auto max-w-3xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <ProfileSettingsTabs
          tabs={[
            {
              id: "profile",
              label: "Profile",
              content: (
                <div className="rounded-2xl border bg-card p-6 sm:p-8">
                  <div className="mb-6 border-b border-border pb-5">
                    <h2 className="text-lg font-semibold tracking-tight">Profile details</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Update how you appear in the workspace. Your timezone decides when your day ends for
                      streaks and study goals. Skills are optional and used for future recommendations.
                    </p>
                  </div>
                  <ProfileForm
                    email={profile.email}
                    initial={{
                      name: profile.name ?? "",
                      timezone: profile.timezone,
                      skills: profile.skills.join(", "),
                    }}
                    variant="plain"
                  />
                </div>
              ),
            },
            {
              id: "preferences",
              label: "Preferences",
              content: (
                <div className="space-y-4">
                  <AiKeySettings initial={aiStatus} />
                  {gamification && gameFeaturesOn ? <GamificationPreferences initial={gamification} /> : null}
                </div>
              ),
            },
            {
              id: "public",
              label: "Public",
              content: publicProfile ? (
                <PublicProfileSettingsForm initial={publicProfile} />
              ) : (
                <p className="text-sm text-muted-foreground">Public profiles aren&apos;t available right now.</p>
              ),
            },
            {
              id: "notifications",
              label: "Notifications",
              content: (
                <div className="rounded-2xl border bg-card p-6 sm:p-8">
                  <h2 className="text-lg font-semibold tracking-tight">Notification settings</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Choose where each kind of update reaches you. Study reminders come at most once a day across
                    all your courses.
                  </p>
                  <NotificationPreferencesForm initial={notifications} showAdmin={false} />
                </div>
              ),
            },
            {
              id: "security",
              label: "Security",
              content: (
                <div className="space-y-4">
                  <MfaSettingsCard
                    mode="account"
                    enabled={mfa.enabled}
                    recoveryCodesRemaining={mfa.recoveryCodesRemaining}
                  />
                  <PasswordForm />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
