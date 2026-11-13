import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";
import { env, polarPaymentsConfigured } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

let client: Polar | null = null;

/** Throws when Polar env is incomplete so callers get a stable client-facing code. */
export function requirePolarConfig() {
  if (!polarPaymentsConfigured || !env.POLAR_ACCESS_TOKEN || !env.POLAR_WEBHOOK_SECRET) {
    throw new AppError("Online payments are not configured on this server.", 503, "PAYMENTS_NOT_CONFIGURED");
  }
  return {
    accessToken: env.POLAR_ACCESS_TOKEN,
    webhookSecret: env.POLAR_WEBHOOK_SECRET,
    environment: env.POLAR_ENVIRONMENT,
  };
}

export function getPolarClient(): Polar {
  const config = requirePolarConfig();
  if (!client) {
    client = createPolar({
      accessToken: config.accessToken,
      environment: config.environment,
    });
  }
  return client;
}

/** Test helper: drop the cached client after env mocks change. */
export function resetPolarClientForTests() {
  client = null;
}
