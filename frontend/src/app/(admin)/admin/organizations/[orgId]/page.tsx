import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Coins,
  KeyRound,
  Layers3,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import type { AdminOrganizationDetail } from "@/shared/api/admin";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { CredentialReveal } from "@/components/admin/credential-reveal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { OrganizationCourseDrawer } from "@/components/admin/organization-course-drawer";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { paginateList } from "@/lib/admin-paginate";
import { AdminQueryForm } from "@/components/admin/admin-query-form";
import { SelectAllCheckbox } from "@/components/admin/select-all-checkbox";
import {
  grantCourseOrgAccessAction,
  revokeCourseOrgAccessAction,
  setCoursesFreeForOrganizationAction,
} from "@/server/actions/admin/course-org-access";
import {
  createOrganizationCouponPoolAction,
  grantOrganizationCreditsAction,
  rotateOrganizationCredentialFormAction,
  setAllocationAllowedAction,
  setOrganizationCouponPoolActiveAction,
} from "@/server/actions/admin/organizations";
import {
  AdminBackLink,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminSection,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeaderCell,
  AdminTableRow,
  adminSelectClassName,
} from "@/components/admin/admin-ui";

type CourseStatusFilter = "all" | "free" | "assignable" | "off";

const COURSE_FILTERS: { value: CourseStatusFilter; label: string }[] = [
  { value: "all", label: "All courses" },
  { value: "free", label: "Free for org" },
  { value: "assignable", label: "Assignable" },
  { value: "off", label: "Not assignable" },
];

export default async function AdminOrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ accessKey?: string; secret?: string; q?: string; status?: string; cpage?: string; xpage?: string; ppage?: string }>;
}) {
  const { orgId } = await params;
  const query = await searchParams;

  const { organization: org, credentials, allocations, couponPools, creditTransactions, pendingRequests, publishedCourses } =
    await serverApiFetchOrNotFound<AdminOrganizationDetail>(`/api/v1/admin/organizations/${encodeURIComponent(orgId)}`);

  const allocationByCourseId = new Map(allocations.map((row) => [row.course.id, row]));
  const pendingRequestCourseIds = new Set(pendingRequests.map((r) => r.courseId));
  const mapCourseForBulk = (course: (typeof publishedCourses)[number]) => {
    const allocation = allocationByCourseId.get(course.id);
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      allocated: Boolean(allocation),
      pendingRequest: pendingRequestCourseIds.has(course.id),
      maxEnrollments: allocation?.maxEnrollments ?? 100,
      expiresAt: allocation?.expiresAt ? allocation.expiresAt.slice(0, 10) : "",
    };
  };

  const allPublishedCourses = publishedCourses.map(mapCourseForBulk);

  // Course filters: search by title or slug, and narrow by access state.
  const courseQ = (query.q ?? "").trim();
  const needle = courseQ.toLowerCase();
  const courseStatus: CourseStatusFilter = COURSE_FILTERS.some((item) => item.value === query.status)
    ? (query.status as CourseStatusFilter)
    : "all";
  const visibleAllocations = allocations.filter((row) => {
    if (needle && !row.course.title.toLowerCase().includes(needle) && !row.course.slug.toLowerCase().includes(needle)) {
      return false;
    }
    if (courseStatus === "free") return row.freeForOrganization;
    if (courseStatus === "assignable") return row.isAllowed;
    if (courseStatus === "off") return !row.isAllowed;
    return true;
  });
  const courseFiltering = Boolean(courseQ) || courseStatus !== "all";

  // Each list pages on its own URL parameter. Links keep the filters and the open tab (hash).
  const coursePage = paginateList(visibleAllocations, query.cpage, 15);
  const creditPage = paginateList(creditTransactions, query.xpage, 10);
  const couponListPage = paginateList(couponPools, query.ppage, 10);
  const pageHref = (base: Record<string, string>, param: string, hash: string) => (next: number) => {
    const params = new URLSearchParams(base);
    if (next > 1) params.set(param, String(next));
    const value = params.toString();
    return `/admin/organizations/${org.id}${value ? `?${value}` : ""}#${hash}`;
  };
  const courseBase: Record<string, string> = {};
  if (courseQ) courseBase.q = courseQ;
  if (courseStatus !== "all") courseBase.status = courseStatus;
  const courseHref = pageHref(courseBase, "cpage", "courses");
  const creditHref = pageHref({}, "xpage", "credits");
  const couponHref = pageHref({}, "ppage", "coupons");
  const activeCredentials = credentials.filter((credential) => credential.active).length;

  return (
    <div className="space-y-8 pb-12">
      <AdminBackLink href="/admin/organizations">← Back to organizations</AdminBackLink>

      <AdminPageHeader
        eyebrow="Organization"
        title={org.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{org.slug}</span>
            <span aria-hidden>·</span>
            <span>
              {org.enrollmentCount} integration enrollment{org.enrollmentCount === 1 ? "" : "s"}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrganizationCourseDrawer organizationId={org.id} courses={allPublishedCourses} />
            <AdminActionForm
              action={rotateOrganizationCredentialFormAction}
              submitLabel="Rotate API credentials"
              pendingLabel="Rotating…"
              variant="outline"
              confirm={{
                question: `Rotate API credentials for ${org.name}?`,
                description:
                  "The current key stops working immediately. Any integration using it must switch to the new credentials.",
                confirmLabel: "Rotate credentials",
              }}
            >
              <input type="hidden" name="organizationId" value={org.id} />
            </AdminActionForm>
          </div>
        }
      />

      {query.accessKey && query.secret ? <CredentialReveal accessKey={query.accessKey} secret={query.secret} /> : null}

      {pendingRequests.length > 0 ? (
        <AdminPanel className="border-amber-500/30 bg-amber-500/[0.06] p-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {pendingRequests.length} pending course request{pendingRequests.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">This organization is waiting for access to the courses below.</p>
              </div>
            </div>
            <Link href="/admin/requests" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Open request queue <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm sm:px-6">
                <span className="font-medium">{r.courseTitle}</span>
                <span className="text-xs text-muted-foreground">Awaiting review</span>
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}

      <section aria-label="Organization summary" className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard icon={Coins} label="Available credits" value={`$${(org.creditBalance / 100).toFixed(2)}`} detail={`${org.creditBalance.toLocaleString()} cents`} href="#credits" />
        <MetricCard icon={Users} label="Integration enrollments" value={org.enrollmentCount.toLocaleString()} detail="Learners connected" />
        <MetricCard icon={BookOpen} label="Catalog courses" value={allocations.length.toLocaleString()} detail="Allocated to this org" href="#courses" />
        <MetricCard icon={KeyRound} label="Active API keys" value={activeCredentials.toLocaleString()} detail={`${credentials.length} total`} href="#access" />
        <MetricCard
          icon={Layers3}
          label="Pending requests"
          value={pendingRequests.length.toLocaleString()}
          detail={pendingRequests.length ? "Needs review" : "Up to date"}
          highlight={pendingRequests.length > 0}
          href="/admin/requests"
        />
      </section>


      <AdminTabs
        tabs={[
          {
            id: "courses",
            label: "Courses",
            count: allocations.length,
            content: (
                    <div id="courses" className="scroll-mt-24">
                      <AdminSection
                        title="Courses in catalog"
                        description="Published courses allocated to this organization. Caps and expiry dates are enforced on integration enrollments."
                        className="mt-0"
                        action={
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {publishedCourses.length.toLocaleString()} published courses available
                          </span>
                        }
                      >
                        <AdminQueryForm basePath={`/admin/organizations/${org.id}`} hash="courses" className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                          <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-72">
                            Search course or slug
                            <input
                              type="search"
                              name="q"
                              defaultValue={courseQ}
                              placeholder="e.g. python"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            />
                          </label>
                          <label className="flex w-full flex-col gap-1 text-xs font-medium text-muted-foreground sm:w-56">
                            Access
                            <select name="status" defaultValue={courseStatus} className={adminSelectClassName}>
                              {COURSE_FILTERS.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="flex items-center gap-3">
                            <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "default" }))}>
                              Apply
                            </button>
                            {courseFiltering ? (
                              <Link href={`/admin/organizations/${org.id}#courses`} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
                                Clear
                              </Link>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums sm:ml-auto sm:pb-2">
                            Showing {visibleAllocations.length} of {allocations.length}
                          </p>
                        </AdminQueryForm>

                        <form id="bulk-free-access" action={setCoursesFreeForOrganizationAction} className="mb-3 flex flex-wrap items-center gap-2">
                          <input type="hidden" name="organizationId" value={org.id} />
                          <span className="mr-auto text-xs text-muted-foreground">Select courses, then apply free access to all of them at once.</span>
                          <Button type="submit" name="freeForOrganization" value="true" size="sm" variant="outline">
                            Make selected free
                          </Button>
                          <Button type="submit" name="freeForOrganization" value="false" size="sm" variant="ghost">
                            Revoke selected free
                          </Button>
                        </form>

                        {visibleAllocations.length === 0 ? (
                          <AdminEmptyState
                            title={allocations.length === 0 ? "No courses allocated yet" : "No courses match these filters"}
                            description={
                              allocations.length === 0
                                ? "Use Manage courses to add published courses to this organization's catalog."
                                : "Try a different search or access filter."
                            }
                          />
                        ) : (
                          <>
<AdminTable minWidth="860px">
                            <AdminTableHead>
                              <tr>
                                <AdminTableHeaderCell>
                                  <SelectAllCheckbox formId="bulk-free-access" name="courseIds" label="Select all courses" />
                                </AdminTableHeaderCell>
                                <AdminTableHeaderCell>Course</AdminTableHeaderCell>
                                <AdminTableHeaderCell align="right">Used / max</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Expires</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Assignable</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Free for org</AdminTableHeaderCell>
                              </tr>
                            </AdminTableHead>
                            <AdminTableBody>
                              {coursePage.items.map((row) => (
                                <AdminTableRow key={row.id}>
                                  <AdminTableCell>
                                    <input
                                      type="checkbox"
                                      form="bulk-free-access"
                                      name="courseIds"
                                      value={row.course.id}
                                      aria-label={`Select ${row.course.title}`}
                                      className="size-4 rounded border-input accent-primary"
                                    />
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    <span className="font-medium">{row.course.title}</span>
                                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{row.course.slug}</span>
                                  </AdminTableCell>
                                  <AdminTableCell align="right" className="tabular-nums">
                                    {row.currentEnrollments} / {row.maxEnrollments}
                                  </AdminTableCell>
                                  <AdminTableCell className="text-muted-foreground">
                                    {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "—"}
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    <form action={setAllocationAllowedAction} className="flex items-center gap-2">
                                      <input type="hidden" name="organizationId" value={org.id} />
                                      <input type="hidden" name="courseId" value={row.course.id} />
                                      <input type="hidden" name="enabled" value={row.isAllowed ? "false" : "true"} />
                                      {row.isAllowed ? (
                                        <Badge variant="secondary">Yes</Badge>
                                      ) : (
                                        <Badge variant="destructive" title="The integration cannot see this course, so it cannot be assigned">
                                          Not assignable
                                        </Badge>
                                      )}
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        aria-label={`${row.isAllowed ? "Turn off" : "Turn on"} integration enrollments for ${row.course.title}`}
                                      >
                                        {row.isAllowed ? "Turn off" : "Turn on"}
                                      </Button>
                                    </form>
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    {row.freeForOrganization ? (
                                      <AdminActionForm
                                        action={revokeCourseOrgAccessAction}
                                        submitLabel="Revoke free"
                                        pendingLabel="Revoking…"
                                        variant="outline"
                                        size="sm"
                                        confirm={{
                                          question: `Revoke free access to ${row.course.title} for ${org.name}?`,
                                          description:
                                            "Future Pathment assignments of this course will use credits or coupons again. Existing enrollments are not changed.",
                                          confirmLabel: "Revoke free access",
                                        }}
                                      >
                                        <input type="hidden" name="courseId" value={row.course.id} />
                                        <input type="hidden" name="organizationId" value={org.id} />
                                      </AdminActionForm>
                                    ) : (
                                      <AdminActionForm
                                        action={grantCourseOrgAccessAction}
                                        submitLabel="Make free"
                                        pendingLabel="Saving…"
                                        variant="outline"
                                        size="sm"
                                        confirm={{
                                          question: `Make ${row.course.title} free for ${org.name}?`,
                                          description:
                                            "Pathment assignments of this course to this organization will not use credits or coupons, and the instructor receives no payout for them.",
                                          confirmLabel: "Make free for organization",
                                        }}
                                      >
                                        <input type="hidden" name="courseId" value={row.course.id} />
                                        <input type="hidden" name="organizationId" value={org.id} />
                                      </AdminActionForm>
                                    )}
                                  </AdminTableCell>
                                </AdminTableRow>
                              ))}
                            </AdminTableBody>
                          </AdminTable>
          <AdminPagination page={coursePage.page} hrefFor={courseHref} />
</>
                        )}
                      </AdminSection>
                    </div>
            ),
          },
          {
            id: "credits",
            label: "Credits",
            content: (
                    <div id="credits" className="scroll-mt-24">
                      <AdminSection
                        title="Credits & funding"
                        description="Organization credits fund Pathment course contributions. One credit represents one cent."
                        className="mt-0"
                      >
                        <AdminPanel className="p-0">
                          <div className="grid gap-6 border-b border-border p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-8 sm:p-6">
                            <div className="flex items-start gap-4">
                              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                                <Coins className="size-5" aria-hidden />
                              </span>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Available balance</p>
                                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">${(org.creditBalance / 100).toFixed(2)}</p>
                                <p className="mt-2 text-xs text-muted-foreground">{org.creditBalance.toLocaleString()} credits available for course contributions</p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/50 p-4 sm:p-5">
                              <h3 className="text-sm font-semibold">Add credits</h3>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">Add funds to this organization’s available balance.</p>
                              <AdminActionForm
                                action={grantOrganizationCreditsAction}
                                submitLabel="Grant credits"
                                pendingLabel="Adding…"
                                className="mt-4 space-y-4"
                                confirm={{
                                  question: `Grant credits to ${org.name}?`,
                                  description: "Credits will be added immediately to the organization's credit balance for Pathment course sponsorships.",
                                  confirmLabel: "Confirm credit grant",
                                }}
                              >
                                <input type="hidden" name="organizationId" value={org.id} />
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
                                  <label className="space-y-1.5 text-xs font-medium">
                                    <span>Amount (USD)</span>
                                    <span className="relative block">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden>$</span>
                                      <input name="amountDollars" type="number" min="1" step="1" defaultValue="50" required className="h-10 w-full rounded-lg border border-input bg-background pl-7 pr-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary" />
                                    </span>
                                  </label>
                                  <label className="space-y-1.5 text-xs font-medium">
                                    <span>Reason <span className="font-normal text-muted-foreground">(optional)</span></span>
                                    <input name="reason" type="text" placeholder="e.g. Monthly allocation" className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary" />
                                  </label>
                                </div>
                              </AdminActionForm>
                            </div>
                          </div>
                          <div className="px-5 pb-3 pt-5 sm:px-6">
                            <h3 className="text-sm font-semibold">Credit activity</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Course contributions funded by this organization.</p>
                          </div>
                          <>
<AdminTable minWidth="720px">
                            <AdminTableHead>
                              <tr>
                                <AdminTableHeaderCell>Date</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Course</AdminTableHeaderCell>
                                <AdminTableHeaderCell align="right">Credits</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                              </tr>
                            </AdminTableHead>
                            <AdminTableBody>
                              {creditTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                                    <Coins className="mx-auto mb-3 size-6 text-muted-foreground/60" aria-hidden />
                                    <span className="block font-medium text-foreground">No credit activity yet</span>
                                    <span className="mt-1 block text-xs">Course contributions will appear here.</span>
                                  </td>
                                </tr>
                              ) : (
                                creditPage.items.map((transaction) => (
                                  <AdminTableRow key={transaction.id}>
                                    <AdminTableCell className="text-muted-foreground">
                                      {new Date(transaction.createdAt).toLocaleDateString()}
                                    </AdminTableCell>
                                    <AdminTableCell>
                                      <span className="font-medium">{transaction.courseTitle}</span>
                                      <span className="mt-0.5 block text-xs text-muted-foreground">{transaction.enrollmentId}</span>
                                    </AdminTableCell>
                                    <AdminTableCell align="right" className="tabular-nums">
                                      ${(transaction.amountCredits / 100).toFixed(2)}
                                    </AdminTableCell>
                                    <AdminTableCell>
                                      <Badge variant={transaction.status === "COMMITTED" ? "secondary" : "outline"}>
                                        {transaction.status.toLowerCase()}
                                      </Badge>
                                    </AdminTableCell>
                                  </AdminTableRow>
                                ))
                              )}
                            </AdminTableBody>
                          </AdminTable>
          <div className="px-5 pb-4 sm:px-6"><AdminPagination page={creditPage.page} hrefFor={creditHref} /></div>
          </>
                        </AdminPanel>
                      </AdminSection>
                    </div>
            ),
          },
          {
            id: "coupons",
            label: "Coupon pools",
            count: couponPools.length,
            content: (
                    <div id="coupons" className="scroll-mt-24">
                      <AdminSection
                        title="Coupon pools"
                        description="Discount seats reserved for organization assignments. Course-specific pools are used before general pools. Partial discounts leave a payment balance for admin confirmation."
                        className="mt-0"
                        action={
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Ticket className="size-3.5" aria-hidden /> {couponPools.length} pool{couponPools.length === 1 ? "" : "s"}
                          </span>
                        }
                      >
                        <AdminPanel className="mb-6">
                          <h3 className="text-sm font-semibold">Create a coupon pool</h3>
                          <AdminActionForm
                            action={createOrganizationCouponPoolAction}
                            submitLabel="Create coupon pool"
                            pendingLabel="Creating…"
                            className="mt-4 space-y-4"
                          >
                            <input type="hidden" name="organizationId" value={org.id} />
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Label</span>
                                <input name="label" required maxLength={120} placeholder="DevWeekends Pathment" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Course scope</span>
                                <select name="courseId" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                  <option value="">General (any allocated course)</option>
                                  {allocations.map((row) => (
                                    <option key={row.course.id} value={row.course.id}>
                                      {row.course.title}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Max seats</span>
                                <input name="maxRedemptions" type="number" min={1} required defaultValue={100} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Percent off</span>
                                <input name="percentOff" type="number" min={1} max={100} defaultValue={100} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Internal reference (optional)</span>
                                <input name="code" maxLength={64} placeholder="Pathment cohort 2026" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                              </label>
                              <label className="text-sm">
                                <span className="mb-1 block font-medium">Expires (optional)</span>
                                <input name="expiresAt" type="date" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                              </label>
                            </div>
                          </AdminActionForm>
                        </AdminPanel>

                        {couponPools.length === 0 ? (
                          <AdminEmptyState title="No coupon pools yet" description="Create a pool above to reserve discounted seats for this organization." />
                        ) : (
                          <>
<AdminTable minWidth="820px">
                            <AdminTableHead>
                              <tr>
                                <AdminTableHeaderCell>Pool</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Scope</AdminTableHeaderCell>
                                <AdminTableHeaderCell align="right">Seats</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Status</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Actions</AdminTableHeaderCell>
                              </tr>
                            </AdminTableHead>
                            <AdminTableBody>
                              {couponListPage.items.map((pool) => (
                                <AdminTableRow key={pool.id}>
                                  <AdminTableCell>
                                    <span className="font-medium">{pool.label}</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{pool.displayLabel}</span>
                                    {pool.code ? <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{pool.code}</span> : null}
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    {pool.course ? pool.course.title : <Badge variant="outline">General</Badge>}
                                  </AdminTableCell>
                                  <AdminTableCell align="right" className="tabular-nums">
                                    {pool.redemptionCount} / {pool.maxRedemptions}
                                    <span className="mt-1 block text-xs text-muted-foreground">{pool.reservedCount} reserved · {pool.redeemedCount} redeemed</span>
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    {pool.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Off</Badge>}
                                  </AdminTableCell>
                                  <AdminTableCell>
                                    <div className="flex flex-col items-start gap-2">
                                      <form action={setOrganizationCouponPoolActiveAction} className="flex items-center gap-2">
                                        <input type="hidden" name="organizationId" value={org.id} />
                                        <input type="hidden" name="poolId" value={pool.id} />
                                        <input type="hidden" name="active" value={pool.active ? "false" : "true"} />
                                        <Button type="submit" size="sm" variant="ghost">
                                          {pool.active ? "Turn off" : "Turn on"}
                                        </Button>
                                      </form>
                                      <form action={setOrganizationCouponPoolActiveAction} className="flex items-center gap-2">
                                        <input type="hidden" name="organizationId" value={org.id} />
                                        <input type="hidden" name="poolId" value={pool.id} />
                                        <input
                                          name="maxRedemptions"
                                          type="number"
                                          min={pool.maxRedemptions}
                                          max={1_000_000}
                                          defaultValue={pool.maxRedemptions}
                                          aria-label={`Seat limit for ${pool.label}`}
                                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
                                        />
                                        <Button type="submit" size="sm" variant="outline">Update seats</Button>
                                      </form>
                                    </div>
                                  </AdminTableCell>
                                </AdminTableRow>
                              ))}
                            </AdminTableBody>
                          </AdminTable>
          <AdminPagination page={couponListPage.page} hrefFor={couponHref} />
</>
                        )}
                      </AdminSection>
                    </div>
            ),
          },
          {
            id: "access",
            label: "Access keys",
            count: credentials.length,
            content: (
                    <div id="access" className="scroll-mt-24">
                      <AdminSection title="Access keys" description="Keys this organization's integration uses to call the API." className="mt-0">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                          <AdminTable minWidth="560px">
                            <AdminTableHead>
                              <tr>
                                <AdminTableHeaderCell>Access key</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Label</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Active</AdminTableHeaderCell>
                                <AdminTableHeaderCell>Last used</AdminTableHeaderCell>
                              </tr>
                            </AdminTableHead>
                            <AdminTableBody>
                              {credentials.map((cred) => (
                                <AdminTableRow key={cred.id}>
                                  <AdminTableCell>
                                    <span className="font-mono text-xs">{cred.accessKey}</span>
                                  </AdminTableCell>
                                  <AdminTableCell>{cred.label}</AdminTableCell>
                                  <AdminTableCell>
                                    {cred.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                                  </AdminTableCell>
                                  <AdminTableCell className="text-muted-foreground">
                                    {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleDateString() : "—"}
                                  </AdminTableCell>
                                </AdminTableRow>
                              ))}
                            </AdminTableBody>
                          </AdminTable>
                          <AdminPanel className="flex flex-col justify-between bg-muted/25">
                            <div>
                              <span className="grid size-10 place-items-center rounded-xl bg-background text-primary shadow-sm">
                                <ShieldCheck className="size-5" aria-hidden />
                              </span>
                              <h3 className="mt-5 text-sm font-semibold">Credential hygiene</h3>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                Keep keys private, rotate them after a team change, and update the external integration immediately.
                              </p>
                            </div>
                            <Link href="/integrations" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                              View integration docs <ArrowUpRight className="size-3.5" aria-hidden />
                            </Link>
                          </AdminPanel>
                        </div>
                      </AdminSection>
                    </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  highlight = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  href?: string;
  highlight?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground", highlight && "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </>
  );
  const className = cn(
    "block rounded-2xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgb(10_15_44/4%)] sm:p-5",
    highlight && "border-amber-500/40",
    href && "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  );
  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
