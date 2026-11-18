"use client";

import { lazy, type ComponentType } from "react";
import type { GameId } from "@/shared/games";
import type { GamePlayProps } from "./types";

// Each game's play component is loaded on its own page, so the hub stays light.
// Each game has its own round and submission types, so the registry can only hold them loosely.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const GAME_PLAYS: Record<GameId, ComponentType<GamePlayProps<any, any>>> = {
  sysdesign: lazy(() => import("./sysdesign/sysdesign-play")),
  linux: lazy(() => import("./linux/linux-play")),
  docker: lazy(() => import("./docker/docker-play")),
};
