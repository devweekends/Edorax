"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CreatedOrganization, IssuedCredential } from "@/shared/api/admin";
import { adminCall } from "./call";
import { runAdminAction, toAdminActionState, type AdminActionState } from "./action-result";

// Tenants and their integration access. The API returns a credential secret
// exactly once; the page shows it through the redirect query, as before.

function credentialRevealUrl(organizationId: string, credential: IssuedCredential) {
  return `/admin/organizations/${organizationId}?accessKey=${encodeURIComponent(credential.accessKey)}&secret=${encodeURIComponent(credential.secret)}`;
}

export async function createOrganizationAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  let created: CreatedOrganization;
  try {
    created = await adminCall<CreatedOrganization>("/api/v1/admin/organizations", {
      method: "POST",
      json: { name: String(formData.get("name") ?? ""), slug: String(formData.get("slug") ?? "") || undefined },
    });
  } catch (error) {
    return toAdminActionState(error);
  }
  revalidatePath("/admin/organizations");
  // redirect() throws Next.js control-flow; keep it outside the try/catch above.
  redirect(credentialRevealUrl(created.organization.id, created.credential));
}

export async function rotateOrganizationCredentialFormAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, message: "Missing organization." };
  let credential: IssuedCredential;
  try {
    credential = await adminCall<IssuedCredential>(
      `/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/credentials/rotate`,
      { method: "POST" }
    );
  } catch (error) {
    return toAdminActionState(error);
  }
  revalidatePath(`/admin/organizations/${organizationId}`);
  redirect(credentialRevealUrl(organizationId, credential));
}

/** Allocate many published courses to an org catalog in one step (platform admin). */
export async function bulkUpsertOrganizationCourseAllocationsAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, message: "Missing organization." };

  const courseIds = [...new Set(formData.getAll("courseIds").map(String).filter(Boolean))];
  const removeCourseIds = [...new Set(formData.getAll("removeCourseIds").map(String).filter(Boolean))];
  if (courseIds.length === 0 && removeCourseIds.length === 0) return { ok: false, message: "No course access changes selected." };

  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/allocations`, {
      method: "PUT",
      json: {
        isAllowed: formData.get("isAllowed") === "on" || formData.get("isAllowed") === "true",
        courses: courseIds.map((courseId) => ({
          courseId,
          maxEnrollments: Number(formData.get(`maxEnrollments_${courseId}`) ?? 0),
          expiresAt: String(formData.get(`expiresAt_${courseId}`) ?? "").trim(),
        })),
        removeCourseIds,
      },
    });

    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath("/admin/organizations");
    revalidatePath("/admin/requests");
    return `Saved ${courseIds.length} course${courseIds.length === 1 ? "" : "s"}.`;
  });
}

/**
 * Turns integration enrollments on or off for one allocated course. This is the
 * flag the integration catalog filters on, so a course with it off cannot be
 * assigned even though it sits in the organization's catalog.
 */
export async function setAllocationAllowedAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!organizationId || !courseId) throw new Error("Missing organization or course.");
  await adminCall(
    `/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/allocations/${encodeURIComponent(courseId)}/allowed`,
    { method: "PATCH", json: { enabled: formData.get("enabled") === "true" } }
  );
  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/admin/organizations");
}

/** Lets (or stops) an organization's learners joining a course's weekly leaderboards. */
export async function setAllocationLeaderboardAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!organizationId || !courseId) throw new Error("Missing organization or course.");
  await adminCall(
    `/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/allocations/${encodeURIComponent(courseId)}/leaderboard`,
    { method: "PATCH", json: { enabled: formData.get("enabled") === "true" } }
  );
  revalidatePath(`/admin/organizations/${organizationId}`);
}




export async function grantOrganizationCreditsAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const amountDollars = Number(formData.get("amountDollars") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!organizationId) return { ok: false, message: "Missing organization." };
  if (amountDollars <= 0) return { ok: false, message: "Credit amount must be greater than zero." };

  const amountCredits = Math.round(amountDollars * 100);

  return runAdminAction(async () => {
    await adminCall(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/credits`, {
      method: "POST",
      json: { amountCredits, reason },
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    return `Granted ${amountCredits} credits ($${amountDollars.toFixed(2)}) to organization.`;
  });
}


/** Create a limited coupon pool for one allocated course, or a general pool for any allocated course. */
export async function createOrganizationCouponPoolAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) return { ok: false, message: "Missing organization." };
  return runAdminAction(async () => {
    const courseId = String(formData.get("courseId") ?? "").trim();
    await adminCall(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/coupons`, {
      method: "POST",
      json: {
        label: String(formData.get("label") ?? ""),
        courseId: courseId || null,
        code: String(formData.get("code") ?? "").trim() || null,
        percentOff: Number(formData.get("percentOff") ?? 100),
        maxRedemptions: Number(formData.get("maxRedemptions") ?? 0),
        expiresAt: String(formData.get("expiresAt") ?? "").trim(),
      },
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    return "Coupon pool created.";
  });
}

export async function setOrganizationCouponPoolActiveAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const poolId = String(formData.get("poolId") ?? "");
  if (!organizationId || !poolId) throw new Error("Missing organization or coupon pool.");
  const maxRedemptions = String(formData.get("maxRedemptions") ?? "").trim();
  const active = String(formData.get("active") ?? "").trim();
  await adminCall(
    `/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/coupons/${encodeURIComponent(poolId)}`,
    { method: "PATCH", json: {
      ...(active ? { active: active === "true" } : {}),
      ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
    } }
  );
  revalidatePath(`/admin/organizations/${organizationId}`);
}



