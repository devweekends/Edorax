import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Cards for the Labs catalogue (/labs). They are smaller than InfoCard on purpose: the catalogue
// holds over a hundred labs, so a card shows a title, two lines of text and a few facts.

const focusRing = "outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow";

/** A small label on a card: where the lab runs, or that it is not open yet. */
export function LabTag({ tone = "plain", children }: { tone?: "plain" | "good" | "brand"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-bold",
        tone === "good" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : tone === "brand" ? "bg-secondary text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** One lab in the catalogue. The whole card is the link. */
export function LabCard({
  title,
  body,
  href,
  facts,
  tag,
  progress,
}: {
  title: string;
  body: string;
  href?: string;
  /** Short facts under the text, such as "Beginner", "30 min", "5 steps". */
  facts?: string[];
  tag?: ReactNode;
  /** Steps passed out of all steps. Shown only when the learner has started. */
  progress?: { done: number; total: number };
}) {
  const started = progress && progress.done > 0 && progress.total > 0;
  const finished = started && progress.done >= progress.total;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[17px] leading-snug tracking-[-0.02em]">{title}</h3>
        {href ? <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden /> : null}
      </div>
      <div className="mt-1.5 flex-1">
        <p className="line-clamp-2 text-[15px] leading-6 text-muted-foreground">{body}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
        {tag}
        {facts?.map((fact, index) => (
          <span key={fact} className="inline-flex items-center gap-2">
            {(index > 0 || tag) && <span aria-hidden>·</span>}
            {fact}
          </span>
        ))}
      </div>
      {started ? (
        <div className="mt-3 flex items-center gap-2 text-sm font-bold">
          {finished ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Check className="size-4" aria-hidden />
              Done
            </span>
          ) : (
            <>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              <span className="shrink-0 text-muted-foreground">
                {progress.done} of {progress.total} steps
              </span>
            </>
          )}
        </div>
      ) : null}
    </>
  );
  const box = "flex h-full flex-col rounded-lg border border-border bg-card p-4";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(box, "group transition-colors hover:border-primary", focusRing)}>
          {inner}
        </Link>
      ) : (
        <div className={cn(box, "opacity-80")}>{inner}</div>
      )}
    </li>
  );
}

/** The grid every list of lab cards uses. */
export function LabGrid({ children }: { children: ReactNode }) {
  return <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>;
}

/** One of the three kinds of lab, as a big choice at the top of the catalogue. */
export function KindTile({
  icon: Icon,
  name,
  tagline,
  count,
  where,
  href,
  active,
  compact = false,
}: {
  icon: LucideIcon;
  name: string;
  tagline: string;
  count: string;
  /** Where this kind runs, in a few words. */
  where: string;
  href: string;
  active: boolean;
  /** One short row: the icon, the name and the count. For when a kind is open and its labs need the room. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <li>
        <Link
          href={href}
          scroll={false}
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex min-h-12 items-center gap-2.5 rounded-lg border-2 px-3.5 transition-colors",
            focusRing,
            active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary",
          )}
        >
          <Icon className={cn("size-5 shrink-0", !active && "text-primary")} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-base font-bold">{name}</span>
          <span className={cn("shrink-0 text-sm font-bold tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group flex h-full items-start gap-3.5 rounded-lg border-2 p-4 transition-colors",
          focusRing,
          active ? "border-primary bg-secondary" : "border-border bg-card hover:border-primary",
        )}
      >
        <span aria-hidden className={cn("grid size-11 shrink-0 place-items-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-secondary text-primary")}>
          <Icon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold tracking-[-0.02em]">{name}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">{count}</span>
          </span>
          <span className="mt-0.5 block text-[15px] leading-6 text-muted-foreground">{tagline}</span>
          <span className="mt-2 block text-sm font-bold text-foreground">{where}</span>
        </span>
      </Link>
    </li>
  );
}

/** A titled part of the catalogue, with a count and an optional link on the right. */
export function LabSection({
  id,
  title,
  count,
  intro,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  intro?: ReactNode;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 id={id} className="flex items-baseline gap-2.5 text-2xl tracking-[-0.02em]">
            {title}
            {count !== undefined ? <span className="text-base font-bold tabular-nums text-muted-foreground">{count}</span> : null}
          </h2>
          {intro ? <p className="mt-1 max-w-3xl text-base text-muted-foreground">{intro}</p> : null}
        </div>
        {action ? (
          <Link href={action.href} className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 text-base font-bold text-primary hover:underline", focusRing)}>
            {action.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
