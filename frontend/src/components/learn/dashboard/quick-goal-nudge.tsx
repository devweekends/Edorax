"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Target } from "lucide-react";
import { setWeeklyGoal } from "@/server/actions/weekly-goal";
import { Button } from "@/components/ui/button";
import { useBrowserStorage, useHydrated } from "@/lib/use-browser-storage";

const DISMISSED_KEY = "edorax:quick-goal-nudge:dismissed:v1";

const PACE_OPTIONS = [
  { minutes: 5, label: "5 min / day", hint: "Light" },
  { minutes: 10, label: "10 min / day", hint: "Steady" },
  { minutes: 20, label: "20 min / day", hint: "Strong" },
] as const;

/**
 * Offered gently after a learner completes their first chapter, when they have not set a study
 * goal yet. One tap saves a daily minute goal; "Not now" dismisses it without nagging.
 */
export function QuickGoalNudge() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useBrowserStorage(DISMISSED_KEY, "0");
  const [savedMinutes, setSavedMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!hydrated || dismissed === "1") return null;

  function choosePace(minutes: number) {
    setError(null);
    startTransition(async () => {
      const result = await setWeeklyGoal({
        period: "DAILY",
        kind: "MINUTES",
        target: minutes,
        note: "",
        dailyReminder: false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedMinutes(minutes);
      router.refresh();
    });
  }

  if (savedMinutes !== null) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border bg-card p-5" role="status">
        <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          Daily pace saved: {savedMinutes} minutes a day. You can change or remove it anytime.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="quick-goal-nudge-heading"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Target className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="quick-goal-nudge-heading" className="text-base font-semibold tracking-tight">
              Nice start. Want a gentle daily pace?
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pick how long you want to study on most days. You can change or turn it off anytime.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setDismissed("1")}
          className="self-start sm:self-center"
        >
          Not now
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {PACE_OPTIONS.map((option) => (
          <Button
            key={option.minutes}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => choosePace(option.minutes)}
            className="h-auto min-h-11 justify-between rounded-xl px-4 py-3 text-left"
          >
            <span className="font-semibold text-foreground">{option.label}</span>
            <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
          </Button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}
