import type { RequestHandler } from "express";
import { NotFoundError } from "../utils/errors.js";

// TODO: Review and complete the withdrawal workflow before enabling it.
const INSTRUCTOR_WITHDRAWALS_ENABLED = false;

export function instructorWithdrawalsEnabled(): boolean {
  return INSTRUCTOR_WITHDRAWALS_ENABLED;
}

export const requireInstructorWithdrawals: RequestHandler = (_req, _res, next) => {
  if (!instructorWithdrawalsEnabled()) {
    return next(new NotFoundError("Instructor withdrawals are not available."));
  }
  next();
};
