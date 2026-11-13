import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Terminal } from 'lucide-react';
import type { ShellLabSummary, ShellTopic } from '../../domain/shell-labs';
import { ShellLabPage } from './ShellLabPage';
import { errorText, passedSteps } from './progress';

const TOPICS: { id: ShellTopic; title: string; description: string }[] = [
  { id: 'linux', title: 'Linux', description: 'Users, permissions, files, processes and services on a real server.' },
  { id: 'docker', title: 'Docker', description: 'Build images, run containers and fix a broken Compose stack.' },
  { id: 'ansible', title: 'Ansible', description: 'Configure a fleet of servers from one control node.' },
  { id: 'kubernetes', title: 'Kubernetes', description: 'Deploy, scale and debug workloads on a real cluster.' },
];

export function ShellLabs({ onBack }: { onBack: () => void }) {
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
        <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-foreground">Fix real machines from the terminal</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each lab starts a real Linux machine on your computer in Docker. You get a goal, hints when you want them, and a Check button that looks at
          the machine itself. The machine has no network and cannot touch your files. Reset gives you a fresh one.
        </p>
      </header>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      {TOPICS.map((topic) => {
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
                      <Terminal size={18} className="text-primary" />
                      <span className="font-semibold leading-snug text-foreground">{lab.title}</span>
                      <span className="text-sm leading-relaxed text-muted-foreground">{lab.summary}</span>
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
              {labs && !inTopic.length && (
                <li className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">Labs for this topic are coming soon.</li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
