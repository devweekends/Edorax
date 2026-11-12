"use server";

import { revalidatePath } from "next/cache";
import { adminCall } from "./call";
import { runAdminAction } from "./action-result";

export type DiscountCampaignInput = {
  label: string; code: string | null; percentOff: number; maxRedemptions: number;
  expiresAt: string | null; autoApply: boolean; scope: "ALL" | "CATEGORY" | "SUBCATEGORY" | "TAG";
  category?: "TECH" | "SOFT_SKILLS"; subcategory?: string; tag?: string;
};

export async function createDiscountCampaign(input: DiscountCampaignInput) {
  return runAdminAction(async () => {
    await adminCall("/api/v1/admin/discount-campaigns", { method: "POST", json: input });
    revalidatePath("/admin/discounts");
    return "Discount campaign created.";
  });
}

export async function setDiscountCampaignActive(input: { id: string; active: boolean }) {
  return runAdminAction(async () => {
    await adminCall(`/api/v1/admin/discount-campaigns/${encodeURIComponent(input.id)}`, { method: "PATCH", json: { active: input.active } });
    revalidatePath("/admin/discounts");
    return `Campaign ${input.active ? "activated" : "paused"}.`;
  });
}
