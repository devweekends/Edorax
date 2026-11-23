import type {
  IntegrityAttemptSession,
  SecureCameraCheck,
  SecurePolicy,
  SecurePrecheckReport,
} from "../../../server/src/shared/api/integrity";
import type { Result } from "./catalog";

// The secure exam bridge. The one-time exam token and the session never cross IPC:
// the main process keeps them, and the window only gets what it needs to draw.

/** The exam the website (or a deep link) asked this app to open. */
export type SecureLaunch = {
  chapterId: string;
  courseSlug: string | null;
  chapterSlug: string | null;
};

export type SecurePrepared = {
  policy: SecurePolicy;
  attempt: IntegrityAttemptSession;
};

export type SecurePrecheckResult = {
  ok: boolean;
  /** Things the learner must fix before the exam can start. */
  blockers: string[];
  /** Noted for the mentor, but they do not stop the exam. */
  warnings: string[];
  report: SecurePrecheckReport;
};

/** Signals only the window can see. The main process adds its own (restricted apps, extra screens). */
export type SecureReportedType =
  | "TYPING_BURST"
  | "FACE_MISSING"
  | "FACE_MULTIPLE"
  | "COPY_BLOCKED"
  | "PASTE_BLOCKED"
  | "CONTEXT_MENU_BLOCKED"
  | "SCREENSHOT_KEY";
export const SECURE_REPORTED_TYPES: readonly SecureReportedType[] = [
  "TYPING_BURST",
  "FACE_MISSING",
  "FACE_MULTIPLE",
  "COPY_BLOCKED",
  "PASTE_BLOCKED",
  "CONTEXT_MENU_BLOCKED",
  "SCREENSHOT_KEY",
];

export type SecureNotice = { text: string };

export interface SecureAPI {
  /** An exam link that arrived before the window asked (cold start from the website). */
  pendingLaunch(): Promise<Result<SecureLaunch | null>>;
  onLaunch(listener: (launch: SecureLaunch) => void): () => void;
  /** Opens the attempt. Uses the website's one-time link when there is one, otherwise asks the server for its own. */
  prepare(chapterId: string): Promise<Result<SecurePrepared>>;
  /** The server this app is connected to, such as localhost:4000. */
  server(): Promise<Result<{ api: string }>>;
  /** Asks the operating system for camera access (macOS prompt, Windows privacy switch). */
  camera(): Promise<Result<{ access: string }>>;
  /** Standard-mode quizzes: opens the attempt and turns on full protection (no system check or heartbeat). */
  protect(chapterId: string): Promise<Result<{ attemptId: string }>>;
  /** Looks at running apps, screens and virtual machines. The camera is checked in the window and passed in. */
  precheck(camera: SecureCameraCheck): Promise<Result<SecurePrecheckResult>>;
  /** Records consent, then starts lockdown and the heartbeat. `consent` must be true. */
  begin(consent: boolean): Promise<Result<{ warnings: string[] }>>;
  report(
    type: SecureReportedType,
    meta?: Record<string, string | number | boolean>,
    blockId?: string | null,
  ): Promise<void>;
  end(): Promise<Result<{ ended: true }>>;
  onNotice(listener: (notice: SecureNotice) => void): () => void;
}
