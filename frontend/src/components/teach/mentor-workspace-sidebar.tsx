"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpenText,
  Building2,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageSquareText,
  Settings2,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { WorkspaceAccountMenu } from "@/components/workspace/workspace-account-menu";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { helpUiCopy } from "@/shared/lib/help-ui-copy";
import type { InstructorAccessView } from "@/shared/lib/instructor-access";

const LAST_COURSE_KEY = "buildment:mentor:last-course";
const LAST_COURSE_EVENT = "buildment:last-course-change";

export type MentorSidebarCourse = {
  id: string;
  slug: string;
  title: string;
  status: string;
  chapterCount: number;
  learnerCount: number;
  pendingReviews: number;
  openHelpRequests: number;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  disabled?: boolean;
};

export function MentorWorkspaceSidebar({
  courses,
  user,
  instructorAccess,
  signOutAction,
}: {
  courses: MentorSidebarCourse[];
  user: { name?: string | null; email?: string | null; role?: string };
  instructorAccess: InstructorAccessView;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const routeCourseSlug = courseSlugFromPath(pathname, courses);
  const rememberedSlug = useSyncExternalStore(
    subscribeToLastCourse,
    readLastCourse,
    () => null
  );

  useEffect(() => {
    if (routeCourseSlug) {
      writeLastCourse(routeCourseSlug);
    }
  }, [routeCourseSlug]);

  const selectedSlug =
    routeCourseSlug ??
    (rememberedSlug && courses.some((course) => course.slug === rememberedSlug)
      ? rememberedSlug
      : courses[0]?.slug ?? null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.slug === selectedSlug) ?? courses[0] ?? null,
    [courses, selectedSlug]
  );
  const courseBase = selectedCourse ? `/courses/${selectedCourse.slug}` : null;

  const workspaceItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/workspace",
      icon: LayoutDashboard,
      active: pathname === "/workspace",
    },
    {
      label: "My courses",
      href: "/courses",
      icon: LibraryBig,
      active: pathname === "/courses",
      count: courses.length,
    },
    {
      label: "Wallet & Payouts",
      href: "/wallet",
      icon: Wallet,
      active: pathname.startsWith("/wallet"),
    },
    {
      label: "Campaigns",
      href: "/campaigns",
      icon: Sparkles,
      active: pathname.startsWith("/campaigns"),
    },
    {
      label: "Organizations",
      href: "/organizations",
      icon: Building2,
      active: pathname.startsWith("/organizations"),
    },
  ];
  const courseItems: NavItem[] = [
    {
      label: "Curriculum",
      href: courseBase ? `${courseBase}/edit` : "/courses",
      icon: BookOpenText,
      active:
        Boolean(routeCourseSlug) &&
        (pathname.endsWith("/edit") || pathname.includes("/chapters/")),
      count: selectedCourse?.chapterCount,
      disabled: !selectedCourse,
    },
    {
      label: "Settings",
      href: courseBase ? `${courseBase}/settings` : "/courses",
      icon: Settings2,
      active: Boolean(routeCourseSlug) && pathname.endsWith("/settings"),
      disabled: !selectedCourse,
    },
    {
      label: "Learners",
      href: courseBase ? `${courseBase}/mentees` : "/courses",
      icon: Users,
      active: Boolean(routeCourseSlug) && pathname.includes("/mentees"),
      count: selectedCourse?.learnerCount,
      disabled: !selectedCourse,
    },
  ];
  const insightItems: NavItem[] = [
    {
      label: "Reports",
      href: courseBase ? `${courseBase}/reports` : "/courses",
      icon: BarChart3,
      active: Boolean(routeCourseSlug) && pathname.includes("/reports"),
      disabled: !selectedCourse,
    },
    {
      label: "Daily activity",
      href: courseBase ? `${courseBase}/activity` : "/courses",
      icon: Activity,
      active: Boolean(routeCourseSlug) && pathname.includes("/activity"),
      disabled: !selectedCourse,
    },
  ];
  const workflowItems: NavItem[] = [
    {
      label: "Answers to check",
      href: selectedCourse ? `/review?courseId=${selectedCourse.id}` : "/review",
      icon: MessageSquareText,
      active: pathname.startsWith("/review"),
      count: selectedCourse?.pendingReviews,
    },
    {
      label: helpUiCopy.mentorNav,
      href: selectedCourse ? `/help?courseId=${selectedCourse.id}` : "/help",
      icon: CircleHelp,
      active: pathname.startsWith("/help"),
      count: selectedCourse?.openHelpRequests,
    },
  ];

  const chooseCourse = (course: MentorSidebarCourse) => {
    writeLastCourse(course.slug);

    if (routeCourseSlug) {
      router.push(pathname.replace(`/courses/${routeCourseSlug}`, `/courses/${course.slug}`));
    } else if (pathname.startsWith("/review")) {
      router.push(`/review?courseId=${course.id}`);
    } else if (pathname.startsWith("/help")) {
      router.push(`/help?courseId=${course.id}`);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <WorkspaceAccountMenu current="teach" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} compact />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open mentor workspace navigation"
                />
              }
            >
              <Menu className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(21rem,calc(100vw-2rem))] p-1.5">
              <MobileItems label="Workspace" items={workspaceItems} router={router} />
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Course context</DropdownMenuLabel>
                {courses.length > 0 ? (
                  courses.map((course) => (
                    <DropdownMenuItem
                      key={course.id}
                      className={cn("py-2", course.id === selectedCourse?.id && "bg-accent font-medium")}
                      onClick={() => chooseCourse(course)}
                    >
                      <span className="min-w-0 flex-1 truncate">{course.title}</span>
                      <span className="text-[10px] capitalize text-muted-foreground">
                        {course.status.toLowerCase()}
                      </span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem onClick={() => router.push("/courses")}>Create your first course</DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <MobileItems items={[...courseItems, ...insightItems]} router={router} />
              <DropdownMenuSeparator />
              <MobileItems items={workflowItems} router={router} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r bg-card lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
          <Link href="/workspace" className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo size="sm" />
          </Link>
          <NotificationBell />
        </div>

        <div className="shrink-0 border-b p-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Select course context"
                  disabled={courses.length === 0}
                />
              }
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Active course
                </span>
                <span className="mt-0.5 block truncate text-sm font-semibold">
                  {selectedCourse?.title ?? "No course selected"}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Switch course</DropdownMenuLabel>
                {courses.map((course) => (
                  <DropdownMenuItem
                    key={course.id}
                    className={cn(course.id === selectedCourse?.id && "bg-accent")}
                    onClick={() => chooseCourse(course)}
                  >
                    <span className="min-w-0 flex-1 truncate">{course.title}</span>
                    <span className="text-[10px] capitalize text-muted-foreground">
                      {course.status.toLowerCase()}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav aria-label="Mentor workspace" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <SidebarGroup label="Workspace" items={workspaceItems} />
          <SidebarGroup label="Course" items={courseItems} />
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Insights
              <ChevronDown className="size-3.5 transition-transform group-data-panel-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1.5">
              <SidebarItems items={insightItems} />
            </CollapsibleContent>
          </Collapsible>
          <SidebarGroup label="Workflow" items={workflowItems} />
        </nav>

        <div className="shrink-0 border-t p-2">
          <WorkspaceAccountMenu current="teach" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} />
        </div>
      </aside>
    </>
  );
}

function SidebarGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div>
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5">
        <SidebarItems items={items} />
      </div>
    </div>
  );
}

function SidebarItems({ items }: { items: NavItem[] }) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const classes = cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          item.active
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          item.disabled && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground"
        );
        const content = (
          <>
            <Icon className="size-4" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count !== undefined ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums",
                  item.active ? "bg-background/15 text-background" : "bg-muted text-muted-foreground"
                )}
              >
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </>
        );

        return item.disabled ? (
          <span key={item.label} className={classes} aria-disabled="true" title="Select a course first">
            {content}
          </span>
        ) : (
          <Link key={item.label} href={item.href} aria-current={item.active ? "page" : undefined} className={classes}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function MobileItems({
  label,
  items,
  router,
}: {
  label?: string;
  items: NavItem[];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <DropdownMenuGroup>
      {label ? <DropdownMenuLabel>{label}</DropdownMenuLabel> : null}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            className={cn("py-2", item.active && "bg-accent font-medium")}
            onClick={() => router.push(item.href)}
          >
            <Icon />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count !== undefined ? (
              <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
                {item.count > 99 ? "99+" : item.count}
              </Badge>
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

function courseSlugFromPath(pathname: string, courses: MentorSidebarCourse[]): string | null {
  const match = pathname.match(/^\/courses\/([^/]+)(?:\/|$)/);
  const slug = match?.[1];
  return slug && courses.some((course) => course.slug === slug) ? slug : null;
}

function subscribeToLastCourse(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LAST_COURSE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LAST_COURSE_EVENT, onStoreChange);
  };
}

function readLastCourse(): string | null {
  return window.localStorage.getItem(LAST_COURSE_KEY);
}

function writeLastCourse(slug: string): void {
  if (window.localStorage.getItem(LAST_COURSE_KEY) === slug) return;
  window.localStorage.setItem(LAST_COURSE_KEY, slug);
  window.dispatchEvent(new Event(LAST_COURSE_EVENT));
}
