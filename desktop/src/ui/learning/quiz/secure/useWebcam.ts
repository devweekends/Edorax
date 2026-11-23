import { useEffect, useState } from "react";

export type WebcamState = "off" | "starting" | "on" | "failed";

/**
 * Opens the camera while a protected quiz runs and hands the stream to the preview and the face check,
 * so there is one camera session and the learner can see it is on. Nothing is recorded here. Stopping
 * the quiz stops the camera.
 */
export function useWebcam(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<WebcamState>("off");

  useEffect(() => {
    if (!enabled) {
      setState("off");
      return;
    }
    let cancelled = false;
    let opened: MediaStream | null = null;
    setState("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240 } })
      .then((next) => {
        if (cancelled) {
          for (const track of next.getTracks()) track.stop();
          return;
        }
        opened = next;
        setStream(next);
        setState("on");
        // A camera that is unplugged or taken by another app ends its tracks. Show that at once.
        for (const track of next.getVideoTracks()) track.addEventListener("ended", () => setState("failed"));
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
      for (const track of opened?.getTracks() ?? []) track.stop();
      setStream(null);
    };
  }, [enabled]);

  return { stream, state };
}
