import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IntegrityMode,
  SecurePolicy,
} from "../../../../../../server/src/shared/api/integrity";
import type { SecurePrecheckResult } from "../../../../domain/secure";
import type { SecureCameraCheck } from "../../../../../../server/src/shared/api/integrity";
import { requestCameraAccess } from "./camera-check";

export type CameraState = {
  status: "idle" | "checking" | SecureCameraCheck;
  help: string | null;
};

export type SecurePhase =
  | "intro"
  | "consent"
  | "checking"
  | "blocked"
  | "ready"
  | "active"
  | "ended";

/** The learner's path into a secure exam: intro, consent, system check, then lockdown. */
export function useSecureExam(
  chapterId: string,
  mode: IntegrityMode = "SECURE",
) {
  const [phase, setPhase] = useState<SecurePhase>("intro");
  const [policy, setPolicy] = useState<SecurePolicy | null>(null);
  const [result, setResult] = useState<SecurePrecheckResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<CameraState>({
    status: "idle",
    help: null,
  });
  const active = useRef(false);

  // A message from the app stays for a few seconds and then goes, so the screen never keeps old news.
  useEffect(() => {
    let timer: number | undefined;
    const stop = window.buildment.secure.onNotice((next) => {
      setNotice(next.text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(""), 4_000);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  // Leaving the screen always ends the sitting, so lockdown can never outlive the exam.
  useEffect(
    () => () => {
      if (active.current) void window.buildment.secure.end();
    },
    [],
  );

  const prepare = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const prepared = await window.buildment.secure.prepare(chapterId);
      if (!prepared.ok) {
        setError(prepared.message);
        return;
      }
      setPolicy(prepared.data.policy);
      setPhase("consent");
    } finally {
      setBusy(false);
    }
  }, [chapterId]);

  /** Standard-mode quizzes skip the system check: they open straight into protected mode. */
  const startProtected = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const started = await window.buildment.secure.protect(chapterId);
      if (!started.ok) {
        setError(started.message);
        return;
      }
      active.current = true;
      setPhase("active");
    } finally {
      setBusy(false);
    }
  }, [chapterId]);

  /** The learner presses "Allow camera". The operating system may ask, and the answer is shown. */
  const allowCamera = useCallback(async () => {
    setCamera({ status: "checking", help: null });
    const access = await requestCameraAccess();
    setCamera({ status: access.check, help: access.help });
    return access.check;
  }, []);

  const check = useCallback(async () => {
    setBusy(true);
    setError("");
    setPhase("checking");
    try {
      const access = await requestCameraAccess();
      setCamera({ status: access.check, help: access.help });
      const checked = await window.buildment.secure.precheck(access.check);
      if (!checked.ok) {
        setError(checked.message);
        setPhase("consent");
        return;
      }
      setResult(checked.data);
      setPhase(checked.data.ok ? "ready" : "blocked");
    } finally {
      setBusy(false);
    }
  }, []);

  const begin = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const started = await window.buildment.secure.begin(true);
      if (!started.ok) {
        setError(started.message);
        // A stale or refused check goes back to the checklist instead of a dead end.
        if (
          started.code === "PRECHECK_STALE" ||
          started.code === "PRECHECK_FAILED"
        )
          setPhase("blocked");
        return;
      }
      setWarnings(started.data.warnings);
      active.current = true;
      setPhase("active");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Leaves the quiz and returns to the start screen of the same quiz, ready to begin again. */
  const leave = useCallback(async () => {
    active.current = false;
    await window.buildment.secure.end();
    setPhase("intro");
    setResult(null);
    setWarnings([]);
    setNotice("");
    setError("");
  }, []);

  const end = useCallback(async () => {
    active.current = false;
    await window.buildment.secure.end();
    setPhase("ended");
  }, []);

  return {
    phase,
    policy,
    result,
    warnings,
    notice,
    error,
    busy,
    mode,
    camera,
    allowCamera,
    prepare,
    startProtected,
    check,
    begin,
    end,
    leave,
    clearNotice: () => setNotice(""),
  };
}
