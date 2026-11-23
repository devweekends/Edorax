import { createHmac, timingSafeEqual } from "node:crypto";

// Proof that a Secure-exam report really came from the desktop app.
//
// The desktop app signs its system check, its heartbeats and its finish message with a key that
// is built into the app. The server checks the signature, so a browser that copies the same
// request by hand is refused. Each signature names one action on one attempt at one moment, so
// an old or borrowed report cannot be reused for something else.
//
// This is not magic. The key ships inside the app, and a determined person can dig it out. It
// stops the easy bypass, and the mentor review stays the final decision.
//
// This file has no imports from the server (no database, no config), so the desktop app can use
// the very same code to sign.

export type ProofAction = "start" | "heartbeat" | "finish";

export type AppProof = {
  /** When the app signed, in milliseconds since 1970. */
  ts: number;
  /** HMAC-SHA256 of the message below, base64url. */
  sig: string;
};

/** The parts of the system check that the server trusts, and so the parts that are signed. */
export type ProofPrecheck = {
  platform: string;
  appVersion: string;
  apps: { id: string; label: string; category: string; action: string }[];
  displayCount: number;
  virtualMachine: boolean;
  camera: string;
  checkedAt: string;
};

/** Only used when nothing is configured, and only outside production. */
export const DEV_APP_SIGNING_KEY = "buildment-dev-secure-app-key-not-for-production";

/** How far the app's clock may differ from the server's. It is also how long a copied report stays usable. */
export const PROOF_MAX_SKEW_MS = 90 * 1000;

const VERSION = "buildment-secure-v1";

// Plain code-unit order, so the app and the server always sort the same way.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function precheckParts(precheck: ProofPrecheck | undefined) {
  if (!precheck) return null;
  const apps = precheck.apps
    .map((app) => JSON.stringify([app.id, app.label, app.category, app.action]))
    .sort(byText);
  return [
    precheck.platform,
    precheck.appVersion,
    precheck.displayCount,
    precheck.virtualMachine,
    precheck.camera,
    precheck.checkedAt,
    apps,
  ];
}

function message(
  action: ProofAction,
  attemptId: string,
  ts: number,
  precheck: ProofPrecheck | undefined,
) {
  return JSON.stringify([VERSION, action, attemptId, ts, precheckParts(precheck)]);
}

export function signProof(
  key: string,
  action: ProofAction,
  attemptId: string,
  ts: number,
  precheck?: ProofPrecheck,
): string {
  return createHmac("sha256", key)
    .update(message(action, attemptId, ts, precheck))
    .digest("base64url");
}

export type ProofCheck =
  | { ok: true }
  /** missing: nothing was sent. invalid: the signature is wrong. stale: right signature, wrong moment. */
  | { ok: false; reason: "missing" | "invalid" | "stale" };

export function checkProof(
  key: string,
  action: ProofAction,
  attemptId: string,
  proof: AppProof | undefined,
  precheck?: ProofPrecheck,
  now: number = Date.now(),
): ProofCheck {
  if (!proof) return { ok: false, reason: "missing" };
  const expected = Buffer.from(signProof(key, action, attemptId, proof.ts, precheck));
  const given = Buffer.from(proof.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, reason: "invalid" };
  // Checked after the signature, so only a real app is told its clock is off.
  if (Math.abs(now - proof.ts) > PROOF_MAX_SKEW_MS)
    return { ok: false, reason: "stale" };
  return { ok: true };
}
