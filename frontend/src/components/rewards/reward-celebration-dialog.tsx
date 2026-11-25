"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Coins, X, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { celebrate, type CelebrationSize } from "@/lib/celebrate";

export type RewardCelebration = {
  size: CelebrationSize;
  icon: LucideIcon;
  /** Short line above the title, e.g. "Achievement unlocked". */
  kicker: string;
  title: string;
  description: string;
  /** Build Credits this moment paid, shown as a chip. */
  credits?: number;
  action?: { label: string; href: string };
};

/**
 * The reward card shown for medium and large moments (an achievement claimed, a new career tier,
 * a certificate). It plays the matching celebration when it opens. Pass null to close it.
 */
export function RewardCelebrationDialog({ reward, onClose }: { reward: RewardCelebration | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (reward && !dialog.open) {
      dialog.showModal();
      celebrate(reward.size, iconRef.current);
    }
    if (!reward && dialog.open) dialog.close();
  }, [reward]);

  const Icon = reward?.icon;
  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="reward-celebration-title"
      aria-describedby="reward-celebration-description"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border-2 border-b-[5px] bg-card p-6 text-center text-card-foreground backdrop:bg-foreground/30"
    >
      {reward && Icon ? (
        <>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 size-10">
              <X className="size-5" aria-hidden />
            </Button>
          </div>
          <span
            ref={iconRef}
            className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--brand-yellow)] text-[#0a0f2c] motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-300"
          >
            <Icon className="size-8" aria-hidden />
          </span>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-primary">{reward.kicker}</p>
          <h2 id="reward-celebration-title" className="mt-1.5 text-2xl font-semibold tracking-tight">
            {reward.title}
          </h2>
          <p id="reward-celebration-description" className="mt-2 text-sm leading-6 text-muted-foreground">
            {reward.description}
          </p>
          {reward.credits ? (
            <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              <Coins className="size-4" aria-hidden /> +{reward.credits} Build Credits
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            {reward.action ? (
              <Link href={reward.action.href} className={buttonVariants({ className: "min-h-11" })}>
                {reward.action.label}
              </Link>
            ) : null}
            <Button type="button" variant={reward.action ? "outline" : "default"} onClick={onClose} className="min-h-11">
              {reward.action ? "Not now" : "Nice"}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
