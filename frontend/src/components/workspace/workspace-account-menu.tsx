"use client";

import { Check, ChevronsUpDown, GraduationCap, LayoutDashboard, Loader2, LogOut, Moon, Plug, Settings, Shield, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setActiveSurfaceAction } from "@/server/actions/active-surface";
import { requestInstructorAccessAction } from "@/server/actions/instructor-access";
import type { InstructorAccessView } from "@/shared/lib/instructor-access";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHydrated } from "@/lib/use-browser-storage";

export function WorkspaceAccountMenu({
  current,
  user,
  instructorAccess,
  signOutAction,
  compact = false,
  rail = false,
}: {
  current: "learn" | "teach" | "admin";
  user: { name?: string | null; email?: string | null; image?: string | null; role?: string };
  instructorAccess?: InstructorAccessView;
  signOutAction: () => Promise<void>;
  compact?: boolean;
  /**
   * For the sidebar closed to icons: only the avatar shows, and the theme switch is a row
   * inside the menu. Implies `compact`.
   */
  rail?: boolean;
}) {
  if (rail) compact = true;
  const { theme, setTheme, resolvedTheme } = useTheme();
  const hydrated = useHydrated();
  const isDark = hydrated && (resolvedTheme ?? theme) === "dark";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const runAction = (action: () => void | Promise<void>) => startTransition(async () => { await action(); });
  const role = instructorAccess?.role ?? user.role;
  const isAdmin = role === "ADMIN";
  const canTeach = isAdmin || role === "MENTOR";
  const label = { learn: "Learner", teach: "Instructor", admin: "Admin" }[current];
  const name = user.name || user.email || label;
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const profile = { learn: "/settings/profile", teach: "/workspace/settings/profile", admin: "/admin/settings/profile" }[current];
  const surfaces = [
    { key: "learn" as const, label: "Learner", icon: GraduationCap, visible: true },
    { key: "teach" as const, label: "Instructor", icon: LayoutDashboard, visible: canTeach },
    { key: "admin" as const, label: "Admin", icon: Shield, visible: isAdmin },
  ];

  return (
    <div className={cn("flex items-center gap-1", !compact && "w-full")}>
    {compact && !rail && <ThemeToggle className="grid size-10 place-items-center rounded-lg p-0" />}
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" disabled={pending} aria-busy={pending || undefined} aria-label={`Account and workspace: ${label}`} className={cn(
          "flex items-center rounded-lg text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "size-10 justify-center" : "min-w-0 flex-1 gap-2.5 p-2",
        )} />}
      >
        {/* The picture when the account has one (a Google sign-in saves it); the initials until it loads or when there is none. */}
        <Avatar className="size-8 after:hidden" aria-hidden="true">
          <AvatarImage src={user.image ?? undefined} alt="" referrerPolicy="no-referrer" />
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : initials}
          </AvatarFallback>
        </Avatar>
        {!compact && <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{label} workspace</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={rail ? "right" : compact ? "bottom" : "top"} align={compact ? "end" : "start"} className="w-60 max-w-[calc(100vw-2rem)] p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2 font-normal">
            <span className="block truncate font-medium text-foreground">{name}</span>
            <span className="block truncate text-xs">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {surfaces.filter((surface) => surface.visible).map(({ key, label: surfaceLabel, icon: Icon }) => (
            <DropdownMenuItem key={key} className="min-h-9 gap-2 px-2" disabled={pending || current === key} onClick={() => runAction(() => {
              if (key === "admin") return router.push("/admin");
              return setActiveSurfaceAction(key);
            })}>
              <Icon className="size-4" />
              <span className="flex-1">{surfaceLabel}</span>
              {current === key && <Check className="size-4" aria-label="Current workspace" />}
            </DropdownMenuItem>
          ))}
          {!canTeach && instructorAccess?.requestStatus === "pending" && (
            <DropdownMenuItem disabled className="min-h-9 gap-2 px-2">
              <LayoutDashboard className="size-4" /> Instructor access pending
            </DropdownMenuItem>
          )}
          {!canTeach && instructorAccess?.canRequestAccess && instructorAccess.requestStatus !== "pending" && (
            <DropdownMenuItem disabled={pending} className="min-h-9 gap-2 px-2" onClick={() => runAction(() => requestInstructorAccessAction(new FormData()))}>
              <LayoutDashboard className="size-4" />
              {instructorAccess.requestStatus === "rejected" ? "Request instructor access again" : "Request instructor access"}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {current === "learn" && (
          <DropdownMenuItem disabled={pending} className="min-h-9 gap-2 px-2" onClick={() => runAction(() => router.push("/profile"))}>
            <User className="size-4" /> View profile
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={pending} className="min-h-9 gap-2 px-2" onClick={() => runAction(() => router.push(profile))}>
          <Settings className="size-4" /> Profile settings
        </DropdownMenuItem>
        {isAdmin && <DropdownMenuItem disabled={pending} className="min-h-9 gap-2 px-2" onClick={() => runAction(() => router.push("/integrations"))}>
          <Plug className="size-4" /> Integration API
        </DropdownMenuItem>}
        {rail && (
          <DropdownMenuItem className="min-h-9 gap-2 px-2" onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {isDark ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} className="min-h-9 gap-2 px-2" variant="destructive" onClick={() => runAction(signOutAction)}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {!compact && <ThemeToggle className="grid size-10 shrink-0 place-items-center rounded-lg p-0" />}
    </div>
  );
}
