import { DiscountCampaignsPanel } from "@/components/admin/discount-campaigns-panel";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { serverApiFetch } from "@/lib/api-server";

type DiscountAdminView = {
  campaigns: Array<{
    id: string; label: string; code: string | null; scope: "ALL" | "CATEGORY" | "SUBCATEGORY" | "TAG" | "SELECTED_COURSES";
    category: "TECH" | "SOFT_SKILLS" | null; subcategory: string | null; tag: string | null; courseIds: string[];
    percentOff: number; maxRedemptions: number; redemptionCount: number; autoApply: boolean; active: boolean;
    expiresAt: string | null; courseCount: number; createdAt: string;
  }>;
  courses: Array<{ id: string; title: string; slug: string; category: "TECH" | "SOFT_SKILLS"; subcategory: string | null; tags: string[]; coverUrl: string | null; priceCents: number; currency: string }>;
  subcategories: string[];
  tags: string[];
};

export default async function AdminDiscountsPage() {
  const view = await serverApiFetch<DiscountAdminView>("/api/v1/admin/discount-campaigns");
  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Sales"
        title="Discounts"
        description="Create a promotion for eligible courses. Instructors choose which courses participate."
      />
      <DiscountCampaignsPanel {...view} />
    </div>
  );
}
