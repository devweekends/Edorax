import "dotenv/config";
import { z } from "zod";
import { isValidSemver } from "../utils/semver.js";

// Every environment variable the API reads is declared here and validated once at
// boot. Modules import `env`, never `process.env`, so a missing or malformed value
// fails fast with a readable message instead of surfacing deep inside a request.

const commaList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

const optionalSemver = (name: string) =>
  optionalString.refine(
    (value) => value === undefined || isValidSemver(value),
    `${name} must be a plain semver version such as 0.1.0 or 0.2.0-beta.1`
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** Public URL of the web app — redirects and email links point here. */
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Browser origins allowed to call the API directly. */
  CORS_ORIGINS: commaList,

  AUTH_RESEND_KEY: optionalString,
  EMAIL_FROM: z.string().default("buildment <onboarding@resend.dev>"),
  ADMIN_NOTIFY_EMAIL: commaList,

  /** Shared secret an external scheduler presents to the jobs endpoints. */
  CRON_SECRET: optionalString,
  /** In-process scheduled jobs (study reminders, cleanup). Turn off when another replica or an external cron owns them. */
  JOBS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  WEEKLY_GOAL_REMINDER_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(9),
  /** Daily job that deletes quiz camera stills older than 30 days. */
  INTEGRITY_RETENTION_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(3),

  /** Background worker that sends queued notification email and pushes live notifications. */
  NOTIFICATION_WORKER_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(5_000),
  /** Most routine study reminders one user can get in 24 hours, across all their courses. 0 turns them off. */
  REMINDER_DAILY_LIMIT: z.coerce.number().int().min(0).max(5).default(1),
  /**
   * Signs notification-stream tickets. Optional for one API process (a random secret is made at
   * boot); set the same value on every replica when the API runs more than one.
   */
  REALTIME_TOKEN_SECRET: optionalString,

  /** OpenRouter access for AI review drafts; drafting is disabled without a key. */
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_REVIEW_MODEL: optionalString,
  /** Default model for learner AI interviews; each learner may pick another one. */
  OPENROUTER_INTERVIEW_MODEL: optionalString,
  /**
   * 32 random bytes, base64, used to encrypt learners' own AI keys (AES-256-GCM).
   * Without it the AI interview feature reports that it is not set up.
   */
  AI_KEY_ENCRYPTION_KEY: optionalString.refine(
    (value) => value === undefined || (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32),
    "AI_KEY_ENCRYPTION_KEY must be 32 bytes encoded as base64 (for example: openssl rand -base64 32)"
  ),

  /**
   * "Ask about this chapter" for learners, answered by Anthropic with the platform key.
   * Off unless LEARNER_QA_ENABLED is "true" and ANTHROPIC_API_KEY is set. The limits are
   * counted in the database, so they hold across restarts and replicas.
   */
  ANTHROPIC_API_KEY: optionalString,
  LEARNER_QA_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  LEARNER_QA_MODEL: z.string().trim().min(1).default("claude-haiku-5-5"),
  /** Questions one learner may ask per UTC day. */
  LEARNER_QA_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(80),
  /** Questions the whole platform may answer per UTC day, the cap on the Anthropic bill. */
  LEARNER_QA_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(500),

  /**
   * Capstone checker (docs/16-capstone-checker-and-certificates.mdx): automated checks plus an AI
   * grade with the platform's ANTHROPIC_API_KEY, the same key the chapter questions use. On whenever
   * the key is set; CAPSTONE_CHECK_ENABLED=false switches it off. Only courses with a capstone block
   * use it, and the limits are counted in the database like the chapter question limits.
   */
  CAPSTONE_CHECK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  CAPSTONE_MODEL: z.string().trim().min(1).default("claude-sonnet-5-5"),
  CAPSTONE_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  /** Input budget for one check; the repo snapshot is trimmed to fit. */
  CAPSTONE_MAX_INPUT_TOKENS: z.coerce.number().int().min(4_000).max(200_000).default(40_000),
  CAPSTONE_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_000).max(32_000).default(8_000),
  /** Checks one learner may start per capstone block per UTC day. */
  CAPSTONE_LEARNER_DAILY_LIMIT: z.coerce.number().int().min(1).max(50).default(3),
  /** AI grades the whole platform may run per UTC day, the cap on the Anthropic bill. */
  CAPSTONE_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(150),
  /** Optional fine-grained GitHub token, public read only. Without it the API allows 60 calls an hour, about 12 checks. */
  GITHUB_TOKEN: optionalString,
  /** Edorax's LinkedIn company id for Add to profile; without it LinkedIn gets the name "Edorax" as text. */
  CERTIFICATE_LINKEDIN_ORG_ID: optionalString,

  /** Private Cloudflare R2 bucket used for instructor-uploaded course images. */
  R2_ENDPOINT: optionalString,
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  /**
   * Signs the short-lived links mentors use to view quiz snapshots. Set it when more
   * than one API replica runs; otherwise each process makes its own at boot.
   */
  INTEGRITY_MEDIA_SECRET: optionalString,

  /**
   * Gamification switches (docs/14-gamification.mdx), each on unless set to "false". Levels and
   * leaderboards are built from XP, so they switch off with it.
   */
  GAMIFICATION_XP: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  GAMIFICATION_STREAK_FREEZES: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  GAMIFICATION_LEVELS: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  GAMIFICATION_CAREER_LEVELS: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  GAMIFICATION_CREDITS: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  GAMIFICATION_LEADERBOARDS: z
    .string()
    .optional()
    .transform((value) => value !== "false"),

  /**
   * Forced desktop updates. The desktop app sends its version in X-Edorax-Desktop-Version and gets
   * 426 DESKTOP_UPDATE_REQUIRED while it is lower than DESKTOP_MIN_VERSION. The default 0.0.0 blocks
   * nothing. Change them with an environment change and a restart; no code deploy is needed.
   */
  DESKTOP_MIN_VERSION: optionalSemver("DESKTOP_MIN_VERSION"),
  /** Newest released desktop version, for a soft "update available" prompt. Defaults to DESKTOP_MIN_VERSION. */
  DESKTOP_LATEST_VERSION: optionalSemver("DESKTOP_LATEST_VERSION"),
  DESKTOP_DOWNLOAD_URL: z.string().trim().url().default("https://github.com/devweekends/Edorax/releases/latest"),
  /** Optional short text shown in the update screen; replaces the default 426 message. */
  DESKTOP_UPDATE_MESSAGE: optionalString,

  /** Local testing only: e2e suites sign up repeatedly from one IP. Never set in production. */
  DISABLE_RATE_LIMITS: z
    .string()
    .optional()
    .transform((value) => value === "true"),

  /**
   * Polar checkout for paid course enrollment. The token and the webhook secret must both be set
   * before learners can start a Polar session; the API still boots without them so local/dev stays
   * usable. Each course gets its own Polar product on its first checkout, so no product id is set.
   */
  POLAR_ACCESS_TOKEN: optionalString,
  POLAR_WEBHOOK_SECRET: optionalString,
  POLAR_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
});

type Parsed = z.infer<typeof schema>;
/** The parsed environment with the desktop version defaults filled in. */
export type Env = Omit<Parsed, "DESKTOP_MIN_VERSION" | "DESKTOP_LATEST_VERSION"> & {
  DESKTOP_MIN_VERSION: string;
  DESKTOP_LATEST_VERSION: string;
};

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const desktopMinVersion = parsed.data.DESKTOP_MIN_VERSION ?? "0.0.0";
  return {
    ...parsed.data,
    APP_URL: parsed.data.APP_URL.replace(/\/$/, ""),
    DESKTOP_MIN_VERSION: desktopMinVersion,
    DESKTOP_LATEST_VERSION: parsed.data.DESKTOP_LATEST_VERSION ?? desktopMinVersion,
  };
}

export const env = loadEnv();

/** Origins a browser may open the notification stream from: the web app plus any direct API clients. */
export const realtimeOrigins = [...new Set([env.APP_URL, ...env.CORS_ORIGINS])];

export const isProduction = env.NODE_ENV === "production";
export const rateLimitsEnabled = !(env.DISABLE_RATE_LIMITS && !isProduction);
export const isTest = env.NODE_ENV === "test";
/** Chapter questions need both the switch and a key; either missing hides the feature. */
export const learnerQaAvailable = env.LEARNER_QA_ENABLED && Boolean(env.ANTHROPIC_API_KEY);
/** Capstone AI checks need both the switch and the key; automated checks never run without them either. */
export const capstoneCheckAvailable = env.CAPSTONE_CHECK_ENABLED && Boolean(env.ANTHROPIC_API_KEY);
/** Paid course Polar checkout needs the org token and the webhook secret. */
export const polarPaymentsConfigured = Boolean(env.POLAR_ACCESS_TOKEN && env.POLAR_WEBHOOK_SECRET);
