"use server";

import { revalidatePath } from "next/cache";
import { teachCall, type TeachActionFailure } from "./teach-call";

export type CampaignParticipationResult = { ok: true; data: any } | TeachActionFailure;

export async function setCampaignParticipationAction(
  campaignId: string,
  courseIds: string[]
): Promise<CampaignParticipationResult> {
  if (!campaignId) {
    return { ok: false, errors: ["Missing campaign ID."] };
  }

  const result = await teachCall(`/api/v1/teach/campaigns/${encodeURIComponent(campaignId)}/participate`, {
    method: "POST",
    json: { courseIds },
  });

  if (result.ok) {
    revalidatePath("/campaigns");
  }

  return result;
}

