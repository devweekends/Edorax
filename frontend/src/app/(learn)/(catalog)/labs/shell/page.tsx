import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Container, FolderOpen, LogIn, MonitorDown, Terminal } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { AreaHero, AreaPage, AreaSection, CardGrid, InfoCard } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Shell labs and the desktop app",
  description: "46 hands-on shell labs on real Linux machines, containers and networks, in the free Edorax desktop app. Download it here.",
  alternates: { canonical: "/labs/shell" },
  openGraph: { title: "Shell labs on Edorax", url: "/labs/shell", images: [SITE_SHARE_IMAGE] },
};

export default function ShellLabsPage() {
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Shell labs"
        status="live"
        mood="determined"
        intro="Real shell work: Linux machines, containers and small networks you can break and fix from a terminal. There are 46 labs, from your first Linux commands to Docker networks. They run in the free Edorax desktop app: download it, sign in with your account and start."
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
        intro="Shell labs run in the Edorax desktop app. Download it, sign in with your Edorax account and open the Labs tab."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <DocBlock icon={<MonitorDown className="size-5" />} title="What it does today">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Run the 46 shell labs: each gives you a task, hints and a Check button that looks at the machine.</li>
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
          <DocBlock icon={<Terminal className="size-5" />} title="Still to come">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Labs that need their own kernel, such as systemd and disk storage.</li>
              <li>Installers that are signed, so Windows and macOS stop showing a warning.</li>
              <li>An app that updates itself. For now you download a new version.</li>
            </ul>
          </DocBlock>
        </div>
        <p className="mt-5 text-base text-muted-foreground">
          Shell labs need Docker Desktop running on your computer. Your lab progress is saved on your account.
        </p>
      </AreaSection>

      <AreaSection id="download" title="Download the desktop app">
        <div className="flex flex-col gap-4 border border-border bg-card p-6 text-base text-muted-foreground sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-foreground">Windows, macOS (Apple silicon) and Linux. Version 0.1.0, early release.</p>
            <p className="mt-1">
              The installers are not signed yet, so Windows or macOS may show a warning the first time. Choose to run it anyway. Intel Macs are
              not built yet.
            </p>
          </div>
          <Link
            href="https://github.com/devweekends/Edorax/releases"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-primary px-5 text-base font-bold text-primary outline-none transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
          >
            Download the app
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </AreaSection>
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
