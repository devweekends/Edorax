"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import type { PublicProfileSettings } from "@/shared/api/public-profile";
import { Button } from "@/components/ui/button";

// Opt-in controls for the public Career Identity page: enable, headline, "learning in public", and a
// copyable public link (/u/<slug>).
export function PublicProfileSettingsForm({ initial }: { initial: PublicProfileSettings }) {
  const [settings, setSettings] = useState(initial);
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [learningInPublic, setLearningInPublic] = useState(initial.learningInPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicPath = settings.publicSlug ? `/u/${settings.publicSlug}` : null;

  async function save(next: Partial<PublicProfileSettings>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/learner/public-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profilePublic: next.profilePublic ?? settings.profilePublic,
          headline: next.headline ?? headline,
          learningInPublic: next.learningInPublic ?? learningInPublic,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message ?? "Could not save your profile settings.");
        return;
      }
      setSettings(json.data);
    } catch {
      setError("Could not save your profile settings.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!publicPath) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6 sm:p-8">
      <div className="mb-5 border-b border-border pb-4">
        <h2 className="text-lg font-semibold tracking-tight">Public profile</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Share a verified Career Identity page: your career tier, courses, and (if you keep game elements on) XP,
          streak and league. You control everything here, and can turn it off anytime.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
        <span className="text-sm font-medium">Make my profile public</span>
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={settings.profilePublic}
          disabled={saving}
          onChange={(e) => void save({ profilePublic: e.target.checked })}
        />
      </label>

      {settings.profilePublic ? (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="headline">
              Headline
            </label>
            <input
              id="headline"
              value={headline}
              maxLength={120}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Backend Engineering"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={learningInPublic}
              onChange={(e) => setLearningInPublic(e.target.checked)}
            />
            Add “Learning in public” to my headline
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void save({})}>
              {saving ? "Saving…" : "Save headline"}
            </Button>
            {publicPath ? (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <a
                  href={publicPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                >
                  View <ExternalLink className="size-3.5" />
                </a>
              </>
            ) : null}
          </div>

          {publicPath ? (
            <p className="break-all rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{publicPath}</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
