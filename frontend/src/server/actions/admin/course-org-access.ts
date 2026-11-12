"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction, type AdminActionState } from "./action-result";

/** Platform-admin write actions for organization free access to a course. */
export async function grantCourseOrgAccessAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const courseId = String(formData.get("courseId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!courseId) return { ok: false, message: "Missing course." };
  if (!organizationId) return { ok: false, message: "Choose an organization." };

  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/courses/${encodeURIComponent(courseId)}/org-access`, {
      method: "POST",
      json: { organizationId },
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    return "Free access granted to the organization.";
  });
}

/** Bulk make-free or revoke for several allocated courses, submitted from the organization's catalog table. */
export async function setCoursesFreeForOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const courseIds = [...new Set(formData.getAll("courseIds").map(String).filter(Boolean))];
  const freeForOrganization = formData.get("freeForOrganization") === "true";
  if (!organizationId) throw new Error("Missing organization.");
  if (courseIds.length === 0) throw new Error("Select at least one course.");

  await adminCall(`/api/v1/admin/organizations/${encodeURIComponent(organizationId)}/free-access`, {
    method: "POST",
    json: { courseIds, freeForOrganization },
  });
  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function revokeCourseOrgAccessAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const courseId = String(formData.get("courseId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!courseId || !organizationId) return { ok: false, message: "Missing course or organization." };

  return runAdminAction(async () => {
    await adminCall<void>(
      `/api/v1/admin/courses/${encodeURIComponent(courseId)}/org-access/${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    );
    revalidatePath(`/admin/organizations/${organizationId}`);
    return "Free access revoked.";
  });
}
