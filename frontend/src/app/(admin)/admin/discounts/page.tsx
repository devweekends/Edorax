import Link from "next/link";
import { DiscountCampaignsPanel } from "@/components/admin/discount-campaigns-panel";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { paginateList } from "@/lib/admin-paginate";
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

export default async function AdminDiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const view = await serverApiFetch<DiscountAdminView>("/api/v1/admin/discount-campaigns");

  // Search covers the campaign name, its internal code, and its scope. Results are paged 10 at a time.
  const q = (sp.q ?? "").trim();
  const needle = q.toLowerCase();
  const matching = needle
    ? view.campaigns.filter((campaign) =>
        [campaign.label, campaign.code ?? "", campaign.scope.replace(/_/g, " ")].some((value) => value.toLowerCase().includes(needle))
      )
    : view.campaigns;
  const pageData = paginateList(matching, sp.page, 10);

  const hrefFor = (next: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next > 1) params.set("page", String(next));
    const value = params.toString();
    return `/admin/discounts${value ? `?${value}` : ""}`;
  };

  const listControls = (
    <AdminQueryForm basePath="/admin/discounts" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-96">
        Search campaign, code, or scope
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="e.g. spring or all paid"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
          Search
        </button>
        {q ? (
          <Link href="/admin/discounts" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
            Clear
          </Link>
        ) : null}
      </div>
      <p className="text-xs tabular-nums text-muted-foreground sm:ml-auto sm:pb-2">
        {matching.length} of {view.campaigns.length} shown
      </p>
    </AdminQueryForm>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        eyebrow="Sales"
        title="Discounts"
        description="Create a promotion for eligible courses. Instructors choose which courses participate."
      />
      <DiscountCampaignsPanel
        {...view}
        campaigns={pageData.items}
        listControls={listControls}
        pagination={<AdminPagination page={pageData.page} hrefFor={hrefFor} />}
      />
    </div>
  );
}
