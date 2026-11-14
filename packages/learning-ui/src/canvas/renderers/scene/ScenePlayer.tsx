"use client";

import { useEffect, useRef } from "react";
import { useBeatClock } from "../../primitives/use-beat-clock";
import { fitScene } from "./fit";
import { loopTime, sceneFrame } from "./frame";
import { SceneView } from "./SceneView";
import type { Scene } from "./types";

/**
 * Plays a scene while it is on screen, loops it, freezes it while the learner
 * presses on it, and shows the final frame under reduced motion. Change
 * `replayKey` to start the story again (a Replay button, or a toggled input).
 */
export function ScenePlayer({ scene: authored, title, replayKey = 0 }: { scene: Scene; title: string; replayKey?: number | string }) {
  // Boxes placed too close together or over the edge are spread out before anything is drawn.
  const scene = fitScene(authored);
  const ref = useRef<HTMLDivElement>(null);
  const clock = useBeatClock(ref);
  const { restart } = clock;
  useEffect(() => {
    restart();
  }, [replayKey, restart]);
  const frame = sceneFrame(scene, loopTime(scene, clock.seconds));
  return (
    <div
      ref={ref}
      onPointerDown={clock.freeze}
      onPointerUp={clock.unfreeze}
      onPointerLeave={clock.unfreeze}
      onPointerCancel={clock.unfreeze}
    >
      <SceneView scene={scene} frame={frame} title={title} />
    </div>
  );
}
