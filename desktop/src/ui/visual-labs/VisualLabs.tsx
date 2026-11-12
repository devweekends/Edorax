import { useMemo, useState } from 'react';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { Lab } from '@buildment/learning-ui/labs/Lab';
import { visualLabGroups } from '../../domain/visual-labs';

const COMING_SOON = [
  { title: 'Guided labs', body: 'Step-by-step labs with a short goal and a check at each step. Coming soon.' },
  { title: 'Shell labs', body: 'Practice commands on a real Linux environment. Coming soon.' },
];

export function VisualLabs() {
  const groups = useMemo(() => visualLabGroups(), []);
  const [topic, setTopic] = useState<string>('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (openSlug) {
    return (
      <section className="mx-auto w-full max-w-7xl p-6">
        <button
          onClick={() => setOpenSlug(null)}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft size={16} /> All visual labs
        </button>
        <Lab key={openSlug} slug={openSlug} />
      </section>
    );
  }

  const shown = groups.filter((group) => topic === 'all' || group.id === topic);

  return (
    <section className="mx-auto w-full max-w-7xl p-8">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">Labs</p>
        <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-foreground">Build it, break it, see the result</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Reading tells you how a system should behave. A lab lets you find out. No code: move parts, press Run, watch the checks. Visual labs work offline.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        {[{ id: 'all', title: 'All topics' }, ...groups.map((group) => ({ id: group.id, title: group.title }))].map((item) => (
          <button
            key={item.id}
            onClick={() => setTopic(item.id)}
            className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${topic === item.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary'}`}
          >
            {item.title}
          </button>
        ))}
      </div>

      {shown.map((group) => (
        <div key={group.id} className="mt-10">
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">{group.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
          <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {group.labs.map((lab) => (
              <li key={lab.slug}>
                <button
                  onClick={() => setOpenSlug(lab.slug)}
                  className="flex h-full w-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left transition-shadow hover:shadow-lg hover:shadow-primary/5"
                >
                  <FlaskConical size={18} className="text-primary" />
                  <span className="font-semibold leading-snug text-foreground">{lab.title}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{lab.purpose}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {COMING_SOON.map((item) => (
          <div key={item.title} className="rounded-2xl border border-dashed border-border p-5">
            <p className="font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
