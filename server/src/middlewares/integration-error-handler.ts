import type { ErrorRequestHandler } from "express";
import { AllocationError } from "../services/integrations/allocation.js";
import { PathmentEnrollmentError } from "../services/integrations/pathment/create-pathment-enrollment.js";
import { InsufficientOrganizationCreditsError } from "../services/organizations/credits.js";
import { logError, normalizeError, publicMessage } from "./error-handler.js";

// The organisation API is a published contract consumed by Pathment, so it keeps
// its own error shape: `{ error, code? }` — not the first-party envelope.
export const integrationErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof PathmentEnrollmentError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof AllocationError) {
    const status = error.code === "NOT_ALLOCATED" ? 404 : 403;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  if (error instanceof InsufficientOrganizationCreditsError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }

  const appError = normalizeError(error);
  logError(appError, req);
  const body: { error: string; code?: string } = { error: publicMessage(appError) };
  if (appError.code !== "INTERNAL" && appError.code !== "VALIDATION_ERROR") body.code = appError.code;
  res.status(appError.statusCode).json(body);
};
