"use client";

import { useRef, useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

// Copies the public profile URL, and always surfaces the link in a selectable field so a blocked or
// isolated clipboard (e.g. an automation browser) can never leave the user with nothing.

export function ShareProfileButton({ className, shareUrl }: { className?: string; shareUrl?: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function share() {
    const href = shareUrl
      ? shareUrl.startsWith("http")
        ? shareUrl
        : `${typeof window !== "undefined" ? window.location.origin : ""}${shareUrl}`
      : typeof window !== "undefined"
        ? window.location.href
        : "";
    setUrl(href);
    const ok = await copyToClipboard(href);
    if (ok) {
      setCopied(true);
      toast("Profile link copied", "success");
      setTimeout(() => setCopied(false), 1800);
    } else {
      // Clipboard blocked/isolated: reveal the link, pre-selected, so the user can copy it by hand.
      setOpen(true);
      toast("Copy is blocked here — select the link and press Ctrl/Cmd+C.", "error");
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }

  async function copyFromPanel() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      toast("Profile link copied", "success");
      setOpen(false);
      setTimeout(() => setCopied(false), 1800);
    } else {
      inputRef.current?.select();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Button type="button" onClick={() => void share()} className="w-full">
        {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {copied ? "Link copied" : "Share profile"}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Your profile link</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <input
            ref={inputRef}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full select-all rounded-md border bg-background px-2 py-1.5 text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void copyFromPanel()}>
              <Copy className="size-3.5" /> Copy
            </Button>
            <span className="text-[11px] text-muted-foreground">or press Ctrl/Cmd+C</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}