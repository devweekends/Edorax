"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  STUDY_ACTIVITY_EVENTS,
  STUDY_INACTIVITY_MS,
  shouldAutoResumeStudyTimer,
  shouldListenForStudyActivity,
} from "@/lib/study-session-activity";

export type StudyClockStatus = "idle" | "running" | "paused";
export type StudyPauseReason = "manual" | "inactive" | "hidden" | null;

const HEARTBEAT_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 15_000;

type SessionPayload = {
  status?: StudyClockStatus;
  activeSeconds?: number;
  chapterTimeSpentSeconds?: number;
  creditedSeconds?: number;
  sessionActiveSeconds?: number | null;
};

function tabIsVisible(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

async function postSession(
  chapterId: string,
  action: "start" | "pause" | "resume" | "end",
  deltaSeconds?: number,
  keepalive = false,
): Promise<SessionPayload> {
  return apiFetch<SessionPayload>("/api/v1/progress/session", {
    method: "POST",
    json: {
      chapterId,
      action,
      ...(deltaSeconds && deltaSeconds > 0
        ? { deltaSeconds: Math.min(deltaSeconds, 20) }
        : {}),
    },
    keepalive,
  });
}

function isTemporaryFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "API_UNAVAILABLE" || [502, 503, 504].includes(error.status))
  );
}

export function useStudySession(chapterId: string) {
  const [status, setStatus] = useState<StudyClockStatus>("idle");
  const [syncedSession, setSyncedSession] = useState(0);
  const [syncedChapter, setSyncedChapter] = useState(0);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pauseReason, setPauseReason] = useState<StudyPauseReason>(null);

  const [previousChapterId, setPreviousChapterId] = useState(chapterId);
  if (chapterId !== previousChapterId) {
    setPreviousChapterId(chapterId);
    setStatus("idle");
    setSyncedSession(0);
    setSyncedChapter(0);
    setPendingSeconds(0);
    setPauseReason(null);
  }

  const statusRef = useRef<StudyClockStatus>("idle");
  const pauseReasonRef = useRef<StudyPauseReason>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef(0);
  const chapterRef = useRef(chapterId);
  const requestEpoch = useRef(0);
  const lastActivityAt = useRef(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    pauseReasonRef.current = pauseReason;
  }, [pauseReason]);

  const apply = useCallback((data: SessionPayload | null, keepPending = false) => {
    if (!data) return;
    if (data.status) {
      statusRef.current = data.status;
      setStatus(data.status);
    }
    if (typeof data.activeSeconds === "number") setSyncedSession(data.activeSeconds);
    if (typeof data.chapterTimeSpentSeconds === "number") {
      setSyncedChapter(data.chapterTimeSpentSeconds);
    }
    if (!keepPending) {
      pendingRef.current = 0;
      setPendingSeconds(0);
    }
  }, []);

  const flushDelta = useCallback(() => {
    const sent = pendingRef.current;
    pendingRef.current = 0;
    setPendingSeconds(0);
    return sent;
  }, []);

  useEffect(() => {
    chapterRef.current = chapterId;
    const epoch = ++requestEpoch.current;
    statusRef.current = "idle";
    pendingRef.current = 0;
    let cancelled = false;
    let retryTimer: number | undefined;
    let failures = 0;

    const load = async () => {
      try {
        const data = await apiFetch<SessionPayload>(
          `/api/v1/progress/session?chapterId=${encodeURIComponent(chapterId)}`,
        );
        if (cancelled || requestEpoch.current !== epoch) return;
        apply(data);
        if ((data.status ?? "idle") === "idle" && tabIsVisible()) {
          const started = await postSession(chapterId, "start");
          if (cancelled || requestEpoch.current !== epoch) return;
          apply(started);
        }
        failures = 0;
      } catch (error) {
        if (cancelled || requestEpoch.current !== epoch) return;
        if (!isTemporaryFailure(error)) {
          console.warn("Study timer could not start", error);
          return;
        }
        // A dev API restart or short proxy outage should not strand the clock at 00:00.
        const delay = Math.min(
          1000 * 2 ** Math.min(failures++, 4),
          MAX_RECONNECT_DELAY_MS,
        );
        retryTimer = window.setTimeout(() => void load(), delay);
      }
    };
    void load();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      const leaving = chapterRef.current;
      const current = statusRef.current;
      if (current === "idle") return;
      const delta = current === "running" ? pendingRef.current : 0;
      pendingRef.current = 0;
      void postSession(leaving, "end", delta, true).catch(() => {});
    };
  }, [chapterId, apply]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => {
      if (!tabIsVisible()) return;
      pendingRef.current += 1;
      setPendingSeconds(pendingRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;

    const beat = async () => {
      if (!tabIsVisible()) return;
      const sent = flushDelta();
      if (sent <= 0) return;
      try {
        const data = await apiFetch<SessionPayload>(
          "/api/v1/progress/heartbeat",
          {
            method: "POST",
            json: {
              chapterId: chapterRef.current,
              deltaSeconds: Math.min(sent, 20),
            },
          },
        );
        if (typeof data.sessionActiveSeconds === "number") {
          setSyncedSession(data.sessionActiveSeconds);
        }
        if (typeof data.chapterTimeSpentSeconds === "number") {
          setSyncedChapter(data.chapterTimeSpentSeconds);
        }
      } catch {
        pendingRef.current += sent;
        setPendingSeconds(pendingRef.current);
      }
    };

    const id = window.setInterval(() => void beat(), 15_000);
    return () => window.clearInterval(id);
  }, [status, flushDelta]);

  useEffect(() => {
    const onHide = () => {
      if (statusRef.current !== "running") return;
      pauseReasonRef.current = "hidden";
      setPauseReason("hidden");
      const sent = pendingRef.current;
      pendingRef.current = 0;
      setPendingSeconds(0);
      setStatus("paused");
      statusRef.current = "paused";
      void postSession(chapterRef.current, "pause", sent, true).catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const run = useCallback(
    async (
      action: "start" | "pause" | "resume" | "end",
      reason?: StudyPauseReason,
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      // An explicit Start can race a reconnect. Both starts are safe and the
      // reconnect must remain active if this click also loses its connection.
      if (action !== "start" || statusRef.current !== "idle")
        requestEpoch.current += 1;
      const delta = action === "pause" || action === "end" ? flushDelta() : 0;
      try {
        const data = await postSession(chapterRef.current, action, delta);
        apply(data);
        if (action === "start" || action === "resume") {
          lastActivityAt.current = Date.now();
          pauseReasonRef.current = null;
          setPauseReason(null);
        } else if (action === "pause") {
          const nextReason = reason ?? "manual";
          pauseReasonRef.current = nextReason;
          setPauseReason(nextReason);
        } else if (action === "end") {
          pauseReasonRef.current = null;
          setPauseReason(null);
        }
      } catch (error) {
        // Mutations that carry elapsed time must not be replayed blindly: the API
        // might have committed them before the connection was interrupted.
        if (isTemporaryFailure(error))
          console.warn("Study timer temporarily unavailable. Try again.");
        else console.warn("Study timer request failed", error);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [apply, flushDelta],
  );

  useEffect(() => {
    if (!shouldListenForStudyActivity(status, pauseReason)) return;

    if (status === "running") {
      lastActivityAt.current = Date.now();
    }

    const onActivity = () => {
      if (document.visibilityState !== "visible") return;
      lastActivityAt.current = Date.now();
      if (shouldAutoResumeStudyTimer(statusRef.current, pauseReasonRef.current)) {
        void run("resume");
      }
    };

    for (const event of STUDY_ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { capture: true, passive: true });
    }
    window.addEventListener("focus", onActivity);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onActivity();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const inactivityCheck =
      status === "running"
        ? window.setInterval(() => {
            if (Date.now() - lastActivityAt.current >= STUDY_INACTIVITY_MS) {
              void run("pause", "inactive");
            }
          }, HEARTBEAT_MS)
        : undefined;

    return () => {
      if (inactivityCheck !== undefined) window.clearInterval(inactivityCheck);
      for (const event of STUDY_ACTIVITY_EVENTS) {
        document.removeEventListener(event, onActivity, true);
      }
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, pauseReason, run]);

  return {
    status,
    busy,
    pauseReason,
    sessionSeconds: syncedSession + pendingSeconds,
    chapterTotalSeconds: syncedChapter + pendingSeconds,
    start: () => void run("start"),
    pause: () => void run("pause", "manual"),
    resume: () => void run("resume"),
    stop: () => void run("end"),
  };
}
