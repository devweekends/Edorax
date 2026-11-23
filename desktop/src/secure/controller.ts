import {
  app,
  dialog,
  ipcMain,
  screen,
  systemPreferences,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import { randomBytes } from "node:crypto";
import {
  evaluateSecurePrecheck,
  INTEGRITY_LIMITS,
  matchBlockedApps,
  type IntegrityEventType,
  type SecureCameraCheck,
  type SecureExchangeResult,
  type SecureLaunch as ServerLaunch,
  type SecurePolicy,
  type SecurePrecheckReport,
} from "../../../server/src/shared/api/integrity";
import {
  DEV_APP_SIGNING_KEY,
  signProof,
  type ProofAction,
} from "../../../server/src/services/integrity/app-proof";
import type { createPreviewClient } from "../api";
import type { Result } from "../domain/catalog";
import {
  SECURE_REPORTED_TYPES,
  type SecureLaunch,
  type SecureReportedType,
} from "../domain/secure";
import { subscribeToExamLinks, type ExamLaunch } from "./launch";
import { enterLockdown } from "./lockdown";
import { listProcessNames } from "./process-scan";
import { detectVirtualMachine } from "./system-check";

type PreviewClient = ReturnType<typeof createPreviewClient>;
type Meta = Record<string, string | number | boolean>;
type QueuedEvent = {
  id: string;
  type: IntegrityEventType;
  at: string;
  blockId: string | null;
  meta?: Meta;
};
type Sitting = {
  chapterId: string;
  attemptId: string;
  /** Null for a standard-mode quiz, which has no system check or heartbeat. */
  policy: SecurePolicy | null;
  kind: "secure" | "standard";
  /** Set only when the pre-check was cleared, and only for a few minutes. */
  report: SecurePrecheckReport | null;
  active: boolean;
};

const CHECK_MAX_AGE_MS = 5 * 60 * 1000;

// The key the server checks our reports against. It is baked in when the app is packaged (see
// vite.main.config.mts). With enough effort anyone can pull it out of the app, so this stops the
// easy bypass, not every one. The mentor review stays the final decision.
const APP_KEY = process.env.EDORAX_SECURE_APP_KEY || DEV_APP_SIGNING_KEY;

/** Signs one report for this attempt, right now, so it cannot be reused later or for something else. */
function proofFor(
  action: ProofAction,
  attemptId: string,
  report?: SecurePrecheckReport,
) {
  const ts = Date.now();
  return { ts, sig: signProof(APP_KEY, action, attemptId, ts, report) };
}

const RESCAN_MS = 60 * 1000;
const FLUSH_MS = 2 * 1000;
const PING_MS = 8 * 1000;
const CAMERA_VALUES: readonly SecureCameraCheck[] = [
  "OK",
  "MISSING",
  "DENIED",
  "SKIPPED",
];

const fail = (code: string, message: string): Result<never> => ({
  ok: false,
  code,
  message,
});

function platform(): SecurePrecheckReport["platform"] {
  return process.platform === "win32" || process.platform === "darwin"
    ? process.platform
    : "linux";
}

function cleanMeta(value: unknown): Meta | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value).slice(0, 8);
  const meta: Meta = {};
  for (const [key, item] of entries) {
    if (key.length > 32) continue;
    if (typeof item === "string") meta[key] = item.slice(0, 120);
    else if (typeof item === "number" && Number.isFinite(item))
      meta[key] = item;
    else if (typeof item === "boolean") meta[key] = item;
  }
  return Object.keys(meta).length ? meta : undefined;
}

/**
 * Secure exam mode. The main process owns everything that matters: the one-time token, the
 * lockdown, the heartbeat and the event queue. The window can only ask it to do those things
 * and report the few signals it alone can see (typing speed, camera face checks).
 */
export function installSecureExam(
  getWindow: () => BrowserWindow | null,
  requireRenderer: (event: IpcMainInvokeEvent) => void,
  client: PreviewClient,
  apiBase: string,
) {
  let pending: ExamLaunch | null = null;
  let sitting: Sitting | null = null;
  let exitLockdown: (() => void) | null = null;
  let timers: NodeJS.Timeout[] = [];
  let missedBeats = 0;
  let ending: Promise<void> | null = null;
  const queue: QueuedEvent[] = [];
  const seenApps = new Set<string>();

  const send = (channel: string, payload: unknown) => {
    const window = getWindow();
    if (window && !window.isDestroyed())
      window.webContents.send(channel, payload);
  };
  const notice = (text: string) => send("secure:notice", { text });

  function enqueue(
    type: IntegrityEventType,
    meta?: Meta,
    blockId?: string | null,
  ) {
    if (!sitting?.active) return;
    queue.push({
      id: randomBytes(9).toString("base64url"),
      type,
      at: new Date().toISOString(),
      blockId: blockId ?? null,
      meta,
    });
    // A long outage drops the oldest notes instead of growing without limit.
    if (queue.length > 200) queue.shift();
  }

  async function flush() {
    if (!sitting || !queue.length) return;
    const batch = queue.splice(0, INTEGRITY_LIMITS.eventsPerBatch);
    const result = await client.secureRequest(
      `/api/v1/integrity/attempts/${sitting.attemptId}/events`,
      "POST",
      { events: batch },
    );
    // Only a lost connection or a busy server is worth retrying; the server dedupes by id.
    if (
      !result.ok &&
      (result.code === "CONNECTION_ERROR" || result.code === "RATE_LIMITED")
    )
      queue.unshift(...batch);
  }

  /** Standard-mode quizzes: "still here" so the mentor's online light is true. */
  async function ping() {
    if (!sitting?.active) return;
    await client
      .secureRequest(
        `/api/v1/integrity/attempts/${sitting.attemptId}/ping`,
        "POST",
      )
      .catch(() => undefined);
  }

  async function beat() {
    if (!sitting?.active || sitting.kind !== "secure") return;
    const result = await client.secureRequest(
      `/api/v1/integrity/attempts/${sitting.attemptId}/heartbeat`,
      "POST",
      { proof: proofFor("heartbeat", sitting.attemptId) },
    );
    if (result.ok) {
      if (missedBeats >= 3) notice("Connection restored.");
      missedBeats = 0;
      return;
    }
    missedBeats += 1;
    if (missedBeats === 3)
      notice(
        "We cannot reach the exam server. Keep going. The app will reconnect on its own.",
      );
  }

  async function rescan() {
    if (!sitting?.active || !sitting.policy) return;
    const names = await listProcessNames().catch(() => []);
    for (const found of matchBlockedApps(names, sitting.policy.blockedApps)) {
      if (seenApps.has(found.id)) continue;
      seenApps.add(found.id);
      enqueue("BLOCKED_APP", {
        app: found.id,
        label: found.label,
        action: found.action,
        during: true,
      });
      notice(
        `${found.label} is open. Please close it. This is noted for your mentor.`,
      );
    }
  }

  function stopTimers() {
    for (const timer of timers) clearInterval(timer);
    timers = [];
  }

  async function finish(): Promise<void> {
    const current = sitting;
    if (!current) return;
    stopTimers();
    exitLockdown?.();
    exitLockdown = null;
    if (current.active) {
      await flush().catch(() => undefined);
      await client
        .secureRequest(
          `/api/v1/integrity/attempts/${current.attemptId}/secure/finish`,
          "POST",
          // Only a Secure sitting has to prove it is the app. A standard quiz just says "done".
          current.kind === "secure"
            ? { proof: proofFor("finish", current.attemptId) }
            : undefined,
        )
        .catch(() => undefined);
    }
    sitting = null;
    queue.length = 0;
    seenApps.clear();
    missedBeats = 0;
  }
  // Concurrent callers (close button, Cmd+Q, the window itself) share one shutdown.
  const endSitting = () => (ending ??= finish().finally(() => (ending = null)));

  const unsubscribe = subscribeToExamLinks((launch) => {
    pending = launch;
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
    const info: SecureLaunch = {
      chapterId: launch.chapterId,
      courseSlug: launch.courseSlug,
      chapterSlug: launch.chapterSlug,
    };
    send("secure:launch", info);
  });

  function startLockdown(window: BrowserWindow) {
    exitLockdown = enterLockdown(window, {
      event: (type, meta) => enqueue(type, meta),
      notice,
      requestLeave: async () => {
        const choice = await dialog.showMessageBox(window, {
          type: "question",
          buttons: ["Stay in the quiz", "Leave the quiz"],
          defaultId: 0,
          cancelId: 0,
          title: "Leave the quiz?",
          message: "Leave the quiz?",
          detail:
            "You can come back by opening the quiz again. Your mentor will see that you left.",
        });
        if (choice.response !== 1) return false;
        await endSitting();
        return true;
      },
    });
  }

  ipcMain.handle("secure:pending", (event): Result<SecureLaunch | null> => {
    requireRenderer(event);
    if (!pending) return { ok: true, data: null };
    return {
      ok: true,
      data: {
        chapterId: pending.chapterId,
        courseSlug: pending.courseSlug,
        chapterSlug: pending.chapterSlug,
      },
    };
  });

  ipcMain.handle("secure:prepare", async (event, chapterId: unknown) => {
    requireRenderer(event);
    if (
      typeof chapterId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(chapterId)
    )
      return fail("INVALID_INPUT", "Invalid exam.");
    // Opening an exam again (a restart, a second click) replaces any sitting still open.
    await endSitting();
    let token = pending?.chapterId === chapterId ? pending.token : null;
    if (!token) {
      // Started inside the app: ask the server for our own one-time link.
      const made = await client.secureRequest(
        `/api/v1/chapters/${chapterId}/secure-launch`,
        "POST",
      );
      if (!made.ok) return made;
      const data = made.data as Partial<ServerLaunch> | null;
      if (typeof data?.token !== "string")
        return fail(
          "INVALID_RESPONSE",
          "The exam service sent an unexpected reply.",
        );
      token = data.token;
    }
    pending = null;
    const exchanged = await client.secureRequest(
      "/api/v1/integrity/secure/exchange",
      "POST",
      { chapterId, token },
    );
    if (!exchanged.ok) return exchanged;
    const data = exchanged.data as SecureExchangeResult | null;
    if (
      !data?.attempt?.attemptId ||
      !data.policy ||
      !Array.isArray(data.policy.blockedApps)
    )
      return fail(
        "INVALID_RESPONSE",
        "The exam service sent an unexpected reply.",
      );
    sitting = {
      chapterId,
      attemptId: data.attempt.attemptId,
      policy: data.policy,
      kind: "secure",
      report: null,
      active: false,
    };
    return { ok: true, data: { policy: data.policy, attempt: data.attempt } };
  });

  ipcMain.handle("secure:protect", async (event, chapterId: unknown) => {
    requireRenderer(event);
    const window = getWindow();
    if (
      typeof chapterId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(chapterId)
    )
      return fail("INVALID_INPUT", "Invalid quiz.");
    if (!window || window.isDestroyed())
      return fail("NO_WINDOW", "The app window is not available.");
    await endSitting();
    // Same attempt the quiz itself uses, so the mentor sees one attempt, not two.
    const opened = await client.secureRequest(
      `/api/v1/chapters/${chapterId}/integrity`,
      "POST",
    );
    if (!opened.ok) return opened;
    const attemptId = (opened.data as { attemptId?: unknown } | null)
      ?.attemptId;
    if (typeof attemptId !== "string")
      return fail(
        "INVALID_RESPONSE",
        "The quiz service sent an unexpected reply.",
      );
    sitting = {
      chapterId,
      attemptId,
      policy: null,
      kind: "standard",
      report: null,
      active: true,
    };
    startLockdown(window);
    timers = [
      setInterval(() => void ping().catch(() => undefined), PING_MS),
      setInterval(() => void flush().catch(() => undefined), FLUSH_MS),
    ];
    void ping().catch(() => undefined);
    return { ok: true, data: { attemptId } };
  });

  // Which server this app is talking to, so a learner and a mentor can see they are on the same one.
  ipcMain.handle("secure:server", (event): Result<{ api: string }> => {
    requireRenderer(event);
    try {
      return { ok: true, data: { api: new URL(apiBase).host } };
    } catch {
      return { ok: true, data: { api: apiBase } };
    }
  });

  ipcMain.handle(
    "secure:camera",
    async (event): Promise<Result<{ access: string }>> => {
      requireRenderer(event);
      try {
        if (process.platform === "darwin" || process.platform === "win32") {
          let access: string = systemPreferences.getMediaAccessStatus("camera");
          // macOS shows its own permission prompt the first time. Windows has a privacy switch instead.
          if (access === "not-determined" && process.platform === "darwin")
            access = (await systemPreferences.askForMediaAccess("camera"))
              ? "granted"
              : "denied";
          return { ok: true, data: { access } };
        }
      } catch {
        /* Fall through to unknown. */
      }
      return { ok: true, data: { access: "unknown" } };
    },
  );

  ipcMain.handle("secure:precheck", async (event, camera: unknown) => {
    requireRenderer(event);
    if (!sitting || sitting.active || !sitting.policy)
      return fail("NO_SITTING", "Open the exam from the course first.");
    if (!CAMERA_VALUES.includes(camera as SecureCameraCheck))
      return fail("INVALID_INPUT", "Invalid camera result.");
    const [names, virtualMachine] = await Promise.all([
      listProcessNames().catch(() => []),
      detectVirtualMachine(),
    ]);
    const report: SecurePrecheckReport = {
      platform: platform(),
      appVersion: app.getVersion(),
      // Only matches leave this function. The full list of running programs stays here.
      apps: matchBlockedApps(names, sitting.policy.blockedApps),
      displayCount: screen.getAllDisplays().length,
      virtualMachine,
      camera: camera as SecureCameraCheck,
      checkedAt: new Date().toISOString(),
    };
    const verdict = evaluateSecurePrecheck(report, sitting.policy);
    sitting.report = verdict.ok ? report : null;
    return { ok: true, data: { ...verdict, report } };
  });

  ipcMain.handle("secure:begin", async (event, consent: unknown) => {
    requireRenderer(event);
    const window = getWindow();
    if (consent !== true)
      return fail("CONSENT_REQUIRED", "Agree to the exam rules to continue.");
    if (!sitting || !sitting.policy || !window || window.isDestroyed())
      return fail("NO_SITTING", "Open the exam from the course first.");
    const report = sitting.report;
    if (!report)
      return fail("PRECHECK_REQUIRED", "Run the system check first.");
    if (Date.now() - Date.parse(report.checkedAt) > CHECK_MAX_AGE_MS) {
      sitting.report = null;
      return fail(
        "PRECHECK_STALE",
        "The system check is out of date. Run it again.",
      );
    }
    const started = await client.secureRequest(
      `/api/v1/integrity/attempts/${sitting.attemptId}/secure/start`,
      "POST",
      {
        consent: true,
        precheck: report,
        proof: proofFor("start", sitting.attemptId, report),
      },
    );
    if (!started.ok) return started;
    sitting.active = true;
    startLockdown(window);
    const interval = sitting.policy.heartbeatIntervalSeconds * 1000;
    timers = [
      setInterval(
        () => void beat().catch(() => undefined),
        Math.max(2_000, interval),
      ),
      setInterval(() => void flush().catch(() => undefined), FLUSH_MS),
      setInterval(() => void rescan().catch(() => undefined), RESCAN_MS),
    ];
    void beat().catch(() => undefined);
    const warnings = (started.data as { warnings?: string[] } | null)?.warnings;
    return {
      ok: true,
      data: { warnings: Array.isArray(warnings) ? warnings : [] },
    };
  });

  ipcMain.handle(
    "secure:report",
    (event, type: unknown, meta: unknown, blockId: unknown) => {
      requireRenderer(event);
      if (!SECURE_REPORTED_TYPES.includes(type as SecureReportedType)) return;
      const block =
        typeof blockId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(blockId)
          ? blockId
          : null;
      enqueue(type as SecureReportedType, cleanMeta(meta), block);
    },
  );

  ipcMain.handle(
    "secure:end",
    async (event): Promise<Result<{ ended: true }>> => {
      requireRenderer(event);
      await endSitting();
      return { ok: true, data: { ended: true } };
    },
  );

  return {
    active: () => Boolean(sitting?.active),
    /** Ends the sitting (flushes notes, tells the server). Safe to call from several places. */
    end: endSitting,
    /** Stops listening for exam links. Only on quit: macOS keeps the app alive with no window. */
    dispose: unsubscribe,
  };
}
