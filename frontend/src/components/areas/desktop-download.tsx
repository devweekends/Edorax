"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown, Download, MonitorDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DesktopDownloadOption {
  platform: "darwin" | "win32" | "linux";
  label: string;
  url: string;
  version: string | null;
}

/** The platform of this browser, or null when it is a phone or cannot be told. */
function detectPlatform(): DesktopDownloadOption["platform"] | null {
  const agent = navigator.userAgent;
  if (/android|iphone|ipad|ipod/i.test(agent)) return null;
  if (/windows/i.test(agent)) return "win32";
  if (/mac/i.test(agent)) return "darwin";
  if (/linux|x11/i.test(agent)) return "linux";
  return null;
}

const noSubscription = () => () => {};

const primaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-primary bg-primary px-5 text-base font-bold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";
const secondaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-primary px-5 text-base font-bold text-primary outline-none transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

/**
 * Download buttons for the Edorax desktop app. The button for the visitor's own system comes first;
 * on a phone, or when the system is unknown, every system is shown the same way.
 */
export function DesktopDownloadButtons({ options, className }: { options: DesktopDownloadOption[]; className?: string }) {
  const [platform, setPlatform] = useState<DesktopDownloadOption["platform"] | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const main = options.find((option) => option.platform === platform) ?? null;
  const others = options.filter((option) => option !== main);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-3">
        {main ? (
          <a href={main.url} className={primaryClass} data-testid="desktop-download-main">
            <Download className="size-4" aria-hidden />
            Download for {main.label}
          </a>
        ) : null}
        {others.map((option) => (
          <a key={option.platform} href={option.url} className={main ? secondaryClass : primaryClass}>
            <Download className="size-4" aria-hidden />
            {main ? option.label : `Download for ${option.label}`}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * One small "Desktop app" button that opens a menu with a download for each system. For pages
 * where the desktop app is a second choice, such as a lab that already runs in the browser.
 * The visitor's own system comes first in the menu.
 */
export function DesktopDownloadMenu({ options, version, className }: { options: DesktopDownloadOption[]; version?: string | null; className?: string }) {
  // Known only in the browser, so the server and the first paint show the plain order.
  const platform = useSyncExternalStore(noSubscription, detectPlatform, () => null);

  const sorted = [...options].sort((a, b) => Number(b.platform === platform) - Number(a.platform === platform));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid="desktop-download-menu"
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-primary px-4 text-base font-bold text-primary outline-none transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
              className,
            )}
          />
        }
      >
        <MonitorDown className="size-4" aria-hidden />
        Desktop app
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-sm font-normal text-muted-foreground">
            The same lab in Docker on your own computer. Free{version ? `, version ${version}` : ""}.
          </DropdownMenuLabel>
          {sorted.map((option) => (
            <DropdownMenuItem key={option.platform} className="min-h-11 gap-2.5 py-2 text-base" render={<a href={option.url} />}>
              <Download className="size-4" aria-hidden />
              Download for {option.label}
              {option.platform === platform && <span className="ml-auto rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">Your system</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11 py-2 text-base" render={<Link href="/labs/shell#desktop" />}>
          How the app works
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
