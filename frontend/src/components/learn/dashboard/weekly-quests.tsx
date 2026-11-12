"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "@/components/ui/app-toast";
import { playFeedback } from "@/lib/sound-feedback";
import type { WeeklyQuestsView } from "@/shared/api/quests";

// Weekly quests: a compact entry at the top of the dashboard; the full mission
// board lives in a dialog so it does not push the rest of the page down.
export function WeeklyQuests() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<WeeklyQuestsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/learner/quests");
        if (!res.ok || cancelled) return;
        const data = (await res.json()).data as WeeklyQuestsView;
        if (!cancelled) setState(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function claim(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/v1/learner/quests/${id}/claim`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast(json?.message ?? "Could not claim this quest", "error");
        return;
      }
      setState(json.data);
      playFeedback("success");
      toast("Quest reward claimed", "success");
      router.refresh();
    } catch {
      toast("Could not claim this quest", "error");
    } finally {
      setBusy(null);
    }
  }

  if (!state || state.quests.length === 0) return null;

  const percent = state.total > 0 ? Math.round((state.completed / state.total) * 100) : 0;
  const claimable = state.quests.filter((quest) => quest.completed && !quest.claimed).length;

  return (
    <>
      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="quests-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="quests-heading" className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
              Weekly quests
              <InfoTip label="About weekly quests">
                <p>Five quests each week: two core goals plus three that rotate from a pool, so they change week to week.</p>
                <p className="mt-2">Progress resets every Monday (UTC). Claim each completed quest once for Build Credits; unclaimed rewards are not paid automatically.</p>
              </InfoTip>
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {state.completed} of {state.total} complete
              {claimable > 0 ? ` · ${claimable} ready to claim` : ""}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            View quests
          </Button>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Weekly quests complete"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-labelledby="quests-dialog-title"
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground backdrop:bg-foreground/30 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="quests-dialog-title" className="text-lg font-semibold tracking-tight">
              Weekly quests
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Effort-based goals that reset every Monday.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close weekly quests"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium tabular-nums">
            {state.completed} / {state.total} complete
          </span>
          {claimable > 0 ? (
            <span className="font-medium text-primary">{claimable} ready to claim</span>
          ) : null}
        </div>

        <ul className="mt-4 space-y-3">
          {state.quests.map((quest) => {
            const questPercent = Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100));
            return (
              <li key={quest.id} className="rounded-xl border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{quest.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{quest.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Gift className="size-3.5" aria-hidden /> +{quest.rewardCredits}
                    </span>
                    {quest.completed && !quest.claimed ? (
                      <Button
                        size="sm"
                        disabled={busy === quest.id}
                        loading={busy === quest.id}
                        loadingLabel="Claiming…"
                        onClick={() => void claim(quest.id)}
                      >
                        Claim
                      </Button>
                    ) : quest.claimed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Claimed
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${questPercent}%` }} />
                </div>
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {quest.progress} / {quest.target}
                </p>
              </li>
            );
          })}
        </ul>
      </dialog>
    </>
  );
}
