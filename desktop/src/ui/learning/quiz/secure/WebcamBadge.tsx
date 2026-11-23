import { useEffect, useRef } from "react";
import type { WebcamState } from "./useWebcam";

/** A small mirror of the learner's camera with a clear on or off label. */
export function WebcamBadge({ stream, state }: { stream: MediaStream | null; state: WebcamState }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
  }, [stream]);
  if (state === "off") return null;
  const on = state === "on";
  return (
    <span className="flex items-center gap-2" role="status">
      <span className="relative h-9 w-12 overflow-hidden rounded-md border border-border bg-black/80">
        <video ref={video} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
      </span>
      <span className="flex items-center gap-1.5 font-medium">
        <span className={`size-2 rounded-full ${on ? "bg-emerald-500" : state === "starting" ? "bg-amber-500" : "bg-destructive"}`} aria-hidden />
        {on ? "Camera on" : state === "starting" ? "Starting camera" : "Camera off"}
      </span>
    </span>
  );
}
