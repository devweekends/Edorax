import type { SecureCameraCheck } from "../../../../../../server/src/shared/api/integrity";

/** Opens the camera for a moment to prove it works, then releases it. Nothing is recorded or sent. */
export async function checkCamera(): Promise<SecureCameraCheck> {
  if (!navigator.mediaDevices?.getUserMedia) return "MISSING";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) track.stop();
    return "OK";
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return "DENIED";
    return "MISSING";
  }
}

function helpFor(): string {
  const platform = window.buildment.platform;
  if (platform === "darwin")
    return "Open System Settings, then Privacy and Security, then Camera, and turn it on for Edorax. Then press Allow camera again.";
  if (platform === "win32")
    return "Open Windows Settings, then Privacy and security, then Camera. Turn on camera access and allow desktop apps. Then press Allow camera again.";
  return "Allow camera access for this app in your system settings, then press Allow camera again.";
}

/** Asks the operating system first, then proves the camera really opens. Says what to do when it does not. */
export async function requestCameraAccess(): Promise<{
  check: SecureCameraCheck;
  help: string | null;
}> {
  const os = await window.buildment.secure.camera();
  const access = os.ok ? os.data.access : "unknown";
  if (access === "denied" || access === "restricted")
    return { check: "DENIED", help: helpFor() };
  const check = await checkCamera();
  if (check === "OK") return { check, help: null };
  if (check === "DENIED") return { check, help: helpFor() };
  return {
    check,
    help: "No camera was found. Plug in a camera, or ask your mentor for another way to sit this quiz.",
  };
}
