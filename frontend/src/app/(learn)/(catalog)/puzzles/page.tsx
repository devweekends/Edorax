import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { AreaHero, AreaPage, ComingSoonPanel } from "@/components/areas/area-page";
import { FilterChips, pickFilter } from "@/components/areas/filter-chips";

export const metadata: Metadata = {
  title: "Puzzles",
  description: "A new puzzle every day, built on what you learn in Edorax courses. Everyone gets the same puzzle, and there is a daily leaderboard to climb.",
  alternates: { canonical: "/puzzles" },
  openGraph: { title: "Daily puzzles on Edorax", url: "/puzzles", images: [SITE_SHARE_IMAGE] },
};

// The kinds take turns through the week. Each has a one-line goal and an example of the day's prompt.
const KINDS = [
  {
    id: "bottleneck",
    label: "Find the bottleneck",
    goal: "A small system is struggling. Tap the one part that gives out first.",
    example: "Users → load balancer → two app servers → one database at 95% CPU. Checkout takes 9 seconds.",
  },
  {
    id: "trace",
    label: "Trace the request",
    goal: "Put the steps of a request in order, from the tap on a phone to the answer on screen.",
    example: "DNS lookup · TLS handshake · cache miss · database read · response rendered",
  },
  {
    id: "fix",
    label: "Fix the diagram",
    goal: "One link or one part is wrong. Find it and fix it in as few moves as you can.",
    example: "A queue sits between the browser and the load balancer. One move fixes it.",
  },
  {
    id: "odd",
    label: "Odd one out",
    goal: "Four ideas, one does not belong. Say which, and the reason appears.",
    example: "Read replica · write-ahead log · CDN edge cache · sticky session",
  },
] as const;

const RULES = [
  ["One a day", "New at midnight in your time zone. Yesterday's stays open to practise."],
  ["A few tries", "Each wrong try shows a clue, so you learn something either way."],
  ["Daily leaderboard", "Fewer tries and a faster solve rank higher. It resets every day; joining is your choice."],
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PuzzlesPage({ searchParams }: { searchParams: SearchParams }) {
  const area = areaById("puzzles");
  const query = await searchParams;
  const id = pickFilter(query.kind, KINDS.map((k) => k.id)) ?? KINDS[0].id;
  const kind = KINDS.find((k) => k.id === id)!;

  return (
    <AreaPage>
      <AreaHero
        eyebrow="Puzzles"
        title="Daily puzzles"
        status={area.status}
        mood="wink"
        intro="One small puzzle a day, the same for everyone. Solve it, see where you landed on today's leaderboard, and come back tomorrow."
      />

      <div className="mt-8">
        <FilterChips label="Kind" param="kind" current={id} basePath="/puzzles" params={{}} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} />
      </div>

      <section aria-label={kind.label} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="border border-border bg-card p-5 sm:p-6">
          <span className="text-sm font-bold uppercase tracking-wider text-primary">{kind.label}</span>
          <p className="mt-2 text-xl tracking-[-0.02em]">{kind.goal}</p>
          <p className="mt-4 border-l-4 border-brand-yellow bg-secondary/60 px-4 py-3 text-base">
            <span className="font-bold">Example: </span>
            <span data-nosnippet="">{kind.example}</span>
          </p>
        </div>
        <dl className="divide-y divide-border border border-border bg-card">
          {RULES.map(([title, body]) => (
            <div key={title} className="px-5 py-3.5">
              <dt className="text-base font-bold">{title}</dt>
              <dd className="text-base text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ComingSoonPanel title="Puzzles are on the way" action={{ href: "/labs#visual", label: "Try a visual lab now" }}>
        The visual labs are the closest thing today: a design, a set of checks, and a reason for every result.
      </ComingSoonPanel>
    </AreaPage>
  );
}
