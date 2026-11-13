import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Terminal } from 'lucide-react';
import { SHELL_TOPICS, type ShellLabSummary, type ShellTopic } from '../../domain/shell-labs';
import { ShellLabPage } from './ShellLabPage';
import { errorText, passedSteps } from './progress';

/**
 * Labs that need a real kernel of their own (systemd as PID 1, mount and loop devices). They arrive
 * with the Edorax lab VM; a container cannot be given those powers safely.
 */
const NEEDS_LAB_VM: { topic: ShellTopic; title: string; summary: string; level: string; minutes: number }[] = [
  { topic: 'linux', title: 'systemd services', summary: 'Write a unit file, enable it at boot, read its logs with journalctl and fix a service that keeps crashing.', level: 'Intermediate', minutes: 90 },
  { topic: 'linux', title: 'Storage 1: disks and partitions', summary: 'Find a new disk, partition it, make a filesystem and mount it so it survives a reboot.', level: 'Intermediate', minutes: 90 },
  { topic: 'linux', title: 'Storage 2: LVM and growing a volume', summary: 'Build a volume group, grow a full logical volume and its filesystem while it is in use.', level: 'Intermediate', minutes: 90 },
  { topic: 'linux', title: 'Storage: filesystems', summary: 'Compare ext4 and xfs, repair a damaged filesystem with fsck and fix a bad fstab line.', level: 'Intermediate', minutes: 90 },
];

const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate' } as const;

export function ShellLabs({ onBack, topic: only }: { onBack: () => void; topic?: ShellTopic }) {
  const topics = SHELL_TOPICS.filter((item) => !only || item.id === only);
  const heading = only ? `${topics[0]?.title ?? 'Shell'} labs` : 'Fix real machines from the terminal';
  const [labs, setLabs] = useState<ShellLabSummary[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    window.buildment.shellLabs
      .list()
      .then(setLabs)
      .catch((reason: unknown) => setError(errorText(reason)));
  }, []);

  if (open) return <ShellLabPage key={open} slug={open} onBack={() => setOpen(null)} />;

  return (
    <section className="mx-auto w-full max-w-7xl p-8">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft size={16} /> All labs
      </button>
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">Shell labs</p>
        <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-foreground">{heading}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each lab starts a real machine on your computer in Docker. You get a goal, hints when you want them, and a Check button that looks at
          the machine itself. The machine has no network and cannot touch your files. Reset gives you a fresh one.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      {topics.map((topic) => {
        const inTopic = labs?.filter((lab) => lab.topic === topic.id) ?? [];
        return (
          <div key={topic.id} className="mt-10">
            <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{topic.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
            <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {inTopic.map((lab) => {
                const done = passedSteps(lab.slug).length;
                return (
                  <li key={lab.slug}>
                    <button
                      onClick={() => setOpen(lab.slug)}
                      className="flex h-full w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-shadow hover:shadow-lg hover:shadow-primary/5"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <Terminal size={18} className="text-primary" />
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {LEVEL_LABEL[lab.level]}
                        </span>
                      </span>
                      <span className="font-semibold leading-snug text-foreground">{lab.title}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{lab.summary}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {lab.tags.map((tag) => (
                          <span key={tag} className="text-xs font-medium text-primary/80">
                            #{tag}
                          </span>
                        ))}
                      </span>
                      <span className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> {lab.minutes} min
                        </span>
                        <span>
                          {done ? `${Math.min(done, lab.steps)} of ${lab.steps} steps done` : `${lab.steps} steps`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {labs &&
                NEEDS_LAB_VM.filter((soon) => soon.topic === topic.id).map((soon) => (
                  <li key={soon.title} className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-5" aria-disabled="true">
                    <span className="flex items-center justify-between gap-2">
                      <Terminal size={18} className="text-muted-foreground" />
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Coming soon</span>
                    </span>
                    <span className="font-semibold leading-snug text-foreground">{soon.title}</span>
                    <span className="text-sm leading-relaxed text-muted-foreground">{soon.summary}</span>
                    <span className="mt-auto text-xs text-muted-foreground">
                      {soon.level} · {soon.minutes} min · needs the Edorax lab VM
                    </span>
                  </li>
                ))}
              {labs && !inTopic.length && !NEEDS_LAB_VM.some((soon) => soon.topic === topic.id) && (
                <li className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">Labs for this topic are coming soon.</li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
