"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BookOpenText, CircleHelp, Coins, Compass, Flame, Home, Star, Trophy, TrendingUp, User, type LucideIcon } from "lucide-react";
import { WorkspaceAccountMenu } from "@/components/workspace/workspace-account-menu";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { helpUiCopy } from "@/shared/lib/help-ui-copy";
import type { InstructorAccessView } from "@/shared/lib/instructor-access";
import { LEARN_AREAS, areaForPath } from "@/lib/learn-areas";
import { AREA_ICON } from "@/components/areas/area-icon";

type LearnerNavItem = {
  label: string;
  mobileLabel?: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  /** Shown as a small "Soon" tag: the area has an overview page but is not built yet. */
  soon?: boolean;
};

export type LearnerStats = {
  streak: number;
  level: number | null;
  career: string | null;
  credits: number | null;
  hidden: boolean;
};

function LearnerStatStrip({ stats }: { stats: LearnerStats }) {
  if (stats.hidden) return null;
  const items: Array<{ href: string; icon: LucideIcon; value: string; label: string; hint: string }> = [
    { href: "/progress", icon: Flame, value: String(stats.streak), label: "day streak", hint: "Day streak: days in a row you studied. Opens Progress." },
  ];
  if (stats.level != null)
    items.push({ href: "/profile", icon: Star, value: String(stats.level), label: "level", hint: "Level: earned from XP. Opens your profile." });
  if (stats.career)
    items.push({ href: "/profile", icon: Award, value: stats.career, label: "", hint: "Career tier: permanent, earned from completed courses and quiz mastery. Opens your profile." });
  if (stats.credits != null)
    items.push({ href: "/rewards", icon: Coins, value: stats.credits.toLocaleString(), label: "credits", hint: "Build Credits: spend on mascot cosmetics and consumables. Opens Rewards." });
  return (
    <div className="sticky top-16 z-30 flex items-center justify-end gap-x-4 gap-y-1 overflow-x-auto border-b border-border bg-card/80 px-4 py-2 text-sm backdrop-blur lg:top-0 lg:px-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label || item.value}
            href={item.href}
            title={item.hint}
            aria-label={item.hint}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap hover:underline"
          >
            <Icon className="size-4 text-primary" aria-hidden />
            <span className="font-semibold tabular-nums">{item.value}</span>
            {item.label ? <span className="text-muted-foreground">{item.label}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

export function MenteeWorkspaceShell({
  children,
  user,
  instructorAccess,
  assignedCourses,
  openHelpRequests,
  pendingReviews,
  signOutAction,
  stats,
}: {
  children: ReactNode;
  user: { name?: string | null; email?: string | null; role?: string };
  instructorAccess: InstructorAccessView;
  assignedCourses: number;
  openHelpRequests: number;
  pendingReviews: number;
  signOutAction: () => Promise<void>;
  stats?: LearnerStats;
}) {
  const pathname = usePathname();

  // Keep the stat strip fresh: it starts from the server-rendered values, then refetches on every
  // navigation so a balance change (reward/quest/claim) never leaves it stale.
  const [liveStats, setLiveStats] = useState<LearnerStats | undefined>(stats);
  useEffect(() => {
    setLiveStats(stats);
  }, [stats]);
  useEffect(() => {
    if (pathname.startsWith("/courses/")) return;
    let cancelled = false;
    (async () => {
      try {
        const [g, h] = await Promise.all([
          fetch("/api/v1/learner/gamification").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/v1/learner/habit").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        const gd = g?.data;
        const hd = h?.data;
        if (!gd && !hd) return;
        setLiveStats((prev) => ({
          streak: hd?.streakCount ?? prev?.streak ?? 0,
          level: gd?.level?.level ?? null,
          career: gd?.career?.title ?? null,
          credits: gd?.credits?.balance ?? null,
          hidden: gd?.hidden ?? false,
        }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Course overviews and chapter readers have their own focused navigation. The wrapper keeps them
  // full width: as bare children of the layout's flex column, their mx-auto roots shrink to fit the
  // widest line, which made phones zoom out.
  if (pathname.startsWith("/courses/")) return <div className="w-full">{children}</div>;

  const area = areaForPath(pathname);
  const home: LearnerNavItem = { label: "Home", href: "/dashboard", icon: Home, active: pathname === "/dashboard" };
  // Every learner area, in the order of LEARN_AREAS. Courses opens on every course; the learner's own courses are under "My learning".
  const areaItems: LearnerNavItem[] = LEARN_AREAS.map((a) => ({
    label: a.id === "voice" ? a.name : a.short,
    href: a.href,
    icon: AREA_ICON[a.id],
    active: area?.id === a.id && pathname !== "/my-courses",
    soon: a.status === "coming-soon",
  }));
  const myLearning: LearnerNavItem = {
    label: "My learning",
    href: "/my-courses",
    icon: BookOpenText,
    active: pathname === "/my-courses",
    count: assignedCourses,
  };
  const profile: LearnerNavItem = {
    label: "Profile",
    href: "/profile",
    icon: User,
    active: pathname === "/profile",
  };
  const youItems: LearnerNavItem[] = [
    { label: "Progress", href: "/progress", icon: TrendingUp, active: pathname === "/progress" },
    { label: "Leaderboard", mobileLabel: "Ranks", href: "/leaderboard", icon: Trophy, active: pathname === "/leaderboard" },
    {
      label: helpUiCopy.learnerNav,
      mobileLabel: "Questions",
      href: "/my-questions",
      icon: CircleHelp,
      active: pathname.startsWith("/my-questions"),
      count: openHelpRequests,
    },
  ];
  const sidebarGroups: { label?: string; items: LearnerNavItem[] }[] = [
    { items: [home] },
    { label: "Learn", items: areaItems },
    { label: "You", items: [myLearning, youItems[0]!, profile, ...youItems.slice(1)] },
  ];
  // Five slots on a phone: the areas share one "Learn" tab that opens the hub, and the hub's tabs switch between them.
  const mobileItems: LearnerNavItem[] = [
    home,
    { label: "Learn", href: "/learn", icon: Compass, active: pathname === "/learn" || area !== null, count: assignedCourses },
    ...youItems,
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <Link href="/dashboard" aria-label="Edorax home" className="text-foreground">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <WorkspaceAccountMenu current="learn" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} compact />
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
          <Link href="/dashboard" aria-label="Edorax home" className="inline-flex text-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow">
            <Logo size="sm" />
          </Link>
          <NotificationBell />
        </div>

        <nav aria-label="Learner workspace" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {sidebarGroups.map((group, gi) => (
            <div key={group.label ?? gi} className={gi > 0 ? "pt-4" : undefined}>
              {group.label ? <p className="px-3.5 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.label}</p> : null}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={item.active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3.5 text-base outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                          item.active ? "bg-secondary font-bold text-primary" : "font-medium text-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.count ? <Count value={item.count} /> : null}
                        {item.soon ? <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">Soon</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {pendingReviews > 0 ? (
            <p className="px-3.5 pt-3 text-sm leading-5 text-muted-foreground">
              {pendingReviews} submission{pendingReviews === 1 ? "" : "s"} awaiting review
            </p>
          ) : null}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          <WorkspaceAccountMenu current="learn" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} />
        </div>
      </aside>

      <main className="min-h-dvh pb-20 lg:pb-0 lg:pl-60">
        {liveStats ? <LearnerStatStrip stats={liveStats} /> : null}
        {children}
      </main>

      <nav aria-label="Learner workspace" data-learner-bottom-nav="" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-yellow",
                item.active ? "font-bold text-primary" : "font-medium text-muted-foreground"
              )}
            >
              <Icon className="size-[22px]" aria-hidden />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
              {item.count ? (
                <span className="absolute right-[calc(50%-24px)] top-2 grid size-2.5 rounded-full bg-brand-yellow" aria-label={`${item.count} open`} />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="min-w-6 rounded-sm bg-secondary px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-foreground">
      {value > 99 ? "99+" : value}
    </span>
  );
}
