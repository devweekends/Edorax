import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { LabTopicStyle } from "@/lib/lab-topics";
import { cn } from "@/lib/utils";

// Building blocks of the Labs catalogue (/labs). The catalogue holds over a hundred labs, so a
// card is small: the topic's icon, a title, two lines of text and a few facts. Titles use the
// body font, not the display font, so a screen full of cards stays easy to scan.

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

/** The topic's icon in its colour. */
export function TopicBadge({ topic, size = "md" }: { topic: LabTopicStyle; size?: "md" | "lg" }) {
  const Icon = topic.icon;
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-lg", topic.tone, size === "lg" ? "size-12" : "size-10")}>
      <Icon className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}

function ProgressLine({ done, total }: { done: number; total: number }) {
  return done >= total ? (
    <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">
      <Check className="size-4" aria-hidden />
      Done
    </span>
  ) : (
    <span className="flex items-center gap-2 text-sm font-bold">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="shrink-0 text-muted-foreground">
        {done} of {total} steps
      </span>
    </span>
  );
}

/** One lab in the catalogue. The whole card is the link. */
export function LabCard({
  title,
  body,
  href,
  topic,
  facts,
  tag,
  progress,
}: {
  title: string;
  body: string;
  href?: string;
  topic?: LabTopicStyle;
  /** Short facts under the text, such as "Beginner", "30 min", "5 steps". */
  facts?: string[];
  tag?: ReactNode;
  /** Steps passed out of all steps. Shown only when the learner has started. */
  progress?: { done: number; total: number };
}) {
  const started = progress && progress.done > 0 && progress.total > 0;
  const inner = (
    <>
      <div className="flex items-start gap-3">
        {topic ? <TopicBadge topic={topic} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-base font-bold leading-snug tracking-normal text-foreground group-hover:text-primary">{title}</h3>
          <p className="mt-1 line-clamp-2 text-[15px] leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
          {tag}
          {facts?.map((fact, index) => (
            <span key={fact} className="inline-flex items-center gap-2">
              {(index > 0 || tag) && <span aria-hidden>·</span>}
              {fact}
            </span>
          ))}
        </div>
        {started ? (
          <div className="mt-2.5">
            <ProgressLine done={progress.done} total={progress.total} />
          </div>
        ) : null}
      </div>
    </>
  );
  const box = "flex h-full flex-col rounded-xl border border-border bg-card p-4";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(box, "group transition-[border-color,box-shadow] hover:border-primary hover:shadow-sm", focusRing)}>
          {inner}
        </Link>
      ) : (
        <div className={cn(box, "opacity-75")}>{inner}</div>
      )}
    </li>
  );
}

/** The grid every list of lab cards uses. */
export function LabGrid({ children }: { children: ReactNode }) {
  return <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>;
}

/**
 * The one big thing at the top of the catalogue: the lab to continue, or the lab to start with.
 * It is the only filled panel on the page, so the eye lands on it first.
 */
export function FeaturedLab({
  eyebrow,
  title,
  body,
  href,
  cta,
  facts,
  progress,
  art,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  facts: string[];
  progress?: { done: number; total: number };
  art?: ReactNode;
}) {
  return (
    <section aria-label={eyebrow} className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-primary-foreground/80">{eyebrow}</p>
          <h2 className="mt-2 text-2xl leading-tight tracking-[-0.02em] text-primary-foreground sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">{body}</p>
          <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm font-bold text-primary-foreground/85">
            {facts.map((fact, index) => (
              <span key={fact} className="inline-flex items-center gap-2">
                {index > 0 && <span aria-hidden>·</span>}
                {fact}
              </span>
            ))}
          </p>
          {progress && progress.done > 0 ? (
            <div className="mt-4 flex max-w-sm items-center gap-3 text-sm font-bold">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-primary-foreground/25" aria-hidden>
                <span className="block h-full rounded-full bg-brand-yellow" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              <span>
                {progress.done} of {progress.total} steps
              </span>
            </div>
          ) : null}
          <Link
            href={href}
            className={cn(
              "mt-5 inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary-foreground px-5 text-base font-bold text-primary transition-transform hover:translate-x-0.5",
              focusRing,
            )}
          >
            {cta}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        {art ? <div className="hidden shrink-0 md:block">{art}</div> : null}
      </div>
    </section>
  );
}

/** A collection on the Labs overview: the topic's icon, its name, one sentence, and how many labs it holds. */
export function CollectionTile({ topic, name, intro, count, done, href }: { topic: LabTopicStyle; name: string; intro: string; count: number; done?: number; href: string }) {
  return (
    <li>
      <Link href={href} className={cn("group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] hover:border-primary hover:shadow-sm", focusRing)}>
        <span className="flex items-center justify-between gap-3">
          <TopicBadge topic={topic} size="lg" />
          <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        </span>
        <span className="mt-4 block font-sans text-lg font-bold leading-snug text-foreground group-hover:text-primary">{name}</span>
        <span className="mt-1 line-clamp-2 block flex-1 text-[15px] leading-6 text-muted-foreground">{intro}</span>
        <span className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm font-bold">
          <span>
            {count} {count === 1 ? "lab" : "labs"}
          </span>
          {done ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Check className="size-4" aria-hidden />
              {done} done
            </span>
          ) : null}
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
  topic,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  intro?: ReactNode;
  action?: { href: string; label: string };
  topic?: LabTopicStyle;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {topic ? <TopicBadge topic={topic} /> : null}
          <div className="min-w-0">
            <h2 id={id} className="flex items-baseline gap-2.5 text-xl tracking-[-0.02em] sm:text-2xl">
              {title}
              {count !== undefined ? <span className="font-sans text-base font-bold tabular-nums text-muted-foreground">{count}</span> : null}
            </h2>
            {intro ? <p className="mt-0.5 max-w-3xl text-base text-muted-foreground">{intro}</p> : null}
          </div>
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
