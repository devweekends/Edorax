import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Search, X } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { LAB_KINDS, areaById, type LabKindId } from "@/lib/learn-areas";
import { visualLabGroups } from "@/lib/visual-labs";
import { loadGuidedTracks } from "@/lib/guided-labs-server";
import { loadShellLabProgress, loadShellLabs } from "@/lib/shell-labs-server";
import { shellLevelLabel, shellTopicLabel, type PublicShellLab } from "@/lib/shell-labs";
import { LAB_KIND_ICON } from "@/components/areas/area-icon";
import { AreaHero, AreaPage, StepList } from "@/components/areas/area-page";
import { FilterChips, pickFilter } from "@/components/areas/filter-chips";
import { KindTile, LabCard, LabGrid, LabSection, LabTag } from "@/components/areas/lab-card";

export const metadata: Metadata = {
  title: "Labs",
  description: "Build it, break it, and see the result. Visual labs on a board, guided projects, and shell labs on a real Linux machine.",
  alternates: { canonical: "/labs" },
  openGraph: { title: "Labs on Edorax", url: "/labs", images: [SITE_SHARE_IMAGE] },
};

// The catalogue has one job per screen:
//   /labs                 the three kinds, each with a few labs to start with
//   /labs?kind=visual     every visual lab, grouped by topic
//   /labs?kind=shell      every shell lab, grouped by topic, with level and "in your browser" filters
//   /labs?kind=guided     the guided tracks
// Filters and the search box are plain links and a GET form, so every view has an address.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SHELL_TOPIC_ORDER = ["linux", "docker", "kubernetes", "ansible", "terraform"];
const SHELL_TOPIC_INTRO: Record<string, string> = {
  linux: "Files, users, permissions, processes, networking and the jobs a server runs.",
  docker: "Images, containers, networks and volumes on a real Docker engine.",
  kubernetes: "Deployments, services, configuration and fixing a broken cluster.",
  ansible: "Playbooks, inventories and roles against real servers.",
  terraform: "Plans, state and modules.",
};
const PREVIEW = 3;

function matches(text: string, query: string) {
  return text.toLowerCase().includes(query);
}

function ShellCard({ lab, done }: { lab: PublicShellLab; done: string[] | undefined }) {
  return (
    <LabCard
      title={lab.title}
      body={lab.summary}
      href={`/labs/shell/${lab.slug}`}
      tag={lab.browser ? <LabTag tone="good">In your browser</LabTag> : <LabTag>Desktop app</LabTag>}
      facts={[shellLevelLabel(lab.level), ...(lab.minutes > 0 ? [`${lab.minutes} min`] : []), ...(lab.steps.length > 0 ? [`${lab.steps.length} steps`] : [])]}
      progress={{ done: lab.steps.filter((step) => done?.includes(step.id)).length, total: lab.steps.length }}
    />
  );
}

export default async function LabsPage({ searchParams }: { searchParams: SearchParams }) {
  const area = areaById("labs");
  const [guided, shellLabs, shellProgress, query] = await Promise.all([loadGuidedTracks(), loadShellLabs(), loadShellLabProgress(), searchParams]);
  const visualGroups = visualLabGroups();
  const visualTotal = visualGroups.reduce((sum, group) => sum + group.labs.length, 0);
  const guidedOpen = guided.filter((track) => track.open).length;
  const shellInBrowser = shellLabs.filter((lab) => lab.browser).length;
  const shellTopics = [...new Set(shellLabs.map((lab) => lab.topic))].sort((a, b) => {
    const [x, y] = [SHELL_TOPIC_ORDER.indexOf(a), SHELL_TOPIC_ORDER.indexOf(b)];
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
  });
  const shellLevels = [...new Set(shellLabs.map((lab) => lab.level))];

  const kind = pickFilter(query.kind, LAB_KINDS.map((item) => item.id)) as LabKindId | null;
  const topic = kind === "visual" ? pickFilter(query.topic, visualGroups.map((group) => group.id)) : kind === "shell" ? pickFilter(query.topic, shellTopics) : null;
  const level = kind === "shell" ? pickFilter(query.level, shellLevels) : null;
  const where = kind === "shell" ? pickFilter(query.where, ["browser"]) : null;
  const rawSearch = (Array.isArray(query.q) ? query.q[0] : query.q) ?? "";
  const search = kind === "visual" || kind === "shell" ? rawSearch.trim().slice(0, 60) : "";
  const needle = search.toLowerCase();
  const params = { kind, topic, level, where, q: search || null };
  const openKind = LAB_KINDS.find((item) => item.id === kind);

  const kindFacts: Record<LabKindId, { count: string; where: string }> = {
    visual: { count: `${visualTotal} labs`, where: "Runs in your browser" },
    guided: { count: guidedOpen > 0 ? `${guidedOpen} open` : "Soon", where: "Your own code, checked for you" },
    shell: { count: `${shellLabs.length} labs`, where: shellInBrowser > 0 ? `${shellInBrowser} run in your browser, the rest in the desktop app` : "Runs in the desktop app" },
  };

  // What the chosen kind shows, after its filters and the search.
  const visualShown = visualGroups
    .filter((group) => topic === null || group.id === topic)
    .map((group) => ({ ...group, labs: group.labs.filter((lab) => !needle || matches(`${lab.title} ${lab.purpose}`, needle)) }))
    .filter((group) => group.labs.length > 0);
  const shellFiltered = shellLabs.filter(
    (lab) =>
      (topic === null || lab.topic === topic) &&
      (level === null || lab.level === level) &&
      (where === null || lab.browser) &&
      (!needle || matches(`${lab.title} ${lab.summary} ${lab.tags.join(" ")}`, needle)),
  );
  const shellShown = shellTopics.map((id) => ({ id, labs: shellFiltered.filter((lab) => lab.topic === id) })).filter((group) => group.labs.length > 0);
  const shown = kind === "visual" ? visualShown.reduce((sum, group) => sum + group.labs.length, 0) : kind === "shell" ? shellFiltered.length : 0;
  const filtered = Boolean(topic || level || where || search);
  // Labs a new learner can start with right away: the browser ones first.
  const shellStart = [...shellLabs.filter((lab) => lab.browser), ...shellLabs.filter((lab) => !lab.browser)].slice(0, PREVIEW);

  return (
    <AreaPage>
      {kind === null ? (
        <AreaHero
          eyebrow="Labs"
          title="Build it, break it, see the result"
          status={area.status}
          mood="determined"
          intro="Reading tells you how a system should behave. A lab lets you find out. Pick the kind of lab that fits what you want to practise."
        />
      ) : (
        // A kind is open: a short header, so its labs start near the top of the screen.
        <header>
          <Link href="/labs" className="inline-flex min-h-11 items-center gap-1.5 text-base font-bold text-primary outline-none hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow">
            <ArrowLeft className="size-4" aria-hidden />
            All labs
          </Link>
          <h1 className="mt-1 text-3xl tracking-[-0.02em] sm:text-4xl">{openKind?.name}</h1>
          <p className="mt-2 max-w-3xl text-base text-muted-foreground sm:text-lg">{openKind?.tagline}</p>
        </header>
      )}

      <nav aria-label="Kind of lab" className={kind === null ? "mt-8" : "mt-5"} data-testid="lab-filters">
        <ul className="grid gap-3 md:grid-cols-3">
          {LAB_KINDS.map((item) => (
            <KindTile
              key={item.id}
              icon={LAB_KIND_ICON[item.id]}
              name={item.name}
              tagline={item.tagline}
              count={kindFacts[item.id].count}
              where={kindFacts[item.id].where}
              // The open kind's tile closes it again, back to the overview.
              href={kind === item.id ? "/labs" : `/labs?kind=${item.id}`}
              active={kind === item.id}
              compact={kind !== null}
            />
          ))}
        </ul>
      </nav>

      {kind === "visual" || kind === "shell" ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <form action="/labs" method="get" role="search" className="flex flex-wrap items-center gap-2">
            {Object.entries({ kind, topic, level, where }).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
            <label className="relative min-w-0 flex-1 basis-64">
              <span className="sr-only">Search {kind} labs</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={search}
                maxLength={60}
                placeholder={kind === "shell" ? "Search shell labs, for example cron or permissions" : "Search visual labs, for example cache or subnet"}
                className="min-h-11 w-full rounded-md border-2 border-input bg-background pl-9 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary"
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-base font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Search
            </button>
          </form>
          <FilterChips
            label="Topic"
            param="topic"
            current={topic}
            basePath="/labs"
            params={params}
            options={
              kind === "visual"
                ? [{ value: null, label: "All" }, ...visualGroups.map((group) => ({ value: group.id, label: group.title, count: group.labs.length }))]
                : [{ value: null, label: "All" }, ...shellTopics.map((id) => ({ value: id, label: shellTopicLabel(id), count: shellLabs.filter((lab) => lab.topic === id).length }))]
            }
          />
          {kind === "shell" ? (
            <>
              <FilterChips
                label="Level"
                param="level"
                current={level}
                basePath="/labs"
                params={params}
                options={[{ value: null, label: "All" }, ...shellLevels.map((id) => ({ value: id, label: shellLevelLabel(id), count: shellLabs.filter((lab) => lab.level === id).length }))]}
              />
              <FilterChips
                label="Runs"
                param="where"
                current={where}
                basePath="/labs"
                params={params}
                options={[
                  { value: null, label: "Anywhere" },
                  { value: "browser", label: "In your browser", count: shellInBrowser },
                ]}
              />
            </>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground" role="status">
            <span>
              <strong className="text-foreground">{shown}</strong> {shown === 1 ? "lab" : "labs"}
              {search ? (
                <>
                  {" "}
                  for <strong className="text-foreground">{search}</strong>
                </>
              ) : null}
            </span>
            {filtered ? (
              <Link href={`/labs?kind=${kind}`} scroll={false} className="inline-flex items-center gap-1 font-bold text-primary underline-offset-4 hover:underline">
                <X className="size-4" aria-hidden />
                Clear filters
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="mt-8">
        {/* Overview: a few labs of each kind to start with. */}
        {kind === null ? (
          <>
            <LabSection
              id="labs-visual"
              title="Visual labs"
              count={visualTotal}
              intro="Design a system on a board, pick what to break, and press Run. No code."
              action={{ href: "/labs?kind=visual", label: `See all ${visualTotal}` }}
            >
              <LabGrid>
                {visualGroups.slice(0, PREVIEW).map((group) => {
                  const lab = group.labs[0];
                  return <LabCard key={lab.slug} title={lab.title} body={lab.purpose} href={`/labs/visual/${lab.slug}`} facts={[group.title, ...(lab.challenge ? [`${lab.checks} checks`] : [])]} />;
                })}
              </LabGrid>
            </LabSection>

            <LabSection
              id="labs-shell"
              title="Shell labs"
              count={shellLabs.length}
              intro="A real Linux machine and a real terminal. Each step is checked on the machine itself."
              action={shellLabs.length > 0 ? { href: "/labs?kind=shell", label: `See all ${shellLabs.length}` } : undefined}
            >
              {shellLabs.length > 0 ? (
                <LabGrid>
                  {shellStart.map((lab) => (
                    <ShellCard key={lab.slug} lab={lab} done={shellProgress[lab.slug]} />
                  ))}
                </LabGrid>
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-card p-5 text-base text-muted-foreground">The shell labs could not be loaded right now. Try again in a minute.</p>
              )}
            </LabSection>

            <LabSection
              id="labs-guided"
              title="Guided labs"
              count={guided.length}
              intro="A real project built step by step, with tests, a quiz after each lab and a capstone that is checked for you."
              action={{ href: "/labs?kind=guided", label: "See the tracks" }}
            >
              <LabGrid>
                {guided.slice(0, PREVIEW).map(({ track, open, title, length, price, href }) => (
                  <LabCard
                    key={track.slug}
                    title={open ? title : `${track.level}: ${track.fallbackTitle}`}
                    body={track.audience}
                    href={open && href ? href : undefined}
                    tag={open ? <LabTag tone="good">Open</LabTag> : <LabTag>Coming soon</LabTag>}
                    facts={[length, price].filter((fact): fact is string => Boolean(fact))}
                  />
                ))}
              </LabGrid>
            </LabSection>
          </>
        ) : null}

        {kind === "visual" ? (
          <>
            {visualShown.map((group) => (
              <LabSection key={group.id} id={`labs-visual-${group.id}`} title={group.title} count={group.labs.length} intro={group.description}>
                <LabGrid>
                  {group.labs.map((lab) => (
                    <LabCard key={lab.slug} title={lab.title} body={lab.purpose} href={`/labs/visual/${lab.slug}`} facts={lab.challenge ? [`${lab.checks} checks`] : undefined} />
                  ))}
                </LabGrid>
              </LabSection>
            ))}
            <details className="group mt-10 border-t border-border pt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-lg font-bold outline-none focus-visible:outline-3 focus-visible:outline-brand-yellow [&::-webkit-details-marker]:hidden">
                How a visual lab works
              </summary>
              <div className="mt-4">
                <StepList
                  steps={[
                    { title: "Build", body: "Add parts from the list, link them and set their size. Switch between plain names and real AWS names at any time." },
                    { title: "Choose what to break", body: "Open a part and press Break it. That only arms the failure. Nothing changes until you run." },
                    { title: "Press Run", body: "The design plays through every scenario: normal traffic, the peak, and each failure." },
                    { title: "Read the checks", body: "Every test case passes or fails on the board, with the number it measured and why. Fix one thing and run again." },
                  ]}
                />
              </div>
            </details>
          </>
        ) : null}

        {kind === "shell" ? (
          <>
            {shellShown.map((group) => (
              <LabSection key={group.id} id={`labs-shell-${group.id}`} title={shellTopicLabel(group.id)} count={group.labs.length} intro={SHELL_TOPIC_INTRO[group.id]}>
                <LabGrid>
                  {group.labs.map((lab) => (
                    <ShellCard key={lab.slug} lab={lab} done={shellProgress[lab.slug]} />
                  ))}
                </LabGrid>
              </LabSection>
            ))}
            {shellLabs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card p-5 text-base text-muted-foreground">The shell labs could not be loaded right now. Try again in a minute.</p>
            ) : null}
            <p className="mt-10 border-t border-border pt-4 text-base text-muted-foreground">
              Labs marked <strong className="text-foreground">In your browser</strong> start on this site with nothing to install. The others need the free Edorax desktop app.{" "}
              <Link href="/labs/shell#download" className="font-bold text-primary underline-offset-4 hover:underline">
                Get the desktop app
              </Link>
            </p>
          </>
        ) : null}

        {(kind === "visual" || kind === "shell") && shown === 0 && (kind === "visual" || shellLabs.length > 0) ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-lg font-bold">No lab matches these filters</p>
            <p className="mt-1 text-base text-muted-foreground">Try another word, or clear the filters to see every lab.</p>
            <Link
              href={`/labs?kind=${kind}`}
              scroll={false}
              className="mt-4 inline-flex min-h-11 items-center rounded-md border-2 border-primary px-4 text-base font-bold text-primary outline-none hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
            >
              Clear filters
            </Link>
          </div>
        ) : null}

        {kind === "guided" ? (
          <LabSection
            id="labs-guided"
            title="Guided labs"
            count={guided.length}
            intro="A real project built step by step, with tests, a quiz after each lab and a capstone that is checked for you."
            action={{ href: "/labs/guided", label: "How guided labs work" }}
          >
            <LabGrid>
              {guided.map(({ track, open, title, length, price, href }) => (
                <LabCard
                  key={track.slug}
                  title={open ? title : `${track.level}: ${track.fallbackTitle}`}
                  body={track.audience}
                  href={open && href ? href : undefined}
                  tag={open ? <LabTag tone="good">Open</LabTag> : <LabTag>Coming soon</LabTag>}
                  facts={[length, price].filter((fact): fact is string => Boolean(fact))}
                />
              ))}
            </LabGrid>
          </LabSection>
        ) : null}
      </div>
    </AreaPage>
  );
}
