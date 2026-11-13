"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CosmeticDot } from "./cosmetic-dot";

type RewardItem = {
  id: string;
  label: string;
  price: number;
  kind: "cosmetic" | "consumable";
  visual?: string;
  effect?: string;
  owned: boolean;
  quantity: number;
};
type RewardsResponse = { balance: number; active: string | null; xpBoostUntil: string | null; rewards: RewardItem[] };

// A small inline icon preview for consumables (there's no mascot visual for these).
function ConsumableIcon({ effect, size = 80 }: { effect?: string; size?: number }) {
  const Icon = effect === "xp_boost" ? Zap : Shield;
  return (
    <div className="relative inline-grid size-[80px] place-items-center text-brand-yellow" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-[16%] rounded-full border border-brand-yellow/40" />
      <Icon className="size-9" />
    </div>
  );
}

export default function RewardsMarketplace() {
  const router = useRouter();
  const [state, setState] = useState<RewardsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/learner/rewards");
      if (!res.ok) throw new Error("Could not load rewards");
      setState(await res.json().then((json) => json.data));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load rewards");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(kind: "buy" | "equip" | "unequip" | "use", id?: string) {
    setBusy(id ?? "active");
    setError(null);
    try {
      if (kind === "buy" && id) {
        const res = await fetch(`/api/v1/learner/rewards/${id}/purchase`, { method: "POST" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.message ?? "Purchase failed");
          return;
        }
        // The purchase endpoint returns a PurchaseResult ({ balance, owned, quantity }), not the
        // full rewards view: re-fetch rather than dropping that partial object into `state`,
        // which would have no `rewards` array and collapse the page to its empty fallback.
        await refresh();
        router.refresh();
        return;
      }
      if (kind === "use" && id) {
        const res = await fetch(`/api/v1/learner/rewards/${id}/use`, { method: "POST" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.message ?? "Could not use this item");
          return;
        }
        await refresh();
        router.refresh();
        return;
      }
      const res = await fetch("/api/v1/learner/rewards/active", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rewardId: kind === "equip" && id ? id : null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message ?? "Could not update the equipped reward");
        return;
      }
      await refresh();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (!state || !Array.isArray(state.rewards)) {
    return <p className="text-sm text-muted-foreground">{error ?? "Rewards aren't available right now."}</p>;
  }

  const cosmetics = state.rewards.filter((r) => r.kind === "cosmetic");
  const consumables = state.rewards.filter((r) => r.kind === "consumable");
  const s = state;

  function card(reward: RewardItem) {
    const equipped = s.active === reward.id;
    const isCosmetic = reward.kind === "cosmetic";
    const status =
      reward.kind === "cosmetic"
        ? reward.owned
          ? equipped
            ? "Equipped"
            : "Owned"
          : `${reward.price} Build Credits`
        : reward.quantity > 0
          ? `Owned ×${reward.quantity}`
          : `${reward.price} Build Credits`;
    return (
      <div key={reward.id} className={cn("flex gap-4 rounded-xl border bg-card p-4", equipped && "border-primary")}>
        {isCosmetic ? <CosmeticDot visual={reward.visual ?? null} size={80} /> : <ConsumableIcon effect={reward.effect} size={80} />}
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{reward.label}</p>
          <p className={cn("mt-1 text-sm", reward.owned ? "text-ok" : "text-muted-foreground")}>{status}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isCosmetic && !reward.owned ? (
              <Button type="button" size="sm" disabled={busy === reward.id} loading={busy === reward.id} loadingLabel="Buying…" onClick={() => void act("buy", reward.id)}>
                Buy
              </Button>
            ) : isCosmetic && equipped ? (
              <Button type="button" size="sm" variant="outline" disabled={busy === "active"} onClick={() => void act("unequip")}>
                Unequip
              </Button>
            ) : isCosmetic ? (
              <Button type="button" size="sm" variant="outline" disabled={busy === reward.id} onClick={() => void act("equip", reward.id)}>
                Equip
              </Button>
            ) : !reward.owned ? (
              <Button type="button" size="sm" disabled={busy === reward.id} onClick={() => void act("buy", reward.id)}>
                Buy
              </Button>
            ) : reward.effect === "xp_boost" ? (
              <Button type="button" size="sm" disabled={busy === reward.id} loading={busy === reward.id} loadingLabel="Activating…" onClick={() => void act("use", reward.id)}>
                Activate boost
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={busy === reward.id} onClick={() => void act("buy", reward.id)}>
                Buy another
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  function section(title: string, hint: string, items: RewardItem[]) {
    if (items.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{hint}</p>
        <div className="grid gap-4 sm:grid-cols-2">{items.map(card)}</div>
      </section>
    );
  }

  return (
    <div className="not-prose mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-brand-yellow/15 text-foreground" aria-hidden>
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{state.balance}</span> Build Credits. Earn from completed
            courses and league promotions. Cosmetics dress your mascot; consumables give a temporary edge.
          </p>
        </div>
      </div>

      {state.xpBoostUntil ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand-yellow/40 bg-brand-yellow/10 p-4">
          <Zap className="size-5 text-brand-yellow" />
          <div>
            <p className="text-sm font-semibold">×2 XP boost active</p>
            <p className="text-sm text-muted-foreground">Every XP you earn is doubled until the session window expires.</p>
          </div>
        </div>
      ) : state.active ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
          <CosmeticDot visual={state.rewards.find((r) => r.id === state.active)?.visual ?? null} size={72} />
          <div>
            <p className="text-sm font-semibold">Equipped</p>
            <p className="text-sm text-muted-foreground">{state.rewards.find((r) => r.id === state.active)?.label ?? "No cosmetic"}</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      {section("Cosmetics", "One-time unlocks that dress your mascot. Equip one as the active look.", cosmetics)}
      {section("Utility", "Consumables held in your pocket for a temporary edge; they never grant permanent XP or career progress.", consumables)}
    </div>
  );
}