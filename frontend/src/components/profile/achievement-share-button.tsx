"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "@/components/ui/app-toast";
import { copyToClipboard } from "@/lib/clipboard";

// Shares one earned achievement: native share sheet where available, else copies a line + profile URL.
export function AchievementShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const line = `I unlocked "${title}" on Buildment`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${title} · Buildment`, text: line, url });
        return;
      } catch {
        // cancelled/unsupported → fall through to copy
      }
    }
    const ok = await copyToClipboard(`${line}: ${url}`);
    if (ok) {
      setDone(true);
      toast("Copied to share", "success");
      setTimeout(() => setDone(false), 1500);
    } else {
      toast("Couldn't copy the share text", "error");
    }
  }

  return (
    <button
      type="button"
      aria-label={`Share ${title}`}
      onClick={() => void share()}
      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
    >
      {done ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
    </button>
  );
}
