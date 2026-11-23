import { z } from "zod";
import {
  INTEGRITY_EVENT_TYPES,
  INTEGRITY_LIMITS,
  INTEGRITY_MODES,
  INTEGRITY_REVIEW_DECISIONS,
} from "../shared/api/integrity.js";
import { id, params } from "./common.js";

export const attemptParams = params("attemptId");

const metaValue = z.union([
  z.string().max(120),
  z.number().finite(),
  z.boolean(),
]);

export const integrityEventsBody = z.object({
  events: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
        type: z.enum(INTEGRITY_EVENT_TYPES),
        at: z.string().datetime({ offset: true }),
        blockId: id.max(64).nullish(),
        meta: z
          .record(z.string().max(32), metaValue)
          .refine(
            (meta) => Object.keys(meta).length <= 8,
            "Too many meta fields",
          )
          .optional(),
      }),
    )
    .min(1)
    .max(INTEGRITY_LIMITS.eventsPerBatch),
});
export type IntegrityEventsBody = z.infer<typeof integrityEventsBody>;

export const integrityCameraBody = z.object({
  status: z.enum(["ON", "DECLINED", "UNAVAILABLE"]),
});
export type IntegrityCameraBody = z.infer<typeof integrityCameraBody>;

export const courseIntegrityBody = z
  .object({
    integritySnapshots: z.boolean().optional(),
    integrityMode: z.enum(INTEGRITY_MODES).optional(),
  })
  .refine(
    (body) =>
      body.integritySnapshots !== undefined || body.integrityMode !== undefined,
    "Nothing to change",
  );
export type CourseIntegrityBody = z.infer<typeof courseIntegrityBody>;

export const chapterIdParams = params("chapterId");

// --- Secure mode (desktop app) ---

/** The one-time link from the website: 43 URL-safe characters (32 random bytes). */
export const secureExchangeBody = z.object({
  chapterId: id.max(64),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const precheckReport = z.object({
  platform: z.enum(["win32", "darwin", "linux"]),
  appVersion: z.string().max(32),
  apps: z
    .array(
      z.object({
        id: z.string().max(40),
        label: z.string().max(60),
        category: z.enum([
          "REMOTE_ACCESS",
          "SCREEN_RECORDER",
          "AI_ASSISTANT",
          "SCREEN_SHARE",
        ]),
        action: z.enum(["block", "warn"]),
      }),
    )
    .max(30),
  displayCount: z.number().int().min(0).max(16),
  virtualMachine: z.boolean(),
  camera: z.enum(["OK", "MISSING", "DENIED", "SKIPPED"]),
  checkedAt: z.string().datetime({ offset: true }),
});

/**
 * The app's signature (see services/integrity/app-proof.ts). It is optional here on purpose: the
 * service refuses a missing one with a clear message instead of a generic validation error.
 */
const appProof = z.object({
  ts: z.number().int().positive(),
  sig: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

/** `consent` must be literally true: the app only sends this after the learner presses the consent button. */
export const secureStartBody = z.object({
  consent: z.literal(true),
  precheck: precheckReport,
  proof: appProof.optional(),
});
export type SecureStartBody = z.infer<typeof secureStartBody>;

/** Heartbeat and finish carry nothing but the signature. */
export const secureProofBody = z.object({ proof: appProof.optional() }).optional();
export type SecureProofBody = z.infer<typeof secureProofBody>;
export type SecureExchangeBody = z.infer<typeof secureExchangeBody>;

export const integrityReviewBody = z.object({
  decision: z.enum(INTEGRITY_REVIEW_DECISIONS),
  note: z.string().trim().max(1000).nullish(),
});
export type IntegrityReviewBody = z.infer<typeof integrityReviewBody>;

export const snapshotFileParams = z.object({
  file: z.string().regex(/^[a-z0-9]{20,40}\.jpg$/),
});
