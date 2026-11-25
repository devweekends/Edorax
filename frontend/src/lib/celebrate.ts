"use client";

import { fireMiniConfetti } from "@buildment/learning-ui/components/learn/mini-confetti";
import { playFeedback, type FeedbackKind } from "@/lib/sound-feedback";

// One feedback recipe for every reward moment, sized by how big the moment is, so a quest claim,
// an achievement and a certificate feel related. Sound follows the learner's sound setting;
// confetti already stays off when the device asks for reduced motion.

export type CelebrationSize = "small" | "medium" | "large";

export const CELEBRATION_SOUND: Record<CelebrationSize, FeedbackKind> = {
  small: "success",
  medium: "celebration",
  large: "completion",
};

export function celebrate(size: CelebrationSize, anchor?: HTMLElement | null): void {
  playFeedback(CELEBRATION_SOUND[size]);
  if (anchor) fireMiniConfetti(anchor);
}
