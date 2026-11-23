import { useCallback, useEffect, useRef, useState } from "react";
import { SECURE_LIMITS } from "../../../../../../server/src/shared/api/integrity";
import { describeCameraError } from "./camera-error";
import { FaceWatch } from "./face-watch";

// The camera turns on first and stays on for the whole exam. Face detection runs on this computer
// with MediaPipe as an extra on top of it: frames are never saved or sent, and only the words
// "no face" or "more than one face" can leave, as a note for the mentor.
//
// MediaPipe is loaded at run time from files shipped inside the app (public/mediapipe, filled by
// `pnpm face:setup`), not imported at build time. If those files are missing the camera still
// works and only the face check is off, which the exam bar says out loud.
const ASSET_BASE = "./mediapipe/";

type Detector = {
  detect(video: HTMLVideoElement): { detections: unknown[] };
  close(): void;
};
type Vision = {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceDetector: {
    createFromOptions(files: unknown, options: unknown): Promise<Detector>;
  };
};

const asset = (name: string) =>
  new URL(`${ASSET_BASE}${name}`, document.baseURI).href;

export type FaceMonitorState = {
  /** What the camera itself is doing. */
  camera: "off" | "starting" | "on" | "failed";
  /** Whether the on-device face check is running (it needs the model files). */
  face: "off" | "loading" | "on" | "unavailable";
  /** The live camera stream, for the small preview in the exam bar. */
  stream: MediaStream | null;
  /** Why the camera could not start or stopped, in plain words. */
  issue: string | null;
  retry: () => void;
};

type Snapshot = Omit<FaceMonitorState, "retry">;
const OFF: Snapshot = { camera: "off", face: "off", stream: null, issue: null };

export function useFaceMonitor(
  enabled: boolean,
  blockId: string | null,
): FaceMonitorState {
  const [state, setState] = useState<Snapshot>(OFF);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  // The question changes all the time; the camera must not restart each time, only the note's target.
  const block = useRef(blockId);
  useEffect(() => {
    block.current = blockId;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stream: MediaStream | undefined;
    let detector: Detector | undefined;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const update = (patch: Partial<Snapshot>) => {
      if (!stopped) setState((current) => ({ ...current, ...patch }));
    };

    void (async () => {
      update({ camera: "starting", face: "off", issue: null });
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: false,
        });
      } catch (error) {
        update({ camera: "failed", issue: describeCameraError(error) });
        return;
      }
      if (stopped) {
        // The exam ended while the camera was starting: do not leave it running.
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () =>
        update({
          camera: "failed",
          face: "off",
          stream: null,
          issue:
            "The camera stopped. Check that it is plugged in and that no other app is using it.",
        }),
      );
      update({ camera: "on", stream });
      try {
        video.srcObject = stream;
        await video.play();
      } catch {
        /* The preview still works; only the face check needs the hidden video. */
      }

      update({ face: "loading" });
      try {
        const vision = (await import(
          /* @vite-ignore */ asset("vision_bundle.mjs")
        )) as Vision;
        const files = await vision.FilesetResolver.forVisionTasks(
          asset("wasm"),
        );
        detector = await vision.FaceDetector.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: asset("blaze_face_short_range.tflite"),
          },
          runningMode: "VIDEO",
        });
        if (stopped) {
          detector.close();
          return;
        }
        const watch = new FaceWatch();
        timer = setInterval(() => {
          if (video.readyState < 2) return;
          const finding = watch.feed(detector!.detect(video).detections.length);
          if (finding)
            void window.buildment.secure.report(
              finding,
              undefined,
              block.current,
            );
        }, SECURE_LIMITS.faceCheckIntervalSeconds * 1000);
        update({ face: "on" });
      } catch (error) {
        /* No model files: the camera stays on and only the face check is off. */
        console.warn("The face check could not start.", error);
        update({ face: "unavailable" });
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      detector?.close();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [enabled, attempt]);

  return { ...(enabled ? state : OFF), retry };
}
