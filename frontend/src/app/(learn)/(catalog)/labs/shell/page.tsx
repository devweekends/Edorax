import type { Metadata } from "next";
import { Container, FolderOpen, LogIn, MonitorDown, Terminal } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { AreaHero, AreaPage, AreaSection, CardGrid, ComingSoonPanel, InfoCard } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Shell labs and the desktop app",
  description: "Real shell work on real machines, in the Edorax desktop app. What it does today and what is coming.",
  alternates: { canonical: "/labs/shell" },
  openGraph: { title: "Shell labs on Edorax", url: "/labs/shell", images: [SITE_SHARE_IMAGE] },
};

export default function ShellLabsPage() {
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Shell labs"
        status="coming-soon"
        mood="determined"
        intro="Real shell work: Linux machines, containers and small networks you can break and fix from a terminal. Shell labs run in the Edorax desktop app, which is being built now."
      />

      <AreaSection id="what" title="What you will do">
        <CardGrid>
          <InfoCard icon={<Terminal className="size-6" />} title="A real terminal" body="Type real commands on a real machine. Nothing is simulated, so what you learn works at work." />
          <InfoCard icon={<Container className="size-6" />} title="Machines that reset" body="Each lab starts from a clean machine or container. Break it as much as you like, then reset." />
          <InfoCard icon={<FolderOpen className="size-6" />} title="Checked by tests" body="Tests look at the machine to see whether the task is done, and explain what is still missing." />
        </CardGrid>
      </AreaSection>

      <AreaSection
        id="desktop"
        title="The desktop app"
        intro="The Edorax desktop app is where shell labs will live. These notes cover what it does today and how it connects to your account."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <DocBlock icon={<MonitorDown className="size-5" />} title="What it does today">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Browse the course catalogue and course previews.</li>
              <li>Read lessons in a native reader, with the same diagrams, labs and quizzes as the web.</li>
              <li>Open a course IDE beside a lesson: edit files, run a terminal, and check exercises.</li>
              <li>Run the terminal on your own machine, or in an isolated Docker Linux workspace.</li>
            </ul>
          </DocBlock>
          <DocBlock icon={<LogIn className="size-5" />} title="Signing in">
            <p>
              Sign in opens your normal browser. You approve the desktop app on the web, and it receives a short-lived, single-use code. Your
              password never goes into the desktop app, and closing the app signs you out.
            </p>
          </DocBlock>
          <DocBlock icon={<Container className="size-5" />} title="Docker workspaces">
            <p>
              A Docker workspace has no network, a read-only base and limits on CPU, memory and processes. Stop keeps your files; Reset asks
              before it removes them. You need Docker Desktop running for this mode.
            </p>
          </DocBlock>
          <DocBlock icon={<Terminal className="size-5" />} title="What is coming for shell labs">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Lab machines that a course defines: Linux hosts, containers and small networks.</li>
              <li>Tests that check the machine after each step.</li>
              <li>Progress that syncs to your account, the same as chapters.</li>
            </ul>
          </DocBlock>
        </div>
        <p className="mt-5 text-base text-muted-foreground">
          The app is tested on Apple silicon Macs first. Windows and Intel Macs follow. Downloads will be linked here when it is ready.
        </p>
      </AreaSection>

      <ComingSoonPanel title="Shell labs arrive with the desktop app" action={{ href: "/labs?kind=visual", label: "Try a visual lab now" }}>
        Visual labs are open today in the browser, with no install.
      </ComingSoonPanel>
    </AreaPage>
  );
}

function DocBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-5 text-base text-muted-foreground">
      <h3 className="flex items-center gap-2 text-lg tracking-[-0.01em] text-foreground">
        <span aria-hidden className="grid size-8 place-items-center rounded-md bg-secondary text-primary">
          {icon}
        </span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}
