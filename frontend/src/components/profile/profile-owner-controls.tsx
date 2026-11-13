"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";

// Owner-only controls layered on the shared profile page: visibility toggle + inline headline edit.
// Same route as the public page; these render only when the viewer is the owner.
export function ProfileOwnerControls({
  initialPublic,
  initialHeadline,
}: {
  initialPublic: boolean;
  initialHeadline: string | null;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [headline, setHeadline] = useState(initialHeadline ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/learner/public-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.message ?? "Could not save", "error");
        return false;
      }
      return true;
    } catch {
      toast("Could not save", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function togglePublic(next: boolean) {
    setIsPublic(next);
    const ok = await patch({ profilePublic: next });
    if (!ok) {
      setIsPublic(!next);
      return;
    }
    toast(next ? "Profile is public" : "Profile is private", "success");
    router.refresh();
  }

  async function saveHeadline() {
    const ok = await patch({ headline });
    if (ok) {
      toast("Headline saved", "success");
      router.refresh();
    }
  }

  return (
    <div className="mt-5 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">You&apos;re viewing your profile</span>
        <Button type="button" size="sm" variant={isPublic ? "outline" : "default"} disabled={saving} onClick={() => void togglePublic(!isPublic)}>
          {isPublic ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {isPublic ? "Make private" : "Make public"}
        </Button>
        <a href="/settings/profile" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <Settings className="size-3.5" /> More settings
        </a>
      </div>

      {!isPublic ? (
        <p className="mt-2 text-xs text-amber-600">
          Only you can see this page right now. Make it public to share it.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder="Headline (e.g. Backend Engineering)"
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveHeadline()}>
          <Save className="size-4" /> Save headline
        </Button>
      </div>
    </div>
  );
}
