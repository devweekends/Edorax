"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction, type AdminActionState } from "./action-result";

export async function approveCourseAccessAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing enrollment." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/manual-access/${encodeURIComponent(id)}/approve`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Payment confirmed and access granted.";
  });
}

export async function rejectCourseAccessAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing enrollment." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/manual-access/${encodeURIComponent(id)}/reject`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Course access request rejected.";
  });
}

export async function markInstructorPayoutPaidAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing enrollment." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/manual-payouts/${encodeURIComponent(id)}/paid`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Instructor payout marked paid.";
  });
}

export async function markWithdrawalPaidAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  if (!withdrawalId) return { ok: false, message: "Missing withdrawal id." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/withdrawals/${encodeURIComponent(withdrawalId)}/pay`, { method: "POST" });
    revalidatePath("/admin/course-access");
    return "Withdrawal marked paid and payments completed.";
  });
}

export async function rejectWithdrawalAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  if (!withdrawalId) return { ok: false, message: "Missing withdrawal id." };
  return runAdminAction(async () => {
    await adminCall<void>(`/api/v1/admin/withdrawals/${encodeURIComponent(withdrawalId)}/reject`, {
      method: "POST",
      json: { reason },
    });
    revalidatePath("/admin/course-access");
    return "Withdrawal request rejected and funds returned to instructor balance.";
  });
}
