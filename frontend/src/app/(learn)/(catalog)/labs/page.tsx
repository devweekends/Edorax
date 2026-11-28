import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { LAB_KINDS, type LabKindId } from "@/lib/learn-areas";
import { shellCollections, visualCollections, type LabCollection } from "@/lib/lab-collections";
import { labTopicStyle } from "@/lib/lab-topics";
import { visualLabGroups } from "@/lib/visual-labs";
import { loadGuidedTracks } from "@/lib/guided-labs-server";
import { loadShellLabProgress, loadShellLabs } from "@/lib/shell-labs-server";
import { shellLevelLabel, shellTopicLabel, type PublicShellLab } from "@/lib/shell-labs";
import { AreaPage } from "@/components/areas/area-page";
import { CollectionTile, FeaturedLab, LabCard, LabGrid, LabSection, LabTag } from "@/components/areas/lab-card";
import { Dot } from "@/components/brand/dot";

export const metadata: Metadata = {
  title: "Labs",
  description: "Build it, break it, and see the result. Collections of hands-on labs: Linux, Docker, Kubernetes, Ansible, System Design and Networking.",
  alternates: { canonical: "/labs" },
  openGraph: { title: "Labs on Edorax", url: "/labs", images: [SITE_SHARE_IMAGE] },
};

// The Labs overview. Labs live in collections, one page per topic (/labs/linux, /labs/docker,
// /labs/networking and so on, see labs/[topic]/page.tsx). This page only helps the learner pick:
//   1. one lab to continue or to start with (the only filled panel)
//   2. the shell collections
//   3. the visual collections
//   4. the guided tracks

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stepsDone(lab: PublicShellLab, done: string[] | undefined) {
  return lab.steps.filter((step) => done?.includes(step.id)).length;
}

function Collections({ items, finished }: { items: LabCollection[]; finished?: Record<string, number> }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <CollectionTile key={item.id} topic={labTopicStyle(item.id)} name={item.name} intro={item.intro} count={item.count} done={finished?.[item.id]} href={item.href} />
      ))}
    </ul>
  );
}

export default async function LabsPage({ searchParams }: { searchParams: SearchParams }) {
  // Old addresses from before the collections: /labs?kind=shell&topic=linux and the like.
  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const oldKind = one(query.kind) as LabKindId | undefined;
  const oldTopic = one(query.topic);
  if (oldKind && LAB_KINDS.some((item) => item.id === oldKind)) redirect(oldTopic && /^[a-z0-9-]+$/.test(oldTopic) ? `/labs/${oldTopic}` : `/labs#${oldKind}`);

  const [guided, shellLabs, shellProgress] = await Promise.all([loadGuidedTracks(), loadShellLabs(), loadShellLabProgress()]);
  const shell = shellCollections(shellLabs);
  const visual = visualCollections(visualLabGroups());
  const shellInBrowser = shellLabs.filter((lab) => lab.browser).length;
  const finished = Object.fromEntries(
    shell.map((item) => [item.id, shellLabs.filter((lab) => lab.topic === item.id && lab.steps.length > 0 && stepsDone(lab, shellProgress[lab.slug]) >= lab.steps.length).length]),
  );

  // The featured lab: one the learner has started, else the first lab not done yet (browser labs first).
  const inProgress = shellLabs.find((lab) => {
    const done = stepsDone(lab, shellProgress[lab.slug]);
    return done > 0 && done < lab.steps.length;
  });
  const nextUp = [...shellLabs.filter((lab) => lab.browser), ...shellLabs.filter((lab) => !lab.browser)].find((lab) => stepsDone(lab, shellProgress[lab.slug]) === 0);
  const featured = inProgress ?? nextUp;
  const hasProgress = Object.keys(shellProgress).length > 0;

  return (
    <AreaPage>
      <header className="max-w-3xl">
        <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Labs</h1>
        <p className="mt-2 text-lg text-muted-foreground">Reading tells you how a system should behave. A lab lets you find out: build it, break it, and see the result.</p>
      </header>

      <div className="mt-7">
        {featured ? (
          <FeaturedLab
            eyebrow={inProgress ? "Continue where you stopped" : hasProgress ? "Your next lab" : "Start here"}
            title={featured.title}
            body={featured.summary}
            href={`/labs/shell/${featured.slug}`}
            cta={inProgress ? "Continue the lab" : featured.browser ? "Start in your browser" : "Open the lab"}
            facts={[
              shellTopicLabel(featured.topic),
              shellLevelLabel(featured.level),
              ...(featured.minutes > 0 ? [`${featured.minutes} min`] : []),
              ...(featured.steps.length > 0 ? [`${featured.steps.length} steps`] : []),
              ...(featured.browser ? ["Nothing to install"] : []),
            ]}
            progress={{ done: stepsDone(featured, shellProgress[featured.slug]), total: featured.steps.length }}
            art={<Dot mood={inProgress ? "determined" : "wave"} size={132} />}
          />
        ) : null}

        <LabSection
          id="shell"
          title="Shell labs"
          count={shellLabs.length}
          intro={
            shellInBrowser > 0
              ? `A real machine and a real terminal. Every step is checked on the machine itself. ${shellInBrowser} labs start in your browser.`
              : "A real machine and a real terminal. Every step is checked on the machine itself."
          }
        >
          {shell.length > 0 ? (
            <Collections items={shell} finished={finished} />
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-card p-5 text-base text-muted-foreground">The shell labs could not be loaded right now. Try again in a minute.</p>
          )}
        </LabSection>

        <LabSection id="visual" title="Visual labs" count={visual.reduce((sum, item) => sum + item.count, 0)} intro="Design a system on a board, choose what to break, and press Run. No code, and it runs in your browser.">
          <Collections items={visual} />
        </LabSection>

        <LabSection
          id="guided"
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
      </div>
    </AreaPage>
  );
}
