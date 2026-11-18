import type { AnyGameEngine, GameId } from "./types.js";
import { sysdesignEngine } from "./sysdesign/engine.js";
import { linuxEngine } from "./linux/engine.js";
import { dockerEngine } from "./docker/engine.js";

export * from "./types.js";
export * from "./daily.js";

/** Every daily game, by id. The server verifies submissions and the browser plays with these. */
export const GAME_ENGINES: Record<GameId, AnyGameEngine> = {
  sysdesign: sysdesignEngine as unknown as AnyGameEngine,
  linux: linuxEngine as unknown as AnyGameEngine,
  docker: dockerEngine as unknown as AnyGameEngine,
};

export function engineFor(game: GameId): AnyGameEngine {
  return GAME_ENGINES[game];
}
