"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Flame, Share2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { playFeedback } from "@/lib/sound-feedback";
import type { StreakMilestone, StreakPopupDayView, StreakPopupView } from "@/shared/api/learner";
import { StreakFlame } from "@/components/learn/streak-flame";
import { StreakMilestoneCelebration } from "@/components/learn/streak-milestone-celebration";
import { acknowledgeStreakMilestone } from "@/server/actions/weekly-goal";
import { streakDaySummary } from "@/shared/lib/streak-popup";

const STORAGE_PREFIX = "buildment:streak-popup-seen:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readSeenLocally(userId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function writeSeenLocally(userId: string, day: string) {
  try {
    window.localStorage.setItem(storageKey(userId), day);
  } catch {
    /* Optional preference. */
  }
}

async function shareStreak(streakCount: number) {
  const title = streakCount === 1 ? "1 day learning streak" : `${streakCount} day learning streak`;
  const text = streakCount <= 0
    ? "I'm learning on Edorax."
    : `I'm on a ${streakCount}-day learning streak on Edorax!`;
  const url = typeof window !== "undefined" ? window.location.origin : "https://edorax.com";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
  } catch {
    /* Share is best-effort. */
  }
}

function FlameRings({ days, className }: { days: number; className?: string }) {
  return (
    <div className={cn("relative mx-auto flex size-28 items-center justify-center", className)} aria-hidden>
      <span className="absolute inset-0 rounded-full border border-orange-500/20 motion-safe:animate-[streak-ring_2.4s_ease-out_infinite] motion-reduce:animate-none" />
      <span className="absolute inset-3 rounded-full border border-orange-500/35 motion-safe:animate-[streak-ring_2.4s_ease-out_infinite] motion-safe:[animation-delay:0.35s] motion-reduce:animate-none" />
      <span className="absolute inset-6 rounded-full bg-orange-500/10" />
      <span className="relative flex size-14 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-orange-500/20">
        <StreakFlame days={days} className="size-9" />
      </span>
    </div>
  );
}

function DayCell({
  day,
  isToday,
  todayActive,
  selected,
  onSelect,
}: {
  day: StreakPopupDayView;
  isToday: boolean;
  todayActive: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isInactive = day.status === "inactive" && !isToday;
  const label = isToday
    ? `${day.weekday}, today${todayActive ? ", counted" : ", not counted yet"}`
    : day.status === "completed"
      ? `${day.weekday}, completed`
      : isInactive
        ? `${day.weekday}, before you joined`
        : `${day.weekday}, missed`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-xl p-1 outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
        isToday && "bg-primary/5 px-1.5"
      )}
    >
      <span
        className={cn(
          "text-[0.6875rem] font-medium uppercase tracking-wide transition-colors",
          isToday ? "font-bold text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {day.weekday}
      </span>

      <div className="relative flex items-center justify-center">
        {/* Animated radiant aura rings for the current day streak */}
        {isToday ? (
          <>
            <span
              className="absolute -inset-1 rounded-full border border-primary/45 motion-safe:animate-[streak-today-halo_2.2s_ease-out_infinite] motion-reduce:animate-none"
              aria-hidden
            />
            <span
              className="absolute -inset-0.5 rounded-full bg-primary/20 motion-safe:animate-[streak-today-pulse_2s_ease-in-out_infinite] motion-reduce:animate-none"
              aria-hidden
            />
          </>
        ) : null}

        <span
          className={cn(
            "relative flex size-9 items-center justify-center rounded-full border-2 transition-all",
            day.status === "completed" && !isToday && "border-primary bg-primary text-primary-foreground",
            day.status === "missed" && "border-border bg-muted/40 text-muted-foreground",
            isInactive && "border-dashed border-border/70 bg-muted/20 text-muted-foreground/60",
            isToday && todayActive && "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25",
            isToday && !todayActive && "border-primary bg-card text-primary shadow-sm shadow-primary/20",
            selected && "ring-2 ring-ring ring-offset-2 ring-offset-card"
          )}
        >
          {day.status === "completed" && !isToday ? (
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
          ) : isToday ? (
            <Flame
              className={cn(
                "size-4.5 motion-safe:animate-[streak-flame-flicker_1.4s_ease-in-out_infinite] motion-reduce:animate-none",
                todayActive ? "fill-current" : ""
              )}
              strokeWidth={2.25}
              aria-hidden
            />
          ) : isInactive ? (
            <span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />
          ) : (
            <X className="size-3.5" strokeWidth={2} aria-hidden />
          )}
        </span>
      </div>

      <span
        className={cn(
          "text-[9px] font-bold uppercase tracking-wider transition-opacity",
          isToday ? "text-primary opacity-100" : "opacity-0 select-none"
        )}
        aria-hidden
      >
        {isToday ? "Today" : "·"}
      </span>
    </button>
  );
}

export function DailyStreakPopup({ userId }: { userId: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [payload, setPayload] = useState<StreakPopupView | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  // A milestone reached on an earlier day. It is celebrated now, instead of the daily popup.
  const [milestone, setMilestone] = useState<StreakMilestone | null>(null);

  useEffect(() => {
    let cancelled = false;
    const localSeen = readSeenLocally(userId);

    void (async () => {
      try {
        const data = await apiFetch<StreakPopupView>("/api/v1/learner/streak-popup");
        if (cancelled) return;
        if (data.milestone) {
          setPayload(data);
          setMilestone(data.milestone);
          return;
        }
        if (localSeen === data.today || !data.show) {
          setPayload(data);
          return;
        }
        setPayload(data);
        setSelectedDay(data.today);
        setOpen(true);
      } catch {
        /* Popup is non-critical; skip on API failure. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Never stack the streak popup on top of another open dialog (e.g. account setup).
      const otherModalOpen = [...document.querySelectorAll("dialog[open], [role='dialog'][aria-modal='true']")].some(
        (el) => el !== dialog
      );
      if (otherModalOpen) return;
      dialog.showModal();
      if ((payload?.streakCount ?? 0) > 0) {
        try {
          playFeedback("celebration");
        } catch {
          /* Sound feedback is best effort */
        }
      }
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open, payload?.streakCount]);

  async function dismiss() {
    const today = payload?.today;
    setOpen(false);
    if (today) writeSeenLocally(userId, today);
    try {
      await apiFetch<{ seenOn: string }>("/api/v1/learner/streak-popup/dismiss", { method: "POST" });
    } catch {
      /* Local dismiss still keeps it hidden this session/day. */
    }
  }

  function closeMilestone() {
    const reached = milestone;
    setMilestone(null);
    if (reached) void acknowledgeStreakMilestone(reached);
    // The celebration takes the place of today's popup, so today's popup is done too.
    void dismiss();
  }

  async function onShare() {
    const count = payload?.streakCount ?? 0;
    await shareStreak(count);
    setShareNote("Streak link ready to share");
    window.setTimeout(() => setShareNote(null), 2500);
  }

  const selected = payload?.week.find((day) => day.day === selectedDay) ?? null;
  const subtitle = payload?.todayActive
    ? "Today is counted. See you tomorrow."
    : "Your streak counts by itself. Read a lesson or do an exercise today, no button needed.";
  const primaryLabel = "Continue";
  const streakLabel =
    !payload || payload.streakCount <= 0
      ? "Start your streak"
      : payload.streakCount === 1
        ? "1 day streak"
        : `${payload.streakCount} day streak`;

  return (
    <>
      {milestone ? <StreakMilestoneCelebration days={milestone} open onClose={closeMilestone} /> : null}
      <style>{`
        @keyframes streak-ring {
          0% { transform: scale(0.92); opacity: 0.85; }
          70% { transform: scale(1.08); opacity: 0; }
          100% { transform: scale(1.08); opacity: 0; }
        }
        @keyframes streak-today-halo {
          0% { transform: scale(0.9); opacity: 0.8; }
          60% { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes streak-today-pulse {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.12); opacity: 0.6; }
        }
        @keyframes streak-flame-flicker {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.16) rotate(-5deg); }
          50% { transform: scale(1.08) rotate(3deg); }
          75% { transform: scale(1.14) rotate(-3deg); }
        }
      `}</style>
      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          void dismiss();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-foreground/35 sm:p-7"
      >
        {open && payload ? (
          <div className="flex flex-col items-center text-center">
            <FlameRings days={payload.streakCount} />
            <h2 id={titleId} className="mt-5 font-heading text-3xl font-semibold tracking-tight tabular-nums">
              {streakLabel}
            </h2>
            <p id={descriptionId} className="mt-2 max-w-[18rem] text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>

            <div className="mt-6 flex w-full items-start justify-between gap-0.5 px-0.5" role="list" aria-label="Last seven days">
              {payload.week.map((day) => (
                <div key={day.day} role="listitem">
                  <DayCell
                    day={day}
                    isToday={day.status === "today" || day.day === payload.today}
                    todayActive={payload.todayActive}
                    selected={selectedDay === day.day}
                    onSelect={() => {
                      setSelectedDay(day.day);
                      try {
                        playFeedback("tick");
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>
              ))}
            </div>

            <p className="mt-3 min-h-10 text-xs leading-5 text-muted-foreground" aria-live="polite">
              {selected && payload
                ? streakDaySummary(selected, payload.today)
                : "Tap a day to see how it went"}
            </p>

            <Button
              type="button"
              variant="outline"
              className="mt-4 h-12 w-full rounded-full border-primary text-primary hover:bg-primary/10"
              onClick={() => void dismiss()}
              autoFocus
            >
              <Zap className="size-4" aria-hidden />
              {primaryLabel}
            </Button>

            {payload.streakCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-11 w-full text-muted-foreground hover:text-foreground"
                onClick={() => void onShare()}
                aria-label="Share streak"
              >
                <Share2 className="size-4" aria-hidden />
                Share streak
              </Button>
            ) : null}
            {shareNote ? (
              <p className="mt-1 text-xs text-muted-foreground" role="status">
                {shareNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
