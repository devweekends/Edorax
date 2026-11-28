import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorDown, SquareTerminal } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { AreaHero, AreaPage, AreaSection, StepList } from "@/components/areas/area-page";
import { DesktopDownloadButtons, DesktopDownloadMenu } from "@/components/areas/desktop-download";
import { Rich } from "@/components/shell-labs/rich";
import { BrowserShellLab } from "@/components/shell-labs/browser-shell-lab";
import { loadBrowserShellLab, loadDesktopDownloads, loadShellLab } from "@/lib/shell-labs-server";
import { getSessionUser } from "@/server/auth/guards";
import { shellLabMeta } from "@/lib/shell-labs";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lab = await loadShellLab((await params).slug);
  if (!lab) return { title: "Shell lab" };
  const path = `/labs/shell/${lab.slug}`;
  return {
    title: `${lab.title} (shell lab)`,
    description: lab.summary,
    alternates: { canonical: path },
    openGraph: { title: `${lab.title} on Edorax`, description: lab.summary, url: path, images: [SITE_SHARE_IMAGE] },
  };
}

export default async function ShellLabPage({ params }: { params: Params }) {
  const lab = await loadShellLab((await params).slug);
  if (!lab) notFound();
  const [downloads, user] = await Promise.all([loadDesktopDownloads(), getSessionUser()]);
  const version = downloads.find((item) => item.version)?.version;
  // A lab that runs in the browser opens right here for a signed-in learner. Everyone else sees how to get in.
  const inBrowser = lab.browser && user ? await loadBrowserShellLab(lab.slug) : null;

  return (
    <AreaPage>
      <Link
        href="/labs?kind=shell"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-base font-bold text-primary outline-none hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All shell labs
      </Link>

      {lab.browser ? (
        // A short header, so the steps and the terminal start high on the screen. The desktop app
        // is the second choice here, so it is one button with a menu, not a section of its own.
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 max-w-4xl flex-1 basis-96">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-primary">{shellLabMeta(lab)}</p>
            <h1 className="mt-1.5 text-3xl leading-tight tracking-[-0.02em] sm:text-4xl">{lab.title}</h1>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              <Rich text={lab.scenario ?? lab.summary} />
            </p>
          </div>
          <DesktopDownloadMenu options={downloads} version={version} className="mt-1" />
        </header>
      ) : (
        <AreaHero eyebrow={shellLabMeta(lab)} title={lab.title} mood="determined" intro={<Rich text={lab.scenario ?? lab.summary} />} />
      )}

      {inBrowser && <BrowserShellLab lab={inBrowser.lab} initialDone={inBrowser.done} />}

      {lab.browser && !inBrowser && (
        <section aria-labelledby="shell-lab-browser" className="mt-8 border-2 border-primary bg-card p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-primary">
              <SquareTerminal className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="shell-lab-browser" className="text-xl tracking-[-0.02em]">
                This lab runs in your browser
              </h2>
              <p className="mt-1 max-w-2xl text-base text-muted-foreground">
                {user
                  ? "Confirm your email address to start. The lab runs on a real Linux machine inside this tab, with nothing to install."
                  : "Sign in to start. The lab runs on a real Linux machine inside this tab, with nothing to install."}
              </p>
              <Link
                href={user ? "/verify-email" : `/login?redirectTo=${encodeURIComponent(`/labs/shell/${lab.slug}`)}`}
                className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-base font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
              >
                {user ? "Confirm your email" : "Sign in to start"}
              </Link>
            </div>
          </div>
        </section>
      )}

      {!lab.browser && (
      <section aria-labelledby="shell-lab-app" className="mt-8 border-2 border-primary bg-card p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-primary">
            <MonitorDown className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="shell-lab-app" className="text-xl tracking-[-0.02em]">
              Work on this lab in the desktop app
            </h2>
            <p className="mt-1 max-w-2xl text-base text-muted-foreground">
              This lab needs more than a browser tab can run, so it runs on your own computer.{" "}
              Download the free Edorax desktop app, sign in with this account, and open <strong className="text-foreground">{lab.title}</strong> in the Labs
              tab. Your progress is saved on your account.
            </p>
            <DesktopDownloadButtons className="mt-4" options={downloads} />
            <p className="mt-3 text-sm text-muted-foreground">
              {version ? `Version ${version}. ` : ""}You need Docker Desktop running. The installers are not signed yet, so Windows or macOS may show a warning the first time.{" "}
              <Link href="/labs/shell#desktop" className="font-bold text-primary underline-offset-4 hover:underline">
                How the app works
              </Link>
            </p>
          </div>
        </div>
      </section>
      )}

      {!inBrowser && (
      <AreaSection id="about" title="What you will do" intro={lab.summary}>
        {lab.steps.length > 0 ? (
          <StepList steps={lab.steps.map((step) => ({ title: step.goal, body: "A task with hints and a Check button." }))} />
        ) : (
          <p className="text-base text-muted-foreground">The steps of this lab show in the desktop app.</p>
        )}
      </AreaSection>
      )}
    </AreaPage>
  );
}
