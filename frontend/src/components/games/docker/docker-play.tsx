"use client";

import type { GamePlayProps } from "../types";
import type { DockerRound, DockerSubmission } from "@/shared/games/docker/engine";
import { BuildPlay } from "./build-play";
import { DockerStyles } from "./docker-styles";
import { FixPlay } from "./fix-play";

/**
 * Docker Commands. A round is either "fix" (repair a broken virtual Docker host in a terminal,
 * watching a diagram of it) or "build" (put a Dockerfile or compose file together from pieces,
 * build it, then run it). Both sit in the shared game frame.
 */
export default function DockerPlay({ round, roundIndex, attempt, locked, sounds, onFinish }: GamePlayProps<DockerRound, DockerSubmission>) {
  return (
    <div>
      <DockerStyles />
      {round.mode === "fix" ? (
        <FixPlay round={round} roundIndex={roundIndex} attempt={attempt} locked={locked} sounds={sounds} onFinish={onFinish} />
      ) : (
        <BuildPlay round={round} roundIndex={roundIndex} attempt={attempt} locked={locked} sounds={sounds} onFinish={onFinish} />
      )}
    </div>
  );
}
