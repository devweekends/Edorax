"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminCall } from "./call";
import { runAdminAction, type AdminActionState } from "./action-result";

function revalidateEnrollmentPages(enrollmentId: string) {
  revalidatePath("/admin/enrollments");
  revalidatePath(`/admin/enrollments/${enrollmentId}`);
  revalidatePath("/admin/users", "layout");
  revalidatePath("/admin/course-access");
  revalidatePath("/admin/audit");
}

/** Deletes the enrollment and everything attached to it (progress, payment, certificate). */
export async function deleteEnrollmentAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  if (!enrollmentId) return { ok: false, message: "Missing enrollment." };
  const result = await runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/enrollments/${encodeURIComponent(enrollmentId)}`, { method: "DELETE" });
    revalidateEnrollmentPages(enrollmentId);
    return "Enrollment deleted.";
  });
  // From the detail page there is nothing left to show, so go back to the list.
  if (result.ok && formData.get("redirectTo") === "list") redirect("/admin/enrollments");
  return result;
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};

/** Saves the two editable fields: course access (lifecycle) and payment status. */
export async function updateEnrollmentAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const enrollmentId = text(formData, "enrollmentId");
  if (!enrollmentId) return { ok: false, message: "Missing enrollment." };
  const lifecycle = text(formData, "lifecycle") || undefined;
  const paymentStatus = text(formData, "paymentStatus") || undefined;
  return runAdminAction(async () => {
    await adminCall(`/api/v1/admin/enrollments/${encodeURIComponent(enrollmentId)}`, {
      method: "PATCH",
      json: { lifecycle, paymentStatus },
    });
    revalidateEnrollmentPages(enrollmentId);
    return "Enrollment saved.";
  });
}
