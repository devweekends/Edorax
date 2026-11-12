import { serverApiFetch } from "@/lib/api-server";
import type { InstructorCampaignsView } from "@/shared/api/teach";
import { CampaignCard } from "@/components/teach/campaigns/campaign-card";
import { Sparkles } from "lucide-react";

export const metadata = {
  title: "Promotional Campaigns | Teach Workspace",
};

export default async function InstructorCampaignsPage() {
  const data = await serverApiFetch<InstructorCampaignsView>("/api/v1/teach/campaigns");

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Promotional Campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which of your eligible courses participate in platform discount campaigns.
        </p>
      </div>

      {data.campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Sparkles className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-3 text-lg font-semibold">No active promotional campaigns</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            When platform-wide sales or category promotions are launched, they will appear here so you can opt your courses in.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              allCourses={data.courses}
            />
          ))}
        </div>
      )}
    </div>
  );
}

