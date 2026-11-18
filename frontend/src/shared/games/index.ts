// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { AnyGameEngine, GameId } from "./types";
import { sysdesignEngine } from "./sysdesign/engine";
import { linuxEngine } from "./linux/engine";
import { dockerEngine } from "./docker/engine";

export * from "./types";
export * from "./daily";

/** Every daily game, by id. The server verifies submissions and the browser plays with these. */
export const GAME_ENGINES: Record<GameId, AnyGameEngine> = {
  sysdesign: sysdesignEngine as unknown as AnyGameEngine,
  linux: linuxEngine as unknown as AnyGameEngine,
  docker: dockerEngine as unknown as AnyGameEngine,
};

export function engineFor(game: GameId): AnyGameEngine {
  return GAME_ENGINES[game];
}
