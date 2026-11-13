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

async function startPolarCheckout(enrollmentId: string, courseSlug: string): Promise<never> {
  try {
    const session = await serverApiFetch<{ url: string }>(`/api/v1/enrollments/${encodeURIComponent(enrollmentId)}/checkout`, {
      method: "POST",
    });
    redirect(session.url);
  } catch (error) {
    if (error instanceof ApiError) {
      redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout?checkout_failed=1&code=${encodeURIComponent(error.code ?? "CHECKOUT_FAILED")}`);
    }
    throw error;
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
  revalidatePath(`/courses/${result.courseSlug}/checkout`);
  // Partial payment still owed: stay on checkout so the learner sees the remaining price and chooses Pay.
  // Only purchaseCourseAccessAction should send them to Polar.
  if (result.lifecycle === "PAYMENT_REQUIRED") {
    const applied = couponCode ? "discount_applied=1" : "";
    redirect(`/courses/${encodeURIComponent(result.courseSlug)}/checkout${applied ? `?${applied}` : ""}`);
  }
  await leaveEnrollmentForMascot(courseId);
  redirect(returnTo ?? `/courses/${result.courseSlug}`);
}

/** Create or reuse a Polar checkout session and send the learner there. */
export async function purchaseCourseAccessAction(formData: FormData): Promise<void> {
  const courseId = String(formData.get("courseId") ?? "");
  const courseSlug = String(formData.get("courseSlug") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  if (!courseSlug) throw new Error("Missing course.");

  let id = enrollmentId;
  if (!id) {
    if (!courseId) throw new Error("Missing course.");
    try {
      const result = await serverApiFetch<SelfEnrollResult>("/api/v1/enrollments", { method: "POST", json: { courseId } });
      refreshLearnerPages();
      if (result.lifecycle !== "PAYMENT_REQUIRED") {
        await leaveEnrollmentForMascot(courseId);
        redirect(`/courses/${result.courseSlug}`);
      }
      id = result.enrollmentId;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === ENROLLMENT_ERROR_CODES.ALREADY_ENROLLED) {
        redirect(`/courses/${encodeURIComponent(courseSlug)}`);
      }
      if (error instanceof ApiError && error.status === 409 && error.code === ENROLLMENT_ERROR_CODES.PAYMENT_PENDING) {
        const checkout = await serverApiFetch<{ enrollment: { id: string } | null }>(
          `/api/v1/courses/${encodeURIComponent(courseSlug)}/checkout`
        );
        if (!checkout.enrollment) redirect(`/courses/${encodeURIComponent(courseSlug)}/checkout`);
        id = checkout.enrollment.id;
      } else {
        throw error;
      }
    }
  }

  await startPolarCheckout(id, courseSlug);
}
