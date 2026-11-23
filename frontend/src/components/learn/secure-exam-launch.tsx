"use client";

import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { SecureLaunch } from "@/shared/api/integrity";

// Secure exams run in the Edorax desktop app. This button asks the server for a one-time link
// (good for two minutes, once) and hands it to the app. The website never shows the exam itself.

export function SecureExamLaunch({ chapterId }: { chapterId: string }) {
  const [state, setState] = useState<"idle" | "opening" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setState("opening");
    setError(null);
    try {
      const launch = await apiFetch<SecureLaunch>(
        `/api/v1/chapters/${encodeURIComponent(chapterId)}/secure-launch`,
        { method: "POST" },
      );
      window.location.href = launch.deepLink;
      setState("sent");
    } catch (cause) {
      setState("idle");
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not start the exam. Try again.",
      );
    }
  };

  return (
    <section
      aria-labelledby="secure-exam-title"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <MonitorSmartphone
          className="mt-0.5 size-5 text-muted-foreground"
          aria-hidden
        />
        <div>
          <h2 id="secure-exam-title" className="text-lg font-semibold">
            This exam opens in the Edorax desktop app
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            The app checks your computer first and shows you exactly what is
            monitored before anything starts. You can leave at any time. Your
            mentor reviews anything unusual and makes the final call.
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => void start()}
            disabled={state === "opening"}
          >
            {state === "opening" ? "Opening…" : "Start exam in the app"}
          </Button>
          {state === "sent" ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              If nothing opened, install or open the Edorax desktop app, then
              press the button again. The link works once and expires after two
              minutes.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
