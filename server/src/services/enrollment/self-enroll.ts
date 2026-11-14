import { ENROLLMENT_ERROR_CODES, type SelfEnrollResult } from "../../shared/api/catalog.js";
import { prisma } from "../../db/prisma.js";
import { ConflictError, NotFoundError } from "../../utils/errors.js";
import { notifyMentorNewEnrollment } from "../notifications/events.js";
import { dispatchNotification } from "../notifications/service.js";
import { SelfEnrollmentError, createSelfEnrollment } from "./create-self-enrollment.js";

/** Learner enrols themselves from the catalog. Paid courses land in PAYMENT_REQUIRED. */
export async function selfEnroll(userId: string, courseId: string, couponCode?: string): Promise<SelfEnrollResult> {
  try {
    const result = await createSelfEnrollment(prisma, { userId, courseId, couponCode });
    if (result.created && !result.ownCourse) await dispatchNotification(() => notifyMentorNewEnrollment(result.enrollmentId));
    return result;
  } catch (error) {
    if (!(error instanceof SelfEnrollmentError)) throw error;
    switch (error.code) {
      case "COURSE_NOT_FOUND":
        throw new NotFoundError(error.message);
      case "NOT_PUBLISHED":
        throw new ConflictError(error.message, ENROLLMENT_ERROR_CODES.NOT_PUBLISHED);
      case "PAYMENT_PENDING":
        throw new ConflictError(error.message, ENROLLMENT_ERROR_CODES.PAYMENT_PENDING);
      case "ALREADY_ENROLLED":
        throw new ConflictError(error.message, ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED);
      case "COUPON_INVALID":
      case "COUPON_EXHAUSTED":
      case "COUPON_NOT_APPLICABLE":
        throw new ConflictError(error.message, error.code);
    }
  }
}
