"use server";

import { revalidatePath } from "next/cache";
import { teachCall, type TeachActionFailure } from "./teach-call";

export type RequestWithdrawalResult = { ok: true; data: any } | TeachActionFailure;

export async function requestWithdrawalAction(
  _prev: any,
  formData: FormData
): Promise<RequestWithdrawalResult> {
  const note = String(formData.get("note") ?? "").trim();
  if (!note) {
    return { ok: false, errors: ["Transfer details / payout note is required."] };
  }
  if (note.length < 3) {
    return { ok: false, errors: ["Payout note must be at least 3 characters."] };
  }
  if (note.length > 240) {
    return { ok: false, errors: ["Payout note must be 240 characters or fewer."] };
  }

  const result = await teachCall("/api/v1/teach/wallet/withdraw", {
    method: "POST",
    json: { note },
  });

  if (result.ok) {
    revalidatePath("/wallet");
  }

  return result;
}

