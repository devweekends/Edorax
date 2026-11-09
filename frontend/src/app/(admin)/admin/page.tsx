import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardList,
  History,
  Plus,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  AdminAuditView,
  AdminCourseRequestsView,
  AdminMetricPoint,
  AdminMetricsView,
  AdminOverview,
  AdminUsersView,
} from "@/shared/api/admin";
import { serverApiFetch } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AdminPageHeader, AdminPanel } from "@/components/admin/admin-ui";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "12 weeks" },
] as const;

type Accent = "primary" | "blue" | "green" | "amber";

const ACCENT_TONE: Record<Accent, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  note,
  accent = "primary",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  note: string;
  accent?: Accent;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", ACCENT_TONE[accent])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value.toLocaleString()}</p>
      <p className="mt-auto flex items-center gap-1 pt-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{note}</span>
        <ArrowRight className="size-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
      </p>
    </Link>
  );
}

function AttentionBanner({ pending }: { pending: number }) {
  if (pending <= 0) return null;
  return (
    <Link
      href="/admin/requests"
      className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AlertCircle className="size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">
          {pending} course {pending === 1 ? "request needs" : "requests need"} review
        </span>
        <span className="hidden text-muted-foreground sm:inline"> · Organizations are waiting for a decision</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
        Review <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function GrowthChart({ points, range }: { points: AdminMetricPoint[]; range: string }) {
  const max = Math.max(1, ...points.map((point) => point.activeLearners));
  const total = points.reduce((sum, point) => sum + point.activeLearners, 0);
  const width = 100 / Math.max(points.length, 1);
  const selectedRange = RANGES.find((item) => item.value === range)?.value ?? "30";

  return (
    <AdminPanel padding="none" className="h-full">
      <SectionHeader
        title="Platform growth"
        description="Daily active learners across the platform"
        action={
          <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Chart time range">
            {RANGES.map((item) => (
              <Link
                key={item.value}
                href={`/admin?range=${item.value}`}
                scroll={false}
                aria-current={selectedRange === item.value ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedRange === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
      />
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {total.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">learner-days</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Total over the selected period</p>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Peak <span className="font-semibold text-foreground">{max.toLocaleString()}</span> in one day
          </p>
        </div>
        <svg
          viewBox="0 0 100 38"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily active learners over ${range} days. ${total} learner-days, peak ${max} in one day.`}
          className="h-48 w-full overflow-visible text-primary sm:h-60"
        >
          {[8, 18, 28, 36].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-border" strokeWidth="0.25" />
          ))}
          {points.map((point, index) => {
            const barHeight = (point.activeLearners / max) * 28;
            const x = index * width + width * 0.16;
            return (
              <rect
                key={point.date}
                x={x}
                y={36 - barHeight}
                width={Math.max(width * 0.68, 0.15)}
                height={Math.max(barHeight, point.activeLearners > 0 ? 0.45 : 0)}
                rx={Math.min(width * 0.18, 0.6)}
                className="fill-current opacity-70 transition-opacity hover:opacity-100"
              >
                <title>{`${point.date}: ${point.activeLearners} active learners`}</title>
              </rect>
            );
          })}
        </svg>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{points[0]?.date ?? "No data"}</span>
          <span>{points.at(-1)?.date ?? ""} · UTC</span>
        </div>
      </div>
    </AdminPanel>
  );
}

function timeAgo(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = RANGES.some((item) => item.value === params.range) ? params.range! : "30";
  const [overview, metrics, requests, audit, users] = await Promise.all([
    serverApiFetch<AdminOverview>("/api/v1/admin/overview"),
    serverApiFetch<AdminMetricsView>(`/api/v1/admin/metrics?range=${range}`),
    serverApiFetch<AdminCourseRequestsView>("/api/v1/admin/course-requests?pageSize=5"),
    serverApiFetch<AdminAuditView>("/api/v1/admin/audit?pageSize=5"),
    serverApiFetch<AdminUsersView>("/api/v1/admin/users?pageSize=5"),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Dashboard"
        title="Overview"
        description="A snapshot of learners, courses, organizations, and the review queue."
        actions={
          <>
            <a href="/api/v1/admin/courses/export" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ArrowDownToLine className="size-4" aria-hidden /> Export courses
            </a>
            <Link href="/admin/organizations/new" className={cn(buttonVariants({ size: "sm" }))}>
              <Plus className="size-4" aria-hidden /> New organization
            </Link>
          </>
        }
      />

      <AttentionBanner pending={overview.pendingCourseRequests} />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          href="/admin/users"
          icon={Users}
          label="Users"
          value={users.page.total}
          note={`${metrics.totals.newUsers.toLocaleString()} joined in ${range} days`}
        />
        <StatCard
          href="/admin/courses"
          icon={BookOpen}
          label="Published courses"
          value={overview.publishedCourses}
          note={`${metrics.totals.newEnrollments.toLocaleString()} new enrollments in ${range} days`}
          accent="blue"
        />
        <StatCard
          href="/admin/organizations"
          icon={Building2}
          label="Organizations"
          value={overview.organizations}
          note="Allocations and integration access"
          accent="green"
        />
        <StatCard
          href="/admin/requests"
          icon={ClipboardList}
          label="Pending requests"
          value={overview.pendingCourseRequests}
          note={overview.pendingCourseRequests ? "Needs review" : "Review queue is clear"}
          accent="amber"
        />
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]" aria-label="Growth and course requests">
        <GrowthChart points={metrics.series} range={range} />
        <AdminPanel padding="none">
          <SectionHeader
            title="Course requests"
            description={`${overview.pendingCourseRequests} ${overview.pendingCourseRequests === 1 ? "request" : "requests"} awaiting review`}
            action={
              <Link href="/admin/requests" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                View all <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {requests.pending.length ? (
            <ul className="divide-y divide-border">
              {requests.pending.slice(0, 5).map((request) => (
                <li key={request.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                    {request.organization.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{request.organization.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{request.course.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground tabular-nums">{timeAgo(request.requestedAt)}</p>
                    <Link href="/admin/requests" className="mt-0.5 inline-block text-xs font-semibold text-primary hover:underline">Review</Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">No requests are waiting for review.</div>
          )}
        </AdminPanel>
      </section>

      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]" aria-label="Recent activity and quick actions">
        <AdminPanel padding="none">
          <SectionHeader
            title="Recent admin activity"
            description="Security-sensitive changes are recorded in the audit log"
            action={
              <Link href="/admin/audit" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Audit log <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {audit.entries.length ? (
            <ul className="divide-y divide-border">
              {audit.entries.slice(0, 5).map((entry) => (
                <li key={entry.id} className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[minmax(110px,0.8fr)_minmax(0,1.6fr)_minmax(110px,1fr)_auto] sm:items-center sm:gap-4 sm:px-6">
                  <span className="truncate text-sm font-medium">{entry.actorEmail}</span>
                  <span className="text-sm text-muted-foreground">{entry.summary}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ""}
                  </span>
                  <time dateTime={entry.createdAt} className="text-xs text-muted-foreground tabular-nums sm:text-right">{timeAgo(entry.createdAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">Admin actions will appear here as they happen.</div>
          )}
        </AdminPanel>

        <AdminPanel padding="none">
          <SectionHeader title="Quick actions" description="Common platform tasks" />
          <div className="divide-y divide-border">
            <QuickAction href="/admin/organizations/new" icon={Building2} label="Create organization" hint="Set up a new partner" />
            <QuickAction href="/admin/users" icon={Users} label="Manage users" hint="Roles, access and invites" />
            <QuickAction href="/admin/courses" icon={BookOpen} label="Manage courses" hint="Publish and allocate content" />
            <QuickAction href="/admin/settings/profile" icon={ShieldCheck} label="Admin security" hint="Two-factor and account settings" />
          </div>
          <Link
            href="/admin/audit"
            className="m-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <History className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Audit log</span>
              <span className="mt-0.5 block text-xs text-primary/80">Review recent admin changes</span>
            </span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </AdminPanel>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
