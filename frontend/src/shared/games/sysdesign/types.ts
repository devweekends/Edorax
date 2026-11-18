// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Shared types for the System Design Runner. A round is a real lab spec (the same HldLabSpec the
// platform's labs use) with a broken starting board, so the game plays on the lab's own board.
// Everything here is plain data, because a round travels from the server to the browser as JSON.
import type { Board, HldLabSpec } from "../../lab/engine/hld-types";
import type { RoundBase } from "../types";

/** One production incident: a broken AWS system, the checks it must pass and a reference fix. */
export type SysdesignRound = RoundBase & {
  /** The lab spec: starting board, allowed parts, challenge checks, hints and reference solution. */
  spec: HldLabSpec;
};

/** What the player sends: the board they built. Positions do not matter. */
export type SysdesignSubmission = { board: Board };
