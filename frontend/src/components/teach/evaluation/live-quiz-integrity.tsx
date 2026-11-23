"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useRealtimeConnected, useRealtimeEvent } from "@/lib/realtime";
import type { IntegrityAttemptSummary } from "@/shared/api/integrity";
import { QuizIntegrity } from "./quiz-integrity";

// The mentor's integrity tab, kept live. The page loads the real attempts once, then every change a
// learner makes reaches this panel two ways: a push over the shared realtime stream, and a plain
// re-read of the same API. The re-read is the safety net: it runs every few seconds while the
// stream is down, every twenty seconds while it is up, and whenever this tab comes back into view.

const POLL_DOWN_MS = 4_000;
const POLL_UP_MS = 20_000;

function mergeAttempt(
  list: IntegrityAttemptSummary[],
  next: IntegrityAttemptSummary,
): IntegrityAttemptSummary[] {
  const exists = list.some((item) => item.id === next.id);
  const merged = exists
    ? list.map((item) => (item.id === next.id ? next : item))
    : [next, ...list];
  return merged.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function LiveQuizIntegrity({
  attempts,
  courseSlug,
  enrollmentId,
  showChapter = true,
}: {
  attempts: IntegrityAttemptSummary[];
  courseSlug: string;
  enrollmentId: string;
  showChapter?: boolean;
}) {
  const [items, setItems] = useState(attempts);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const connected = useRealtimeConnected();

  useEffect(() => {
    setItems(attempts);
  }, [attempts]);

  useRealtimeEvent("integrity-live", (update) => {
    if (update.enrollmentId !== enrollmentId) return;
    setItems((current) => mergeAttempt(current, update.attempt));
    setUpdatedAt(Date.now());
  });

  const refresh = useCallback(async () => {
    try {
      const fresh = await apiFetch<IntegrityAttemptSummary[]>(
        `/api/v1/teach/courses/${encodeURIComponent(courseSlug)}/mentees/${encodeURIComponent(enrollmentId)}/integrity`,
      );
      setItems(fresh);
      setUpdatedAt(Date.now());
    } catch {
      /* A failed re-read keeps what is on screen. The next one tries again. */
    }
  }, [courseSlug, enrollmentId]);

  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      connected ? POLL_UP_MS : POLL_DOWN_MS,
    );
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, refresh]);

  return (
    <QuizIntegrity
      attempts={items}
      showChapter={showChapter}
      live={{ connected, updatedAt }}
    />
  );
}
