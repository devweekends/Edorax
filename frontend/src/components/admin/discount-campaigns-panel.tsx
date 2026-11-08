"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Check, Copy, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CourseCover } from "@/components/learn/course-cover";
import { formatPriceCents } from "@/lib/format-price";
import { createDiscountCampaign, setDiscountCampaignActive } from "@/server/actions/admin/discount-campaigns";

type Scope = "ALL" | "CATEGORY" | "SUBCATEGORY" | "TAG" | "SELECTED_COURSES";
type CourseOption = { id: string; title: string; slug: string; category: "TECH" | "SOFT_SKILLS"; subcategory: string | null; tags: string[]; coverUrl: string | null; priceCents: number; currency: string };
type Campaign = { id: string; label: string; code: string | null; scope: Scope; category: "TECH" | "SOFT_SKILLS" | null; subcategory: string | null; tag: string | null; courseIds: string[]; percentOff: number; maxRedemptions: number; redemptionCount: number; autoApply: boolean; active: boolean; expiresAt: string | null; courseCount: number; createdAt: string };

export function DiscountCampaignsPanel({ campaigns, courses, subcategories, tags }: { campaigns: Campaign[]; courses: CourseOption[]; subcategories: string[]; tags: string[] }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("ALL");
  const [category, setCategory] = useState<"TECH" | "SOFT_SKILLS">("TECH");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseCategory, setCourseCategory] = useState<"ALL" | "TECH" | "SOFT_SKILLS">("ALL");
  const [autoApply, setAutoApply] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedCourses = courses.filter((course) => courseIds.includes(course.id));
  const visibleCourses = courses.filter((course) => {
    const query = courseSearch.trim().toLowerCase();
    const matchesSearch = !query || [course.title, course.subcategory ?? "", ...course.tags].some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (courseCategory === "ALL" || course.category === courseCategory);
  });
  const toggleCourse = (courseId: string) => setCourseIds((current) => current.includes(courseId) ? current.filter((id) => id !== courseId) : [...current, courseId]);
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
          ...(scope === "SELECTED_COURSES" ? { courseIds } : { courseIds: [] }),
        });
        setBusy(false); setMessage(result.message);
        if (result.ok) { formElement.reset(); setCourseIds([]); router.refresh(); }
      }}>
        <Input required minLength={2} maxLength={100} name="label" placeholder="Campaign name, e.g. AI launch offer" aria-label="Campaign name" />
        <Input minLength={3} maxLength={32} name="code" placeholder={autoApply ? "Optional coupon code" : "Shareable code, e.g. LEARN20"} aria-label="Coupon code" />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Discount (%)<Input required name="percentOff" type="number" min={1} max={100} defaultValue="20" /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Total redemptions across campaign<Input required name="maxRedemptions" type="number" min={1} max={100000} defaultValue="100" /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Eligible courses<select value={scope} onChange={(event) => setScope(event.target.value as Scope)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="ALL">All paid courses</option><option value="CATEGORY">A category</option><option value="SUBCATEGORY">A subcategory</option><option value="TAG">Courses with a tag</option><option value="SELECTED_COURSES">Selected courses</option></select></label>
        {scope === "CATEGORY" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Category<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="TECH">Tech</option><option value="SOFT_SKILLS">Soft skills</option></select></label> : null}
        {scope === "SUBCATEGORY" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Subcategory<select name="subcategory" required className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Select subcategory</option>{subcategories.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        {scope === "TAG" ? <label className="space-y-1 text-xs font-medium text-muted-foreground">Course tag<select name="tag" required className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Select tag</option>{tags.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        {scope === "SELECTED_COURSES" ? <div className="space-y-3 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-semibold">Choose courses</h3><p className="mt-0.5 text-xs text-muted-foreground">Only published paid courses are shown.</p></div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" aria-live="polite">{courseIds.length} selected</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="Search courses, topics, or tags" aria-label="Search courses" className="pl-9" /></div>
            <div className="flex rounded-lg border bg-muted/40 p-1" aria-label="Filter courses by category">
              {([['ALL', 'All'], ['TECH', 'Tech'], ['SOFT_SKILLS', 'Soft skills']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={courseCategory === value} onClick={() => setCourseCategory(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${courseCategory === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
            </div>
          </div>
          {selectedCourses.length ? <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-3">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Included</span>
            {selectedCourses.map((course) => <span key={course.id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-xs font-medium"><span className="max-w-40 truncate">{course.title}</span><button type="button" aria-label={`Remove ${course.title}`} onClick={() => toggleCourse(course.id)} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" aria-hidden /></button></span>)}
            <button type="button" onClick={() => setCourseIds([])} className="ml-auto text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Clear all</button>
          </div> : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Choose at least one eligible course. Instructors must still opt in.</p>}
          <div className="grid max-h-[26rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {visibleCourses.map((course, index) => {
              const selected = courseIds.includes(course.id);
              return <button key={course.id} type="button" aria-pressed={selected} onClick={() => toggleCourse(course.id)} className={`group flex min-w-0 overflow-hidden rounded-xl border text-left transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/[0.03] ring-1 ring-primary/30" : "bg-card"}`}>
                <CourseCover coverUrl={course.coverUrl} title={course.title} aspect="thumb" paletteIndex={index} className="w-28 shrink-0 self-stretch rounded-none border-r" />
                <span className="flex min-w-0 flex-1 flex-col justify-center p-3">
                  <span className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{course.title}</span><span className={`grid size-5 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "bg-background text-transparent group-hover:border-primary/50"}`}><Check className="size-3.5" aria-hidden /></span></span>
                  <span className="mt-1 truncate text-xs text-muted-foreground">{course.subcategory ?? (course.category === "TECH" ? "Tech" : "Soft skills")}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1">{course.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>)}</span>
                  <span className="mt-2 text-xs font-semibold text-foreground">{formatPriceCents(course.priceCents, course.currency)}</span>
                </span>
              </button>;
            })}
            {!visibleCourses.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground sm:col-span-2">No courses match those filters.</p> : null}
          </div>
        </div> : null}
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Expires on (optional)<Input name="expiresAt" type="date" /></label>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={autoApply} onChange={(event) => setAutoApply(event.target.checked)} /> Automatically apply at checkout</label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy || (scope === "SELECTED_COURSES" && courseIds.length === 0)}><BadgePercent />{busy ? "Creating…" : "Create campaign"}</Button>{message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null}</div>
      </form>
    </section>

    <section>
      <h2 className="text-lg font-semibold">Discount campaigns</h2>
      <div className="mt-4 divide-y rounded-xl border bg-card">
        {campaigns.length ? campaigns.map((campaign) => <article key={campaign.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="min-w-0"><p className="font-semibold">{campaign.label} <span className="font-normal text-muted-foreground">· {campaign.percentOff}% off{campaign.autoApply ? " · Auto-applied" : ""}</span></p><p className="mt-1 text-xs text-muted-foreground">{scopeDescription(campaign)} · {campaign.code ? `Code ${campaign.code} · ` : "Automatic offer · "}{campaign.courseCount} participating courses · {campaign.redemptionCount}/{campaign.maxRedemptions} used · {campaign.active ? "Active" : "Paused"}{campaign.expiresAt ? ` · expires ${new Date(campaign.expiresAt).toLocaleDateString()}` : ""}</p></div>
          <div className="flex gap-2">{campaign.code ? <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(campaign.code!); setMessage("Campaign code copied."); }}><Copy /> Copy code</Button> : null}<Button size="sm" variant="ghost" onClick={async () => { const result = await setDiscountCampaignActive({ id: campaign.id, active: !campaign.active }); setMessage(result.message); if (result.ok) router.refresh(); }}>{campaign.active ? "Pause" : "Activate"}</Button></div>
        </article>) : <p className="p-5 text-sm text-muted-foreground">No campaigns yet.</p>}
      </div>
    </section>
  </div>;
}
