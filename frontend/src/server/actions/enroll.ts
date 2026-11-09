"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ENROLLMENT_ERROR_CODES, type SelfEnrollResult } from "@/shared/api/catalog";
import { safeRedirectTo } from "@/shared/lib/safe-redirect";
import { ApiError } from "@/lib/api-client";
import { serverApiFetch } from "@/lib/api-server";
import {
  PENDING_ENGAGEMENT_COOKIE,
  PENDING_ENGAGEMENT_MAX_AGE_SECONDS,
  formatPendingEnrollment,
} from "@/lib/engagement/pending-event";

function refreshLearnerPages() {
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath("/catalog");
}

/** The redirect leaves no client code running, so the next page reports the enrollment. */
async function leaveEnrollmentForMascot(courseId: string) {
  const value = formatPendingEnrollment(courseId);
  if (!value) return;
  try {
    (await cookies()).set(PENDING_ENGAGEMENT_COOKIE, value, {
      path: "/",
      maxAge: PENDING_ENGAGEMENT_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Engagement is optional; the enrollment itself already succeeded.
  }
}

export async function selfEnrollInCourseAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");
  const courseSlug = String(formData.get("courseSlug") ?? "");
  const couponCode = String(formData.get("couponCode") ?? "").trim();
  const returnTo = safeRedirectTo(String(formData.get("returnTo") ?? "").trim());
  if (!courseId || !courseSlug) throw new Error("Missing course.");

  let result: SelfEnrollResult;
  try {
    result = await serverApiFetch<SelfEnrollResult>("/api/v1/enrollments", { method: "POST", json: { courseId, ...(couponCode ? { couponCode } : {}) } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Already enrolled or awaiting payment: send the learner where they can continue.
      if (error.code === ENROLLMENT_ERROR_CODES.PAYMENT_PENDING) redirect(`/courses/${courseSlug}/checkout`);
      if (error.code === ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED) redirect(returnTo ?? `/courses/${courseSlug}`);
      if ([ENROLLMENT_ERROR_CODES.COUPON_INVALID, ENROLLMENT_ERROR_CODES.COUPON_EXHAUSTED, ENROLLMENT_ERROR_CODES.COUPON_NOT_APPLICABLE].some((code) => code === error.code)) {
        redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout?coupon_error=${encodeURIComponent(error.code ?? "invalid")}`);
      }
      throw new Error(error.message);
    }
    throw error;
  }

  refreshLearnerPages();
  if (result.lifecycle === "PAYMENT_REQUIRED") {
    let emailSent = false;
    try {
      const request = await serverApiFetch<{ emailSent: boolean }>(`/api/v1/enrollments/${encodeURIComponent(result.enrollmentId)}/request-access`, { method: "POST" });
      emailSent = request.emailSent;
    } catch {
      redirect(`/courses/${result.courseSlug}/checkout?request_failed=1`);
    }
    if (!emailSent) redirect(`/courses/${result.courseSlug}/checkout?requested=1&email_unavailable=1`);
    redirect(`/courses/${result.courseSlug}/checkout?requested=1`);
  }
  await leaveEnrollmentForMascot(courseId);
  redirect(returnTo ?? `/courses/${result.courseSlug}`);
}

/** Ask an administrator to arrange payment and approve access. */
export async function requestCourseAccessAction(formData: FormData): Promise<void> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const courseSlug = String(formData.get("courseSlug") ?? "");
  if (!enrollmentId || !courseSlug) throw new Error("Missing enrollment.");
  let emailSent = false;
  try {
    const request = await serverApiFetch<{ emailSent: boolean }>(`/api/v1/enrollments/${encodeURIComponent(enrollmentId)}/request-access`, { method: "POST" });
    emailSent = request.emailSent;
  } catch {
    redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout?request_failed=1`);
  }
  if (!emailSent) redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout?requested=1&email_unavailable=1`);
  redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout?requested=1`);
}
