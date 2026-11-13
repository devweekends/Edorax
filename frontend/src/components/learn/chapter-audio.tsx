"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { NARRATION_SPEEDS, formatClock, formatListenMinutes, formatMegabytes, formatSpeed, resumePosition } from "@/lib/narration-format";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "playing" | "paused" | "error";

function readSaved(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeSaved(key: string, seconds: number) {
  try {
    window.localStorage.setItem(key, String(Math.floor(seconds)));
  } catch {
    // Remembering where you stopped is a convenience; the player works without it.
  }
}

/**
 * Listen-along audio for a chapter. Nothing is downloaded until the learner presses play,
 * so reading on a slow or metered connection costs nothing extra.
 */
export function ChapterAudio({ src, minutes, bytes, title, className }: { src: string; minutes: number; bytes: number; title: string; className?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const storageKey = `buildment:narration:${src}`;

  useEffect(() => {
    const element = audio.current;
    if (element) element.playbackRate = speed;
  }, [speed]);

  function toggle() {
    const element = audio.current;
    if (!element) return;
    if (status === "playing" || status === "loading") {
      element.pause();
      return;
    }
    setStatus("loading");
    element.playbackRate = speed;
    void element.play().catch(() => setStatus("error"));
  }

  /** Sets the speed the browser actually accepts, so the drop-down never shows a speed that is not playing. */
  function changeSpeed(requested: number) {
    const element = audio.current;
    if (element) {
      try {
        element.playbackRate = requested;
      } catch {
        // A browser that refuses a very fast rate keeps its current one.
      }
      setSpeed(element.playbackRate);
      return;
    }
    setSpeed(requested);
  }

  function seek(value: number) {
    const element = audio.current;
    if (!element || !duration) return;
    element.currentTime = value;
    setTime(value);
  }

  const label = status === "playing" ? "Pause" : status === "loading" ? "Loading" : "Play";

  return (
    <section
      id="listen"
      aria-label="Listen to this chapter"
      className={cn("scroll-mt-24 rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-5", className)}
    >
      <audio
        ref={audio}
        data-narration=""
        src={src}
        preload="none"
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          setDuration(element.duration);
          const start = resumePosition(readSaved(storageKey), element.duration);
          if (start > 0) {
            element.currentTime = start;
            setTime(start);
          }
        }}
        onPlaying={() => setStatus("playing")}
        onPause={() => setStatus("paused")}
        onWaiting={() => setStatus("loading")}
        onError={() => setStatus("error")}
        onEnded={() => {
          setStatus("paused");
          writeSaved(storageKey, 0);
        }}
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          setTime(now);
          if (Math.abs(now - lastSaved.current) >= 5) {
            lastSaved.current = now;
            writeSaved(storageKey, now);
          }
        }}
      />
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={`${label}: ${title}`}
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          {status === "playing" ? <Pause className="size-6" aria-hidden /> : <Play className="size-6 translate-x-px" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-foreground">Listen to this chapter</p>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {status === "error"
              ? "The audio did not load. Check your connection and press play to try again."
              : status === "loading"
                ? "Loading the audio..."
                : duration > 0
                  ? `${formatClock(time)} of ${formatClock(duration)}`
                  : `${formatListenMinutes(minutes)}. Nothing downloads until you press play.`}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="w-10 tabular-nums">{formatClock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={1}
          value={Math.min(time, duration || 1)}
          disabled={!duration}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Audio position"
          className={cn("h-6 min-w-0 flex-1 cursor-pointer accent-primary", !duration && "opacity-40")}
        />
        <span className="w-10 text-right tabular-nums">{duration > 0 ? formatClock(duration) : "--:--"}</span>
      </div>
      <div className="mt-4 flex gap-3">
        <select
          value={speed}
          onChange={(event) => changeSpeed(Number(event.target.value))}
          aria-label="Playback speed"
          className="min-h-11 shrink-0 cursor-pointer rounded-md border-2 border-foreground bg-card px-3 text-[15px] font-bold tabular-nums text-foreground outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          {NARRATION_SPEEDS.map((option) => (
            <option key={option} value={option}>
              {formatSpeed(option)}
            </option>
          ))}
        </select>
        <a
          href={src}
          download
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border-2 border-foreground px-3 text-[15px] font-bold text-foreground outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          <Download className="size-5" aria-hidden />
          Save for offline, {formatMegabytes(bytes)}
        </a>
      </div>
    </section>
  );
}
