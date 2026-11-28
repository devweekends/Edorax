import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { shellCollections, visualCollections } from "@/lib/lab-collections";
import { labTopicStyle } from "@/lib/lab-topics";
import { visualLabGroups } from "@/lib/visual-labs";
import { loadShellLabProgress, loadShellLabs } from "@/lib/shell-labs-server";
import { shellLevelLabel, type PublicShellLab } from "@/lib/shell-labs";
import { AreaPage, StepList } from "@/components/areas/area-page";
import { FilterChips, pickFilter } from "@/components/areas/filter-chips";
import { LabCard, LabGrid, LabSection, LabTag, TopicBadge } from "@/components/areas/lab-card";

// One collection: every lab of one topic. /labs/linux, /labs/docker, /labs/kubernetes and
// /labs/ansible hold shell labs (from the API); /labs/system-design-challenges, /labs/networking
// and the other visual groups hold visual labs (from the lab registry). The pages /labs/visual,
// /labs/guided and /labs/shell have folders of their own and win over this one.

type Params = Promise<{ topic: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];
const LEVEL_INTRO: Record<string, string> = {
  beginner: "Start here if the topic is new to you.",
  intermediate: "For when the basics feel easy.",
  advanced: "Hard problems with little help.",
};

async function findCollection(id: string) {
  const groups = visualLabGroups();
  const visual = visualCollections(groups).find((item) => item.id === id);
  if (visual) return { collection: visual, group: groups.find((group) => group.id === id)!, shellLabs: [] as PublicShellLab[] };
  const shellLabs = await loadShellLabs();
  const shell = shellCollections(shellLabs).find((item) => item.id === id);
  return shell ? { collection: shell, group: null, shellLabs: shellLabs.filter((lab) => lab.topic === id) } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await findCollection((await params).topic);
  if (!found) return { title: "Labs" };
  const { collection } = found;
  const title = `${collection.name} labs`;
  return {
    title,
    description: collection.intro,
    alternates: { canonical: collection.href },
    openGraph: { title: `${title} on Edorax`, description: collection.intro, url: collection.href, images: [SITE_SHARE_IMAGE] },
  };
}

function stepsDone(lab: PublicShellLab, done: string[] | undefined) {
  return lab.steps.filter((step) => done?.includes(step.id)).length;
}

export default async function LabCollectionPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const found = await findCollection((await params).topic);
  if (!found) notFound();
  const { collection, group, shellLabs } = found;
  const topic = labTopicStyle(collection.id);
  const query = await searchParams;

  const progress = collection.kind === "shell" ? await loadShellLabProgress() : {};
  const inBrowser = shellLabs.filter((lab) => lab.browser).length;
  // The one filter a shell collection has: only the labs that start in the browser.
  const where = collection.kind === "shell" && inBrowser > 0 && inBrowser < shellLabs.length ? pickFilter(query.where, ["browser"]) : null;
  const listed = shellLabs.filter((lab) => where === null || lab.browser);
  const levels = [...new Set(listed.map((lab) => lab.level))].sort((a, b) => {
    const [x, y] = [LEVEL_ORDER.indexOf(a), LEVEL_ORDER.indexOf(b)];
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
  });
  const finished = shellLabs.filter((lab) => lab.steps.length > 0 && stepsDone(lab, progress[lab.slug]) >= lab.steps.length).length;

  return (
    <AreaPage>
      <Link href="/labs" className="inline-flex min-h-11 items-center gap-1.5 text-base font-bold text-primary outline-none hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow">
        <ArrowLeft className="size-4" aria-hidden />
        All labs
      </Link>

      <header className="mt-2 flex items-start gap-4">
        <TopicBadge topic={topic} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-primary">{collection.kind === "shell" ? "Shell labs" : "Visual labs"}</p>
          <h1 className="mt-1 text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">{collection.name}</h1>
          <p className="mt-2 max-w-3xl text-lg text-muted-foreground">{collection.intro}</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold">
            <span>{collection.count} labs</span>
            {inBrowser > 0 ? (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span>{inBrowser === shellLabs.length ? "All start in your browser" : `${inBrowser} start in your browser`}</span>
              </>
            ) : null}
            {collection.kind === "visual" ? (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span>Runs in your browser</span>
              </>
            ) : null}
            {finished > 0 ? (
              <>
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="text-emerald-700 dark:text-emerald-300">{finished} done</span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      {collection.kind === "shell" && inBrowser > 0 && inBrowser < shellLabs.length ? (
        <div className="mt-6">
          <FilterChips
            label="Show"
            param="where"
            current={where}
            basePath={collection.href}
            params={{ where }}
            options={[
              { value: null, label: "All labs", count: shellLabs.length },
              { value: "browser", label: "In your browser", count: inBrowser },
            ]}
          />
        </div>
      ) : null}

      <div className="mt-8">
        {collection.kind === "shell"
          ? levels.map((level) => {
              const labs = listed.filter((lab) => lab.level === level);
              return (
                <LabSection key={level} id={`level-${level}`} title={shellLevelLabel(level)} count={labs.length} intro={LEVEL_INTRO[level]}>
                  <LabGrid>
                    {labs.map((lab) => (
                      <LabCard
                        key={lab.slug}
                        title={lab.title}
                        body={lab.summary}
                        href={`/labs/shell/${lab.slug}`}
                        topic={topic}
                        tag={lab.browser ? <LabTag tone="good">In your browser</LabTag> : <LabTag>Desktop app</LabTag>}
                        facts={[...(lab.minutes > 0 ? [`${lab.minutes} min`] : []), ...(lab.steps.length > 0 ? [`${lab.steps.length} steps`] : [])]}
                        progress={{ done: stepsDone(lab, progress[lab.slug]), total: lab.steps.length }}
                      />
                    ))}
                  </LabGrid>
                </LabSection>
              );
            })
          : null}

        {group ? (
          <LabGrid>
            {group.labs.map((lab) => (
              <LabCard key={lab.slug} title={lab.title} body={lab.purpose} href={`/labs/visual/${lab.slug}`} topic={topic} facts={lab.challenge ? [`${lab.checks} checks`] : undefined} />
            ))}
          </LabGrid>
        ) : null}
      </div>

      {collection.kind === "shell" && inBrowser < shellLabs.length ? (
        <p className="mt-12 border-t border-border pt-4 text-base text-muted-foreground">
          Labs marked <strong className="text-foreground">Desktop app</strong> need the free Edorax desktop app.{" "}
          <Link href="/labs/shell#download" className="font-bold text-primary underline-offset-4 hover:underline">
            Get the desktop app
          </Link>
        </p>
      ) : null}

      {group ? (
        <details className="group mt-12 border-t border-border pt-4">
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
      ) : null}
    </AreaPage>
  );
}
