import type { LearnerHabit, LearnerWorkspace } from "@/shared/api/learner";
import type { GamificationSummary } from "@/shared/api/gamification";
import type { MyClassesView } from "@/shared/api/classes";
import type { MyOrganizationsView } from "@/shared/api/organizations";
import { canAccessLearnSurface, getSessionUser } from "@/server/auth/guards";
import { getActiveSurface } from "@/server/auth/surface";
import { serverApiFetch } from "@/lib/api-server";
import { signOutAction } from "@/server/auth/actions";
import { MenteeWorkspaceShell } from "@/components/learn/mentee-workspace-shell";
import { AppActivityTracker } from "@/components/app-activity-tracker";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { MascotPlayer } from "@/components/mascot/mascot-player";
import { AccountSetupPrompt } from "@/components/auth/account-setup-prompt";
import { DailyStreakPopup } from "@/components/learn/daily-streak-popup";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const learner = user && (user.role === "ADMIN" || user.emailVerified) && canAccessLearnSurface(user) && (await getActiveSurface(user.role)) === "learn";

  if (!user || !learner) return <>{children}</>;

  const [workspace, gamification, habit, myClasses, myOrganizations] = await Promise.all([
    serverApiFetch<LearnerWorkspace>("/api/v1/learner/workspace"),
    serverApiFetch<GamificationSummary>("/api/v1/learner/gamification").catch(() => null),
    serverApiFetch<LearnerHabit>("/api/v1/learner/habit").catch(() => null),
    // The "My classes" link only shows for learners who are in a class.
    serverApiFetch<MyClassesView>("/api/v1/classes").catch(() => null),
    // The "Organisations" link only shows for people who belong to an organisation.
    serverApiFetch<MyOrganizationsView>("/api/v1/organizations").catch(() => null),
  ]);

  const stats = {
    streak: habit?.streakCount ?? 0,
    xpTotal: gamification?.xp?.total ?? 0,
    level: gamification?.level?.level ?? null,
    career: gamification?.career?.title ?? null,
    credits: gamification?.credits?.balance ?? null,
    hidden: gamification?.hidden ?? false,
  };

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <AppActivityTracker />
      <NotificationCenter />
      <MascotPlayer />
      <AccountSetupPrompt user={user} />
      <DailyStreakPopup userId={user.id} />
      <MenteeWorkspaceShell
        user={user}
        instructorAccess={workspace.instructorAccess}
        assignedCourses={workspace.assignedCourses}
        pendingReviews={workspace.pendingReviews}
        openHelpRequests={workspace.openHelpRequests}
        classCount={myClasses?.classes.length ?? 0}
        organizationCount={myOrganizations?.organizations.length ?? 0}
        signOutAction={signOutAction}
        stats={stats}
      >
        {children}
      </MenteeWorkspaceShell>
    </div>
  );
}
