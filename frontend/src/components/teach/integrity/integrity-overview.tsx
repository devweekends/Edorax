"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { useRealtimeConnected, useRealtimeEvent } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { LearnerCompare } from "./learner-compare";
import {
  INTEGRITY_MODE_LABELS,
  INTEGRITY_ONLINE_WINDOW_MS,
  INTEGRITY_REVIEW_LABELS,
  type IntegrityLearnerAttempt,
  type IntegrityOverview,
} from "@/shared/api/integrity";

// The course-wide board. Every row is a real attempt read from the database. Rows change the moment
// a learner's app or page reports, and the board re-reads itself as a safety net, like the
// per-learner panel does.

const POLL_DOWN_MS = 4_000;
const POLL_UP_MS = 20_000;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes} min ago`
    : `${Math.round(minutes / 60)} h ago`;
}

function Row({
  attempt,
  courseSlug,
  now,
}: {
  attempt: IntegrityLearnerAttempt;
  courseSlug: string;
  now: number;
}) {
  const online =
    attempt.online &&
    now - Date.parse(attempt.lastSeenAt) < INTEGRITY_ONLINE_WINDOW_MS;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              "size-2 rounded-full",
              online ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <span className="truncate">{attempt.learner.name ?? "Learner"}</span>
          <span className="sr-only">{online ? "online" : "offline"}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {attempt.chapterTitle} · Attempt {attempt.attempt} ·{" "}
          {INTEGRITY_MODE_LABELS[attempt.mode]} ·{" "}
          {online ? "Online now" : `Last seen ${ago(attempt.lastSeenAt, now)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={attempt.flagCount ? "secondary" : "outline"}
          className="gap-1"
        >
          <ShieldAlert aria-hidden /> {attempt.flagCount}{" "}
          {attempt.flagCount === 1 ? "flag" : "flags"}
        </Badge>
        <Badge variant="outline">
          Priority {attempt.risk.level.toLowerCase()} ({attempt.risk.score})
        </Badge>
        {attempt.review ? (
          <Badge variant="outline">
            {INTEGRITY_REVIEW_LABELS[attempt.review.decision]}
          </Badge>
        ) : null}
        <Link
          href={`/courses/${courseSlug}/mentees/${attempt.enrollmentId}#integrity`}
          className="text-xs font-medium underline underline-offset-4"
        >
          Open evaluation
        </Link>
      </div>
    </li>
  );
}

function SetupCheck({
  overview,
  connected,
  now,
}: {
  overview: IntegrityOverview;
  connected: boolean;
  now: number;
}) {
  const { health, totals } = overview;
  const last = health.lastEventAt ? `${ago(health.lastEventAt, now)}` : "never";
  const items: Array<{ ok: boolean | null; label: string }> = [
    {
      ok: connected,
      label: connected
        ? "Live connection to the server is open."
        : "Live connection is down. The board re-reads every 4 seconds instead.",
    },
    {
      ok: totals.attempts > 0,
      label:
        totals.attempts > 0
          ? `${totals.attempts} quiz ${totals.attempts === 1 ? "attempt has" : "attempts have"} reached this server for this course.`
          : "No quiz attempt has reached this server for this course yet.",
    },
    {
      ok: health.eventsLastHour > 0 ? true : null,
      label: `Notes received in the last hour: ${health.eventsLastHour}. Last note: ${last}.`,
    },
    {
      ok: health.cameraOn ? health.cameraAvailable : null,
      label: !health.cameraOn
        ? "Camera photos are off for this course."
        : health.cameraAvailable
          ? "Camera photos are on and this server can store them."
          : "Camera photos are on, but this server cannot store or sign them. Learners will not see the camera option.",
    },
  ];
  return (
    <section
      aria-labelledby="setup-title"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2 id="setup-title" className="text-lg font-semibold">
        Setup check
      </h2>
      <p className="text-sm text-muted-foreground">
        Real facts from this server, to explain a board that stays empty.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                item.ok === true
                  ? "bg-emerald-500"
                  : item.ok === false
                    ? "bg-amber-500"
                    : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      {totals.attempts === 0 ? (
        <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm leading-6">
          Learners are taking quizzes but nothing arrives? The desktop app may
          be connected to a different server than this website. The app shows
          &quot;Connected to server: …&quot; on the quiz start screen. It must
          be the same backend this site uses.
        </p>
      ) : null}
    </section>
  );
}

export function IntegrityOverviewBoard({
  initial,
  courseSlug,
}: {
  initial: IntegrityOverview;
  courseSlug: string;
}) {
  const [overview, setOverview] = useState(initial);
  const connected = useRealtimeConnected();
  const now = useNow(5_000);
  const pending = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(
        await apiFetch<IntegrityOverview>(
          `/api/v1/teach/courses/${encodeURIComponent(courseSlug)}/integrity/overview`,
        ),
      );
    } catch {
      /* Keep what is on screen and try again on the next tick. */
    }
  }, [courseSlug]);

  const refreshSoon = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      void refresh();
    }, 400);
  }, [refresh]);

  useRealtimeEvent("integrity-live", (update) => {
    if (update.courseId !== overview.course.id) return;
    const known = overview.live.some((row) => row.id === update.attempt.id);
    if (!known) return refreshSoon();
    // A known sitting updates in place, so the board moves without a round trip.
    setOverview((current) => ({
      ...current,
      live: current.live.map((row) =>
        row.id === update.attempt.id ? { ...row, ...update.attempt } : row,
      ),
    }));
    // A change in flags or the review decision can move a row in or out of the queue.
    refreshSoon();
  });

  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      connected ? POLL_UP_MS : POLL_DOWN_MS,
    );
    return () => window.clearInterval(timer);
  }, [connected, refresh]);

  const onlineCount = overview.live.filter(
    (row) =>
      row.online &&
      now - Date.parse(row.lastSeenAt) < INTEGRITY_ONLINE_WINDOW_MS,
  ).length;

  return (
    <div className="space-y-6">
      <SetupCheck overview={overview} connected={connected} now={now} />
      <section
        aria-labelledby="live-title"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="live-title" className="text-lg font-semibold">
              Quiz sittings
            </h2>
            <p className="text-sm text-muted-foreground">
              Attempts that reported in during the last 24 hours. Learners who
              are in a quiz right now show as online.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Activity aria-hidden />{" "}
            {connected ? "Live" : "Refreshing every 4 s"} · {onlineCount} online
          </Badge>
        </div>
        {overview.live.length ? (
          <ul className="mt-4 space-y-2">
            {overview.live.map((row) => (
              <Row
                key={row.id}
                attempt={row}
                courseSlug={courseSlug}
                now={now}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {overview.totals.attempts === 0
              ? "No quiz attempt has been opened in this course yet. This list fills in as soon as a learner starts a quiz."
              : `This course has ${overview.totals.attempts} quiz ${overview.totals.attempts === 1 ? "attempt" : "attempts"}, but none reported in during the last 24 hours. The latest was ${overview.totals.lastSeenAt ? new Date(overview.totals.lastSeenAt).toLocaleString() : "unknown"}.`}
          </p>
        )}
      </section>

      <section
        aria-labelledby="queue-title"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2 id="queue-title" className="text-lg font-semibold">
          Review queue
        </h2>
        <p className="text-sm text-muted-foreground">
          Attempts with notes worth a look, highest priority first. The priority
          only orders the list. You make the decision.
        </p>
        {overview.flagged.length ? (
          <ul className="mt-4 space-y-2">
            {overview.flagged.map((row) => (
              <Row
                key={row.id}
                attempt={row}
                courseSlug={courseSlug}
                now={now}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing needs review.
          </p>
        )}
      </section>

      <section
        aria-labelledby="similar-title"
        className="rounded-2xl border bg-card p-5 sm:p-6"
      >
        <h2 id="similar-title" className="text-lg font-semibold">
          Compare learners
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick a quiz, then two learners by name, and read their written answers
          side by side.
        </p>
        <LearnerCompare quizChapters={overview.quizChapters} />
      </section>
    </div>
  );
}
