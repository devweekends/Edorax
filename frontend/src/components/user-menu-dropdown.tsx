"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LayoutDashboard, Loader2, LogOut, Moon, Sun, TrendingUp } from "lucide-react";
import { useTheme } from "next-themes";
import { useHydrated } from "@/lib/use-browser-storage";
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
import { UserAvatar } from "@/components/user-avatar";

type UserMenuDropdownProps = {
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null };
  compact?: boolean;
  signOutAction: () => Promise<void>;
  homeHref?: string;
  showProgress?: boolean;
};

export function UserMenuDropdown({
  user,
  compact = false,
  signOutAction,
  homeHref = "/dashboard",
  showProgress = true,
}: UserMenuDropdownProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const displayName = user.name ?? user.email ?? "Account";
  // The top bar hides its dark mode button on narrow screens, so the menu carries it too.
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = useHydrated() && (resolvedTheme ?? theme) === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            // In a top bar (compact) the avatar is small, so the button around it is a full 44px touch target.
            className={cn(
              "rounded-full outline-none ring-offset-2 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-border",
              compact && "grid size-11 place-items-center"
            )}
            aria-label="Open account menu"
            disabled={pending}
            aria-busy={pending || undefined}
          />
        }
      >
        <span className="relative inline-flex">
          <span className={pending ? "opacity-0" : undefined}><UserAvatar user={user} compact={compact} /></span>
          {pending && <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          </span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            {user.email && user.name && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={() => startTransition(() => router.push(homeHref))}>
          <LayoutDashboard className="size-4" />
          Home
        </DropdownMenuItem>
        {showProgress && (
          <DropdownMenuItem disabled={pending} onClick={() => startTransition(() => router.push("/progress"))}>
            <TrendingUp className="size-4" />
            My progress
          </DropdownMenuItem>
        )}
        <DropdownMenuItem closeOnClick={false} onClick={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (user.id) window.sessionStorage.removeItem(`account-setup-prompted:${user.id}`);
            startTransition(async () => { await signOutAction(); });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
