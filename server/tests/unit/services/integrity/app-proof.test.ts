import { describe, expect, it } from "vitest";
import {
  checkProof,
  PROOF_MAX_SKEW_MS,
  signProof,
  type ProofAction,
  type ProofPrecheck,
} from "../../../../src/services/integrity/app-proof.js";

// The desktop app signs its Secure-exam reports and the server checks them. These tests pin the
// rules: a copied or edited report must fail, and a real one must pass.

const KEY = "k".repeat(40);
const ATTEMPT = "attempt-one";
const NOW = 1_800_000_000_000;

const precheck: ProofPrecheck = {
  platform: "win32",
  appVersion: "1.0.0",
  apps: [
    { id: "zoom", label: "Zoom", category: "SCREEN_SHARE", action: "warn" },
    { id: "anydesk", label: "AnyDesk", category: "REMOTE_ACCESS", action: "block" },
  ],
  displayCount: 1,
  virtualMachine: false,
  camera: "OK",
  checkedAt: "2026-11-18T10:00:00.000Z",
};

const signed = (action: ProofAction, ts = NOW, report?: ProofPrecheck) => ({
  ts,
  sig: signProof(KEY, action, ATTEMPT, ts, report),
});

describe("app proof", () => {
  it("accepts a fresh report signed by the app", () => {
    expect(checkProof(KEY, "start", ATTEMPT, signed("start", NOW, precheck), precheck, NOW)).toEqual({ ok: true });
    expect(checkProof(KEY, "heartbeat", ATTEMPT, signed("heartbeat"), undefined, NOW)).toEqual({ ok: true });
  });

  it("refuses a report that carries no proof", () => {
    expect(checkProof(KEY, "heartbeat", ATTEMPT, undefined, undefined, NOW)).toEqual({ ok: false, reason: "missing" });
  });

  it("refuses a signature made with another key", () => {
    const forged = { ts: NOW, sig: signProof("x".repeat(40), "heartbeat", ATTEMPT, NOW) };
    expect(checkProof(KEY, "heartbeat", ATTEMPT, forged, undefined, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a proof reused for another action or another attempt", () => {
    const heartbeat = signed("heartbeat");
    expect(checkProof(KEY, "finish", ATTEMPT, heartbeat, undefined, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(checkProof(KEY, "heartbeat", "attempt-two", heartbeat, undefined, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a system check that was edited after it was signed", () => {
    const proof = signed("start", NOW, { ...precheck, camera: "DENIED" });
    expect(checkProof(KEY, "start", ATTEMPT, proof, { ...precheck, camera: "OK" }, NOW)).toEqual({ ok: false, reason: "invalid" });
    const noApps = signed("start", NOW, precheck);
    expect(checkProof(KEY, "start", ATTEMPT, noApps, { ...precheck, apps: [] }, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("does not care about the order of the matched apps", () => {
    const proof = signed("start", NOW, precheck);
    const reordered = { ...precheck, apps: [...precheck.apps].reverse() };
    expect(checkProof(KEY, "start", ATTEMPT, proof, reordered, NOW)).toEqual({ ok: true });
  });

  it("refuses an old proof, and calls it stale only when the signature is real", () => {
    const old = signed("heartbeat", NOW - PROOF_MAX_SKEW_MS - 1_000);
    expect(checkProof(KEY, "heartbeat", ATTEMPT, old, undefined, NOW)).toEqual({ ok: false, reason: "stale" });
    const forgedOld = { ts: NOW - PROOF_MAX_SKEW_MS - 1_000, sig: "A".repeat(43) };
    expect(checkProof(KEY, "heartbeat", ATTEMPT, forgedOld, undefined, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("allows a small difference between the two clocks", () => {
    expect(checkProof(KEY, "heartbeat", ATTEMPT, signed("heartbeat", NOW - 30_000), undefined, NOW)).toEqual({ ok: true });
    expect(checkProof(KEY, "heartbeat", ATTEMPT, signed("heartbeat", NOW + 30_000), undefined, NOW)).toEqual({ ok: true });
  });
});
