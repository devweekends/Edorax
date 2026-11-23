// Quiz integrity signals: what the browser may report, what mentors see, and the
// limits both apps agree on. Signals are flags for a mentor to judge. Nothing here
// fails, locks or submits a quiz on its own.

export const INTEGRITY_EVENT_TYPES = [
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "COPY_BLOCKED",
  "PASTE_BLOCKED",
  "CONTEXT_MENU_BLOCKED",
  "SCREENSHOT_KEY",
  "MOUSE_LEFT",
  "SECOND_SCREEN",
  "FAST_ANSWER",
  "CAMERA_OFF",
  "CAMERA_ON",
  // Secure mode (desktop app) signals.
  "BLOCKED_APP",
  "VIRTUAL_MACHINE",
  "HEARTBEAT_GAP",
  "TYPING_BURST",
  "FACE_MISSING",
  "FACE_MULTIPLE",
] as const;
export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

export type IntegrityCameraStatus =
  | "NOT_REQUESTED"
  | "ON"
  | "DECLINED"
  | "UNAVAILABLE";

/** Camera events describe the device, not the learner, so they never add to the flag count. */
export const INTEGRITY_INFO_EVENTS: ReadonlySet<IntegrityEventType> = new Set([
  "CAMERA_OFF",
  "CAMERA_ON",
]);

export function isIntegrityFlag(type: IntegrityEventType): boolean {
  return !INTEGRITY_INFO_EVENTS.has(type);
}

export const INTEGRITY_LIMITS = {
  /** Events stored per attempt. Later ones are counted as dropped, not stored. */
  eventsPerAttempt: 500,
  eventsPerBatch: 50,
  /** About one still a minute: 4 hours of quiz at most. */
  snapshotsPerAttempt: 240,
  snapshotIntervalSeconds: 60,
  /** The server refuses stills that arrive faster than this. */
  snapshotMinGapSeconds: 40,
  snapshotWidth: 320,
  snapshotHeight: 240,
  snapshotMaxBytes: 48 * 1024,
  retentionDays: 30,
} as const;

/** Mentor-facing names. Short, plain English for ESL readers. */
export const INTEGRITY_EVENT_LABELS: Record<IntegrityEventType, string> = {
  TAB_HIDDEN: "Left the tab",
  WINDOW_BLUR: "Switched window",
  FULLSCREEN_EXIT: "Left full screen",
  COPY_BLOCKED: "Tried to copy",
  PASTE_BLOCKED: "Tried to paste",
  CONTEXT_MENU_BLOCKED: "Right-click",
  SCREENSHOT_KEY: "Screenshot keys",
  MOUSE_LEFT: "Mouse left the page",
  SECOND_SCREEN: "Second screen",
  FAST_ANSWER: "Very fast answers",
  CAMERA_OFF: "Camera off",
  CAMERA_ON: "Camera on",
  BLOCKED_APP: "Restricted app open",
  VIRTUAL_MACHINE: "Virtual machine",
  HEARTBEAT_GAP: "App stopped reporting",
  TYPING_BURST: "Text appeared at once",
  FACE_MISSING: "No face in camera",
  FACE_MULTIPLE: "More than one face",
};

export const INTEGRITY_CAMERA_LABELS: Record<IntegrityCameraStatus, string> = {
  NOT_REQUESTED: "Camera not used",
  ON: "Camera on",
  DECLINED: "Camera off (learner chose no camera)",
  UNAVAILABLE: "Camera off (no camera or it stopped)",
};

export type IntegrityEventInput = {
  /** Random id from the browser so a retried batch is stored once. */
  id: string;
  type: IntegrityEventType;
  /** When it happened in the browser (events are buffered while offline). */
  at: string;
  blockId?: string | null;
  meta?: Record<string, string | number | boolean>;
};

/** What the learner's browser gets when a proctored quiz opens. */
export type IntegrityAttemptSession = {
  attemptId: string;
  attempt: number;
  /** STANDARD runs in the browser. SECURE needs the Edorax desktop app. */
  mode: IntegrityMode;
  startedAt: string;
  /** Flags already stored for this attempt, so the badge survives a reload. */
  flagCount: number;
  camera: {
    /** The course has camera snapshots turned on. */
    enabled: boolean;
    status: IntegrityCameraStatus;
    intervalSeconds: number;
    width: number;
    height: number;
    retentionDays: number;
  };
};

export type IntegrityEventsResult = { accepted: number; flagCount: number };

export type IntegrityAttemptSummary = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  attempt: number;
  startedAt: string;
  lastSeenAt: string;
  cameraStatus: IntegrityCameraStatus;
  flagCount: number;
  droppedEvents: number;
  counts: Partial<Record<IntegrityEventType, number>>;
  snapshotCount: number;
  mode: IntegrityMode;
  /** A sorting hint for the review queue. It is not evidence and never changes a score. */
  risk: IntegrityRisk;
  /** The mentor's decision, if one was made. Only a person sets this. */
  review: IntegrityReviewRecord | null;
  /** True while the learner's app or page has reported in during the last few seconds. */
  online: boolean;
};

export type IntegrityAttemptDetail = IntegrityAttemptSummary & {
  events: Array<{
    id: string;
    type: IntegrityEventType;
    at: string;
    blockId: string | null;
    meta: Record<string, unknown> | null;
  }>;
  /** `url` is a short-lived signed link, or null once the image was deleted. */
  snapshots: Array<{ id: string; takenAt: string; url: string | null }>;
  snapshotUrlExpiresAt: string | null;
};

export type CourseIntegritySettings = {
  integritySnapshots: boolean;
  integrityMode: IntegrityMode;
};

// ---------------------------------------------------------------------------
// Modes and secure-mode limits
// ---------------------------------------------------------------------------

export const INTEGRITY_MODES = ["STANDARD", "SECURE"] as const;
export type IntegrityMode = (typeof INTEGRITY_MODES)[number];

export const INTEGRITY_MODE_LABELS: Record<IntegrityMode, string> = {
  STANDARD: "Standard (browser)",
  SECURE: "Secure (desktop app)",
};

export const SECURE_DEEP_LINK_SCHEME = "edorax";

export const SECURE_LIMITS = {
  heartbeatIntervalSeconds: 5,
  /** Silence longer than this is stored as one HEARTBEAT_GAP flag. */
  heartbeatGraceSeconds: 20,
  /** The "Start exam" link works once, for this long. */
  launchTokenTtlSeconds: 120,
  maxDisplays: 1,
  faceCheckIntervalSeconds: 3,
  /** Consecutive empty checks before FACE_MISSING is reported (about 12 s). */
  faceMissingAfterChecks: 4,
  /** One input event that adds this many characters is not typing. */
  typingBurstChars: 40,
  /** Sustained speed above this (about 170 wpm) is reported once per burst. */
  typingMaxCharsPerSecond: 14,
} as const;

// ---------------------------------------------------------------------------
// Pre-check: what the desktop app looks for before an exam opens
// ---------------------------------------------------------------------------

export type BlockedAppCategory =
  | "REMOTE_ACCESS"
  | "SCREEN_RECORDER"
  | "AI_ASSISTANT"
  | "SCREEN_SHARE";

export type BlockedAppRule = {
  id: string;
  label: string;
  category: BlockedAppCategory;
  /** Lowercase process names without ".exe" or ".app". */
  processes: string[];
  /** "block" stops the exam from starting. "warn" asks the learner to close it and is noted. */
  action: "block" | "warn";
};

/** Best effort and easy to extend. A person can always rename a process, so this discourages and documents. */
export const SECURE_BLOCKED_APPS: readonly BlockedAppRule[] = [
  {
    id: "teamviewer",
    label: "TeamViewer",
    category: "REMOTE_ACCESS",
    processes: ["teamviewer"],
    action: "block",
  },
  {
    id: "anydesk",
    label: "AnyDesk",
    category: "REMOTE_ACCESS",
    processes: ["anydesk"],
    action: "block",
  },
  {
    id: "rustdesk",
    label: "RustDesk",
    category: "REMOTE_ACCESS",
    processes: ["rustdesk"],
    action: "block",
  },
  {
    id: "chrome-remote",
    label: "Chrome Remote Desktop",
    category: "REMOTE_ACCESS",
    processes: ["remoting_host"],
    action: "block",
  },
  {
    id: "parsec",
    label: "Parsec",
    category: "REMOTE_ACCESS",
    processes: ["parsecd", "parsec"],
    action: "block",
  },
  {
    id: "vnc",
    label: "VNC",
    category: "REMOTE_ACCESS",
    processes: ["vncviewer", "vncserver", "tvnserver"],
    action: "block",
  },
  {
    id: "obs",
    label: "OBS Studio",
    category: "SCREEN_RECORDER",
    processes: ["obs", "obs32", "obs64"],
    action: "block",
  },
  {
    id: "camtasia",
    label: "Camtasia",
    category: "SCREEN_RECORDER",
    processes: ["camtasia"],
    action: "block",
  },
  {
    id: "sharex",
    label: "ShareX",
    category: "SCREEN_RECORDER",
    processes: ["sharex"],
    action: "block",
  },
  {
    id: "bandicam",
    label: "Bandicam",
    category: "SCREEN_RECORDER",
    processes: ["bandicam"],
    action: "block",
  },
  {
    id: "loom",
    label: "Loom",
    category: "SCREEN_RECORDER",
    processes: ["loom"],
    action: "block",
  },
  {
    id: "snagit",
    label: "Snagit",
    category: "SCREEN_RECORDER",
    processes: ["snagit", "snagit32", "snagiteditor"],
    action: "block",
  },
  {
    id: "screenflow",
    label: "ScreenFlow",
    category: "SCREEN_RECORDER",
    processes: ["screenflow"],
    action: "block",
  },
  {
    id: "quicktime",
    label: "QuickTime Player",
    category: "SCREEN_RECORDER",
    processes: ["quicktime player"],
    action: "block",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    category: "AI_ASSISTANT",
    processes: ["chatgpt"],
    action: "block",
  },
  {
    id: "claude",
    label: "Claude",
    category: "AI_ASSISTANT",
    processes: ["claude"],
    action: "block",
  },
  {
    id: "copilot",
    label: "Copilot",
    category: "AI_ASSISTANT",
    processes: ["copilot"],
    action: "block",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    category: "AI_ASSISTANT",
    processes: ["perplexity"],
    action: "block",
  },
  {
    id: "ollama",
    label: "Ollama",
    category: "AI_ASSISTANT",
    processes: ["ollama", "ollama app"],
    action: "block",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    category: "AI_ASSISTANT",
    processes: ["lm studio", "lmstudio"],
    action: "block",
  },
  {
    id: "zoom",
    label: "Zoom",
    category: "SCREEN_SHARE",
    processes: ["zoom", "zoom.us"],
    action: "warn",
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    category: "SCREEN_SHARE",
    processes: ["teams", "ms-teams", "msteams"],
    action: "warn",
  },
  {
    id: "discord",
    label: "Discord",
    category: "SCREEN_SHARE",
    processes: ["discord"],
    action: "warn",
  },
  {
    id: "skype",
    label: "Skype",
    category: "SCREEN_SHARE",
    processes: ["skype"],
    action: "warn",
  },
];

export type SecurePolicy = {
  heartbeatIntervalSeconds: number;
  heartbeatGraceSeconds: number;
  /** On when the course asks for camera photos. Mentors can still grant a camera-free sitting. */
  requireCamera: boolean;
  blockedApps: readonly BlockedAppRule[];
};

export type SecureCameraCheck = "OK" | "MISSING" | "DENIED" | "SKIPPED";

export type SecurePrecheckFinding = Pick<
  BlockedAppRule,
  "id" | "label" | "category" | "action"
>;

export type SecurePrecheckReport = {
  platform: "win32" | "darwin" | "linux";
  appVersion: string;
  /** Only apps that matched the policy. The full list of running programs never leaves the machine. */
  apps: SecurePrecheckFinding[];
  displayCount: number;
  virtualMachine: boolean;
  camera: SecureCameraCheck;
  checkedAt: string;
};

export function normalizeProcessName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.(exe|app)$/, "");
}

/** Matches running process names against the policy. Pure, so tests and the server can use it too. */
export function matchBlockedApps(
  processNames: readonly string[],
  rules: readonly BlockedAppRule[],
): SecurePrecheckFinding[] {
  const running = new Set(processNames.map(normalizeProcessName));
  return rules
    .filter((rule) => rule.processes.some((name) => running.has(name)))
    .map(({ id, label, category, action }) => ({
      id,
      label,
      category,
      action,
    }));
}

/** The one rule both the app and the server use to decide whether an exam may open. */
export function evaluateSecurePrecheck(
  report: SecurePrecheckReport,
  policy: Pick<SecurePolicy, "requireCamera">,
): { ok: boolean; blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const app of report.apps) {
    (app.action === "block" ? blockers : warnings).push(`Close ${app.label}`);
  }
  if (report.displayCount > SECURE_LIMITS.maxDisplays)
    blockers.push("Disconnect extra monitors");
  if (report.virtualMachine)
    blockers.push("Run the exam on the computer itself, not a virtual machine");
  if (policy.requireCamera && report.camera !== "OK")
    blockers.push("Turn on your camera");
  return { ok: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Launch, session and heartbeat
// ---------------------------------------------------------------------------

/** What the website gets when a learner clicks "Start exam" in a secure course. */
export type SecureLaunch = {
  token: string;
  expiresAt: string;
  deepLink: string;
  courseSlug: string;
  chapterSlug: string;
};

export type SecureExchangeResult = {
  chapterId: string;
  attempt: IntegrityAttemptSession;
  policy: SecurePolicy;
};

export type SecureHeartbeatResult = {
  nextInSeconds: number;
  flagCount: number;
};

// ---------------------------------------------------------------------------
// Risk score and review
// ---------------------------------------------------------------------------

export type IntegrityRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type IntegrityRisk = {
  /** 0 to 100. */
  score: number;
  level: IntegrityRiskLevel;
  reasons: Array<{ type: IntegrityEventType; count: number; points: number }>;
};

/** Points per event and the most one kind can add, so a noisy connection cannot dominate. */
export const INTEGRITY_RISK_WEIGHTS: Record<
  IntegrityEventType,
  { points: number; cap: number }
> = {
  TAB_HIDDEN: { points: 3, cap: 15 },
  WINDOW_BLUR: { points: 3, cap: 15 },
  FULLSCREEN_EXIT: { points: 4, cap: 12 },
  COPY_BLOCKED: { points: 2, cap: 8 },
  PASTE_BLOCKED: { points: 4, cap: 16 },
  CONTEXT_MENU_BLOCKED: { points: 1, cap: 3 },
  SCREENSHOT_KEY: { points: 8, cap: 24 },
  MOUSE_LEFT: { points: 1, cap: 5 },
  SECOND_SCREEN: { points: 20, cap: 20 },
  FAST_ANSWER: { points: 6, cap: 18 },
  CAMERA_OFF: { points: 0, cap: 0 },
  CAMERA_ON: { points: 0, cap: 0 },
  BLOCKED_APP: { points: 20, cap: 40 },
  VIRTUAL_MACHINE: { points: 25, cap: 25 },
  HEARTBEAT_GAP: { points: 10, cap: 30 },
  TYPING_BURST: { points: 8, cap: 24 },
  FACE_MISSING: { points: 3, cap: 15 },
  FACE_MULTIPLE: { points: 12, cap: 24 },
};

export function scoreIntegrityRisk(
  counts: Partial<Record<IntegrityEventType, number>>,
): IntegrityRisk {
  const reasons: IntegrityRisk["reasons"] = [];
  let total = 0;
  for (const type of INTEGRITY_EVENT_TYPES) {
    const count = counts[type] ?? 0;
    const { points, cap } = INTEGRITY_RISK_WEIGHTS[type];
    const earned = Math.min(count * points, cap);
    if (count > 0 && earned > 0) {
      reasons.push({ type, count, points: earned });
      total += earned;
    }
  }
  const score = Math.min(100, total);
  reasons.sort((a, b) => b.points - a.points);
  return {
    score,
    level: score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW",
    reasons,
  };
}

/** Only a person picks one of these. Nothing in the system fails a learner on its own. */
export const INTEGRITY_REVIEW_DECISIONS = [
  "CLEARED",
  "NEEDS_FOLLOWUP",
  "CONFIRMED_VIOLATION",
] as const;
export type IntegrityReviewDecision =
  (typeof INTEGRITY_REVIEW_DECISIONS)[number];

export const INTEGRITY_REVIEW_LABELS: Record<IntegrityReviewDecision, string> =
  {
    CLEARED: "Cleared",
    NEEDS_FOLLOWUP: "Needs a follow-up",
    CONFIRMED_VIOLATION: "Violation confirmed",
  };

export type IntegrityReviewRecord = {
  decision: IntegrityReviewDecision;
  note: string | null;
  reviewerName: string;
  reviewedAt: string;
};

/** One row of the mentor's review queue. */
export type IntegrityLearnerAttempt = IntegrityAttemptSummary & {
  enrollmentId: string;
  learner: { id: string; name: string | null };
};

/** One row of the mentor's review queue. */
export type IntegrityFlaggedAttempt = IntegrityLearnerAttempt;

/** A learner counts as online when something reached the server this recently. */
export const INTEGRITY_ONLINE_WINDOW_MS = 25_000;

/** Pushed to a course's mentors the moment an attempt changes. It carries the real, freshly read attempt. */
export type IntegrityLiveUpdate = {
  enrollmentId: string;
  courseId: string;
  attempt: IntegrityAttemptSummary;
};

/** The course-level live board: sittings from the last ten minutes, plus the review queue. */
export type IntegrityOverview = {
  course: { id: string; slug: string; title: string };
  /** Every attempt this course has, so an empty live list can say whether any exist at all. */
  totals: { attempts: number; lastSeenAt: string | null };
  live: IntegrityLearnerAttempt[];
  flagged: IntegrityLearnerAttempt[];
  /** Only quizzes where at least one learner has submitted a written answer. */
  quizChapters: Array<{ id: string; title: string; learners: number }>;
  /** Plain facts about this course's integrity setup, so an empty board can be explained. */
  health: {
    mode: IntegrityMode;
    cameraOn: boolean;
    /** False when this server cannot store or sign camera photos. */
    cameraAvailable: boolean;
    eventsLastHour: number;
    lastEventAt: string | null;
    /** Live connections this mentor has open to the server. */
    streamsOpen: number;
  };
};

/** Two learners' answers that look alike. A prompt to read both, never proof of copying. */
export type IntegritySimilarPair = {
  blockId: string;
  score: number;
  method: "embedding" | "lexical";
  learners: [
    { userId: string; name: string },
    { userId: string; name: string },
  ];
};

// ---------------------------------------------------------------------------
// Rules shown before a quiz starts (website and desktop use the same words)
// ---------------------------------------------------------------------------

export const INTEGRITY_QUIZ_RULES: readonly string[] = [
  "The quiz runs in full screen. Stay in full screen until you finish.",
  "Do not switch to another window, tab or app. Your mentor can see every time you leave.",
  "Copy, cut, paste, right-click, text selection and drag are turned off.",
  "Screenshots and screen recording are not allowed.",
  "Do not use other people, other devices or AI tools to help you.",
  "Your mentor sees these notes as they happen: leaving the quiz, copy or paste attempts, screenshot keys, a second screen and unusually fast answers.",
  "If your power or connection drops, open the quiz again and tell your mentor.",
];

/** Extra rules for exams that run in the desktop app. */
export const INTEGRITY_SECURE_RULES: readonly string[] = [
  "Before the exam starts, the app checks for remote access tools, screen recorders, AI apps, extra monitors and virtual machines.",
  "Your clipboard is cleared when the exam starts, and screenshots show a blank window.",
  "While the exam runs, the app reports to the server every few seconds. If it stops, your mentor sees a gap.",
];

export const INTEGRITY_NOTES_LINE = "Notes are viewed by your mentor.";

/** Submitted written answers of a quiz, by learner name, so a mentor can read two side by side. */
export type IntegrityWrittenAnswers = {
  learners: Array<{ userId: string; name: string }>;
  questions: Array<{
    blockId: string;
    number: number;
    answers: Array<{ userId: string; name: string; text: string }>;
  }>;
};
