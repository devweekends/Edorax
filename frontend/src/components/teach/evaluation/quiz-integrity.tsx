"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  CameraOff,
  ChevronDown,
  ImageOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { IntegrityReview } from "./integrity-review";
import {
  INTEGRITY_CAMERA_LABELS,
  INTEGRITY_EVENT_LABELS,
  INTEGRITY_EVENT_TYPES,
  INTEGRITY_LIMITS,
  INTEGRITY_ONLINE_WINDOW_MS,
  isIntegrityFlag,
  type IntegrityAttemptDetail,
  type IntegrityAttemptSummary,
} from "@/shared/api/integrity";

// Mentor-only view of quiz integrity signals. Learners never load this: their
// API returns only the count on their own badge.

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function seconds(ms: unknown): string | null {
  return typeof ms === "number" && Number.isFinite(ms)
    ? `${Math.max(1, Math.round(ms / 1000))} s`
    : null;
}

function describe(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const parts: string[] = [];
  const away = seconds(meta.awayMs);
  if (away) parts.push(`away ${away}`);
  const out = seconds(meta.outMs);
  if (out) parts.push(`outside ${out}`);
  if (meta.closed === true) parts.push("page closed while away");
  if (typeof meta.combo === "string") parts.push(meta.combo);
  if (meta.via === "drop") parts.push("dragged text in");
  if (typeof meta.reason === "string") {
    const reasons: Record<string, string> = {
      declined: "learner chose no camera",
      learner: "learner turned it off",
      denied: "browser permission denied",
      "no-camera": "no camera found",
      stopped: "camera stopped",
      unsupported: "browser has no camera support",
      error: "camera error",
    };
    parts.push(reasons[meta.reason] ?? meta.reason);
  }
  if (
    typeof meta.elapsedMs === "number" &&
    typeof meta.questions === "number"
  ) {
    parts.push(
      `${meta.questions} ${meta.questions === 1 ? "question" : "questions"} in ${seconds(meta.elapsedMs)}`,
    );
  }
  return parts.length ? parts.join(", ") : null;
}

function FlagChips({ attempt }: { attempt: IntegrityAttemptSummary }) {
  const flags = INTEGRITY_EVENT_TYPES.filter(
    (type) => isIntegrityFlag(type) && attempt.counts[type],
  );
  if (!flags.length)
    return (
      <p className="text-xs text-muted-foreground">No flags in this attempt.</p>
    );
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Flags">
      {flags.map((type) => (
        <li
          key={type}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
        >
          {INTEGRITY_EVENT_LABELS[type]}
          <span className="font-mono tabular-nums">{attempt.counts[type]}</span>
        </li>
      ))}
    </ul>
  );
}

function AttemptDetail({
  detail,
  onRefresh,
  refreshing,
}: {
  detail: IntegrityAttemptDetail;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="mt-3 space-y-4 border-t pt-3">
      {detail.snapshots.length ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Camera photos ({detail.snapshots.length})
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Private links that stop working after 10 minutes. Reload to see
                them again.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                aria-hidden
              />
              Reload photos
            </Button>
          </div>
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {detail.snapshots.map((snapshot) => (
              <li key={snapshot.id} className="shrink-0 text-center">
                {snapshot.url ? (
                  <a
                    href={snapshot.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived API link; next/image would cache it */}
                    <img
                      src={snapshot.url}
                      alt={`Camera photo at ${new Date(snapshot.takenAt).toLocaleTimeString()}`}
                      width={96}
                      height={72}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-[72px] w-24 rounded-md border object-cover"
                    />
                  </a>
                ) : (
                  <span className="flex h-[72px] w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[10px] text-muted-foreground">
                    <ImageOff className="size-4" aria-hidden />
                    Deleted after {INTEGRITY_LIMITS.retentionDays} days
                  </span>
                )}
                <span className="mt-1 block font-mono text-[10px] tabular-nums text-muted-foreground">
                  {new Date(snapshot.takenAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline ({detail.events.length})
        </h4>
        {detail.events.length ? (
          <ol className="mt-2 max-h-72 divide-y overflow-y-auto rounded-lg border bg-background text-sm">
            {detail.events.map((event) => {
              const note = describe(event.meta);
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5"
                >
                  <time
                    dateTime={event.at}
                    className="font-mono text-xs tabular-nums text-muted-foreground"
                  >
                    {new Date(event.at).toLocaleTimeString()}
                  </time>
                  <span
                    className={cn(
                      isIntegrityFlag(event.type)
                        ? "font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {INTEGRITY_EVENT_LABELS[event.type]}
                  </span>
                  {note ? (
                    <span className="text-xs text-muted-foreground">
                      {note}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing was noted.
          </p>
        )}
        {detail.droppedEvents > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {detail.droppedEvents} more events were not stored (limit{" "}
            {INTEGRITY_LIMITS.eventsPerAttempt} per attempt).
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AttemptRow({
  attempt,
  showChapter,
}: {
  attempt: IntegrityAttemptSummary;
  showChapter: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<IntegrityAttemptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      setDetail(
        await apiFetch<IntegrityAttemptDetail>(
          `/api/v1/teach/integrity/attempts/${encodeURIComponent(attempt.id)}`,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load this attempt.",
      );
    } finally {
      setLoading(false);
    }
  };

  // While the details are open they follow the live attempt: a new note, a new photo or a camera
  // change re-reads the timeline, so it is never behind the counters above it.
  useEffect(() => {
    if (open) void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the real counters move
  }, [attempt.flagCount, attempt.snapshotCount, attempt.cameraStatus]);

  const now = useNow(5_000);
  const online =
    attempt.online &&
    now - Date.parse(attempt.lastSeenAt) < INTEGRITY_ONLINE_WINDOW_MS;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) void load();
  };

  const cameraUsed = attempt.cameraStatus !== "NOT_REQUESTED";
  return (
    <li className="rounded-xl border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {showChapter ? `${attempt.chapterTitle} · ` : ""}Attempt{" "}
            {attempt.attempt}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(attempt.startedAt).toLocaleString()} to{" "}
            {new Date(attempt.lastSeenAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="gap-1.5"
            title={
              online
                ? "Reported in during the last few seconds"
                : "No report in the last few seconds"
            }
          >
            <span
              className={cn(
                "size-2 rounded-full",
                online ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            {online ? "Online now" : "Offline"}
          </Badge>
          <Badge
            variant={attempt.flagCount ? "secondary" : "outline"}
            className="gap-1"
          >
            {attempt.flagCount ? (
              <ShieldAlert aria-hidden />
            ) : (
              <ShieldCheck aria-hidden />
            )}
            {attempt.flagCount} {attempt.flagCount === 1 ? "flag" : "flags"}
          </Badge>
          {cameraUsed ? (
            <Badge
              variant="outline"
              className="gap-1"
              title={INTEGRITY_CAMERA_LABELS[attempt.cameraStatus]}
            >
              {attempt.cameraStatus === "ON" ? (
                <Camera aria-hidden />
              ) : (
                <CameraOff aria-hidden />
              )}
              {attempt.cameraStatus === "ON"
                ? `${attempt.snapshotCount} photos`
                : "Camera off"}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-2">
        <FlagChips attempt={attempt} />
      </div>
      {/* Review section */}
      {attempt.flagCount > 0 || attempt.review ? (
        <IntegrityReview attempt={attempt} />
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={toggle}
        aria-expanded={open}
        className="mt-2 -ml-2 gap-1"
      >
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
        {open ? "Hide details" : "Show timeline and photos"}
      </Button>
      {open ? (
        loading && !detail ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : detail ? (
          <AttemptDetail
            detail={detail}
            onRefresh={() => void load()}
            refreshing={loading}
          />
        ) : null
      ) : null}
    </li>
  );
}

export function QuizIntegrity({
  attempts,
  showChapter = true,
  id = "quiz-integrity",
  live,
}: {
  attempts: IntegrityAttemptSummary[];
  showChapter?: boolean;
  id?: string;
  /** Present when the list is kept live. Shows whether pushes are flowing. */
  live?: { connected: boolean; updatedAt: number | null };
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Quiz integrity
        </p>
        {live ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            role="status"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                live.connected ? "bg-emerald-500" : "bg-amber-500",
              )}
              aria-hidden
            />
            {live.connected ? "Live updates on" : "Refreshing every 4 s"}
            {live.updatedAt
              ? ` · updated ${new Date(live.updatedAt).toLocaleTimeString()}`
              : ""}
          </span>
        ) : null}
      </div>
      <h2 id={`${id}-title`} className="mt-1 text-lg font-semibold">
        Proctoring signals
      </h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        Signals, not proof. A weak connection, a phone notification or a shared
        device can cause them. Nothing failed or ended the quiz. Talk with the
        learner before you decide. Screenshot keys are only seen when the
        browser gets them, and the web cannot block screenshots.
      </p>
      {attempts.length ? (
        <ul className="mt-4 space-y-3">
          {attempts.map((attempt) => (
            <AttemptRow
              key={attempt.id}
              attempt={attempt}
              showChapter={showChapter}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No proctored quiz attempts yet.
        </p>
      )}
    </section>
  );
}
