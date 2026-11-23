import { createContext } from "react";

/**
 * True inside a secure exam that requires the camera. The quiz then turns the camera on for the
 * learner and does not offer a "continue without camera" choice.
 */
export const SecureCameraContext = createContext(false);
