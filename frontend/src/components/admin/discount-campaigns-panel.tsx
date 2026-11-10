"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createDiscountCampaign, setDiscountCampaignActive } from "@/server/actions/admin/discount-campaigns";

type Scope = "ALL" | "CATEGORY" | "SUBCATEGORY" | "TAG" | "SELECTED_COURSES";
type Campaign = { id: string; label: string; code: string | null; scope: Scope; category: "TECH" | "SOFT_SKILLS" | null; subcategory: string | null; tag: string | null; courseIds: string[]; percentOff: number; maxRedemptions: number; redemptionCount: number; autoApply: boolean; active: boolean; expiresAt: string | null; courseCount: number; createdAt: string };

export function DiscountCampaignsPanel({
  campaigns,
  subcategories,
  tags,
  listControls,
  pagination,
}: {
  campaigns: Campaign[];
  subcategories: string[];
  tags: string[];
  listControls?: ReactNode;
  pagination?: ReactNode;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Exclude<Scope, "SELECTED_COURSES">>("ALL");
  const [category, setCategory] = useState<"TECH" | "SOFT_SKILLS">("TECH");
  const [autoApply, setAutoApply] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const scopeDescription = (campaign: Campaign) => {
    if (campaign.scope === "ALL") return "All paid courses";
    if (campaign.scope === "CATEGORY") return campaign.category === "TECH" ? "Tech courses" : "Soft skills courses";
    if (campaign.scope === "SUBCATEGORY") return campaign.subcategory ?? "Subcategory";
    if (campaign.scope === "TAG") return `Tag: ${campaign.tag ?? ""}`;
    return "Selected courses";
  };

  return <div className="mt-8 space-y-8">
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Create a discount campaign</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose which published, paid courses are eligible. Instructors decide whether to include their courses.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setMessage("");
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const result = await createDiscountCampaign({
          label: String(form.get("label") ?? ""), code: String(form.get("code") ?? "").trim().toUpperCase() || null,
          percentOff: Number(form.get("percentOff")), maxRedemptions: Number(form.get("maxRedemptions")),
          expiresAt: form.get("expiresAt") ? new Date(`${form.get("expiresAt")}T23:59:59`).toISOString() : null,
          autoApply, scope,
          ...(scope === "CATEGORY" ? { category } : {}),
          ...(scope === "SUBCATEGORY" ? { subcategory: String(form.get("subcategory") ?? "") } : {}),
          ...(scope === "TAG" ? { tag: String(form.get("tag") ?? "") } : {}),
        });
        setBusy(false); setMessage(result.message);
        if (result.ok) { formElement.reset(); router.refresh(); }
      }}>
        <Input required minLength={2} maxLength={100} name="label" placeholder="Campaign name, e.g. AI launch offer" aria-label="Campaign name" />
        <Input minLength={3} maxLength={32} name="code" placeholder={autoApply ? "Optional coupon code" : "Shareable code, e.g. LEARN20"} aria-label="Coupon code" />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Discount (%)<Input required name="percentOff" type="number" min={1} max={100} defaultValue="20" /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Total redemptions across campaign<Input required name="maxRedemptions" type="number" min={1} max={100000} defaultValue="100" /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Eligible courses<select value={scope} onChange={(event) => setScope(event.target.value as Exclude<Scope, "SELECTED_COURSES">)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="ALL">All paid courses</option><option value="CATEGORY">A category</option><option value="SUBCATEGORY">A subcategory</option><option value="TAG">Courses with a tag</option></select></label>
        {scope === "CATEGORY" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Category<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="TECH">Tech</option><option value="SOFT_SKILLS">Soft skills</option></select></label> : null}
        {scope === "SUBCATEGORY" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Subcategory<select name="subcategory" required className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Select subcategory</option>{subcategories.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        {scope === "TAG" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Course tag<select name="tag" required className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Select tag</option>{tags.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Expires on (optional)<Input name="expiresAt" type="date" /></label>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={autoApply} onChange={(event) => setAutoApply(event.target.checked)} /> Automatically apply at checkout</label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}><BadgePercent />{busy ? "Creating…" : "Create campaign"}</Button>{message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null}</div>
      </form>
    </section>

    <section>
      <h2 className="text-lg font-semibold">Discount campaigns</h2>
      {listControls ? <div className="mt-4">{listControls}</div> : null}
      <div className="mt-4 divide-y rounded-xl border bg-card">
        {campaigns.length ? campaigns.map((campaign) => <article key={campaign.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="min-w-0"><p className="font-semibold">{campaign.label} <span className="font-normal text-muted-foreground">· {campaign.percentOff}% off{campaign.autoApply ? " · Auto-applied" : ""}</span></p><p className="mt-1 text-xs text-muted-foreground">{scopeDescription(campaign)} · {campaign.code ? `Code ${campaign.code} · ` : "Automatic offer · "}{campaign.courseCount} participating courses · {campaign.redemptionCount}/{campaign.maxRedemptions} used · {campaign.active ? "Active" : "Paused"}{campaign.expiresAt ? ` · expires ${new Date(campaign.expiresAt).toLocaleDateString()}` : ""}</p></div>
          <div className="flex gap-2">{campaign.code ? <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(campaign.code!); setMessage("Campaign code copied."); }}><Copy /> Copy code</Button> : null}<Button size="sm" variant="ghost" onClick={async () => { const result = await setDiscountCampaignActive({ id: campaign.id, active: !campaign.active }); setMessage(result.message); if (result.ok) router.refresh(); }}>{campaign.active ? "Pause" : "Activate"}</Button></div>
        </article>) : <p className="p-5 text-sm text-muted-foreground">No campaigns yet.</p>}
      {pagination}
      </div>
    </section>
  </div>;
}
