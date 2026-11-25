"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { AchievementClaimResult } from "@/shared/api/public-profile";
import { RewardCelebrationDialog, type RewardCelebration } from "@/components/rewards/reward-celebration-dialog";

/** Pays an achievement's reached tiers, then shows the reward card and refreshes the balance. */
export function AchievementClaimButton({
  achievementId,
  credits,
  className,
}: {
  achievementId: string;
  credits: number;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<RewardCelebration | null>(null);

  async function claim() {
    setBusy(true);
    try {
      const result = await apiFetch<AchievementClaimResult>(`/api/v1/learner/achievements/${encodeURIComponent(achievementId)}/claim`, {
        method: "POST",
      });
      setReward({
        size: "medium",
        icon: Trophy,
        kicker: "Achievement claimed",
        title: result.tierLabel ? `${result.title}: ${result.tierLabel}` : result.title,
        description: `Your balance is now ${result.balance.toLocaleString()} Build Credits.`,
        credits: result.credits,
        action: { label: "Spend in rewards", href: "/rewards" },
      });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not claim this achievement", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        loading={busy}
        loadingLabel="Claiming…"
        disabled={busy || reward !== null}
        onClick={() => void claim()}
        className={className}
      >
        Claim +{credits}
      </Button>
      <RewardCelebrationDialog
        reward={reward}
        onClose={() => {
          if (!reward) return;
          setReward(null);
          router.refresh();
        }}
      />
    </>
  );
}
