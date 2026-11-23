/** Plain words for why the camera did not start, from the error the browser gave. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access is blocked. Allow it in your system privacy settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found.";
  if (name === "NotReadableError" || name === "AbortError")
    return "Another app is using the camera. Close it, then try again.";
  return "The camera could not start.";
}
