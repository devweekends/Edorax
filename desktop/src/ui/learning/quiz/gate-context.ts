import { createContext } from "react";

/** What the start screen already learned, so the quiz itself does not ask the learner again. */
export const GateContext = createContext<{ cameraGranted: boolean }>({ cameraGranted: false });
