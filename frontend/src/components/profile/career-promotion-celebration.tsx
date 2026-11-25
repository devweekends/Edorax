"use client";

import { useState } from "react";
import { Award } from "lucide-react";
import type { CareerTier } from "@/shared/api/gamification";
import { CAREER_REQUIREMENTS, CAREER_TIER_LABELS, nextCareerTier } from "@/shared/gamification/career";
import { RewardCelebrationDialog, type RewardCelebration } from "@/components/rewards/reward-celebration-dialog";

/** Opens once when the server reports the owner reached a new career tier for the first time. */
export function CareerPromotionCelebration({ tier }: { tier: CareerTier }) {
  const [reward, setReward] = useState<RewardCelebration | null>(() => {
    const next = nextCareerTier(tier);
    return {
      size: "large",
      icon: Award,
      kicker: "New career tier",
      title: `You are now ${CAREER_TIER_LABELS[tier]}`,
      description: next
        ? `Verified mastery got you here. ${CAREER_TIER_LABELS[next]} needs ${CAREER_REQUIREMENTS[next].courses} completed courses and a ${CAREER_REQUIREMENTS[next].minScore}% average.`
        : "You reached the highest career tier on Edorax.",
    };
  });
  return <RewardCelebrationDialog reward={reward} onClose={() => setReward(null)} />;
}
