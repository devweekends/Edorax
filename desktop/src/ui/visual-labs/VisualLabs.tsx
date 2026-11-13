import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, FlaskConical, Route, Terminal } from 'lucide-react';
import { Lab } from '@buildment/learning-ui/labs/Lab';
import { visualLabGroups } from '../../domain/visual-labs';
import { guidedTrackViews } from '../../domain/guided-labs';
import { coursePrice, type Course } from '../../domain/catalog';

type Kind = 'all' | 'visual' | 'guided' | 'shell';

const VISUAL_STEPS = [
  { title: 'Build', body: 'Add parts from the list, link them and set their size. Switch between plain names and real AWS names at any time.' },
  { title: 'Choose what to break', body: 'Open a part and press Break it. That only arms the failure. Nothing changes until you run.' },
  { title: 'Press Run', body: 'The design plays through every scenario: normal traffic, the peak, and each failure.' },
  { title: 'Read the checks', body: 'Every test case passes or fails on the board, with the number it measured and why. Fix one thing and run again.' },
];

const GUIDED_STEPS = [
  { title: 'Read one step', body: 'A short goal and why it matters, then what to do. One thing changes at a time, so you can see what caused what.' },
  { title: 'Build it yourself', body: 'Write the code on your own computer, or in the editor and terminal built into this app. There is no answer to copy.' },
  { title: 'Tests check the result', body: 'Each lab ships with tests that run on your code and say what passes and what is still missing.' },
  { title: 'A quiz after every lab', body: 'A few questions check that you understood what you just built, not only that it runs.' },
  { title: 'The capstone is checked automatically', body: 'Push your project to your own GitHub repository. Our AI checker reads it against a list of criteria you can see, and tells you what to fix.' },
  { title: 'A certificate to share', body: 'When the capstone passes, you get a certificate for the level that you can add to your LinkedIn profile.' },
];

export function VisualLabs({
  courses,
  onOpenCourse,
  onOpenShellLabs,
}: {
  courses: Course[];
  onOpenCourse: (slug: string) => void;
  onOpenShellLabs?: () => void;
}) {
  const groups = useMemo(() => visualLabGroups(), []);
  const guided = useMemo(() => guidedTrackViews(courses.length ? courses : null, coursePrice), [courses]);
  const [kind, setKind] = useState<Kind>('all');
  const [topic, setTopic] = useState<string>('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (openSlug) {
    return (
      <section className="mx-auto w-full max-w-7xl p-6">
        <button
          onClick={() => setOpenSlug(null)}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft size={16} /> All labs
        </button>
        <Lab key={openSlug} slug={openSlug} />
      </section>
    );
  }

  const total = groups.reduce((sum, group) => sum + group.labs.length, 0);
  const showVisual = kind === 'all' || kind === 'visual';
  const shown = groups.filter((group) => topic === 'all' || group.id === topic);
  const kinds: { id: Kind; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'visual', label: 'Visual', count: total },
    { id: 'guided', label: 'Guided', count: guided.filter((t) => t.open).length },
    ...(onOpenShellLabs ? [{ id: 'shell' as const, label: 'Shell' }] : []),
  ];

  return (
    <section className="mx-auto w-full max-w-7xl p-8">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">Labs</p>
        <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-foreground">Build it, break it, see the result</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Reading tells you how a system should behave. A lab lets you find out. Pick a kind and a topic.
        </p>
      </header>

      <div className="mt-6 space-y-3">
        <Chips label="Kind" items={kinds} current={kind} onPick={(id) => setKind(id as Kind)} />
        {showVisual && (
          <Chips
            label="Topic"
            items={[{ id: 'all', label: 'All' }, ...groups.map((g) => ({ id: g.id, label: g.title, count: g.labs.length }))]}
            current={topic}
            onPick={setTopic}
          />
        )}
      </div>

      {showVisual &&
        shown.map((group) => (
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
                    {lab.challenge && <span className="mt-auto text-xs text-muted-foreground">{lab.checks} checks</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {(kind === 'all' || kind === 'guided') && (
        <div className="mt-12">
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">Guided labs</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The Dev Weekends tracks, one per level. Each is a course you enroll in, and its labs are the guided labs: a real project built step
            by step, with tests, a quiz after each lab and a capstone checked automatically.
          </p>
          <ul className="mt-5 space-y-4">
            {guided.map(({ track, open, title, length, price }) => (
              <li key={track.slug} className="grid gap-5 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1.6fr_1fr] md:gap-8">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">{track.level}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${open ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                    >
                      {open ? 'Open now' : 'Coming soon'}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm font-semibold text-foreground">{track.audience}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">You build: </span>
                    {track.build}
                  </p>
                </div>
                <div className="flex flex-col justify-between gap-5 border-t border-border pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                  <dl className="grid grid-cols-2 gap-4 md:grid-cols-1">
                    {length && <Fact label="Length">{length}</Fact>}
                    {price && <Fact label="Price">{price}</Fact>}
                  </dl>
                  {open ? (
                    <button
                      onClick={() => onOpenCourse(track.slug)}
                      aria-label={`Open ${title}`}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border-2 border-primary px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      Open <ArrowRight size={16} />
                    </button>
                  ) : (
                    <p className="text-sm text-muted-foreground">It opens here as soon as the course is published.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {kind === 'guided' && <HowItWorks title="How a guided lab works" steps={GUIDED_STEPS} icon={<Route size={18} />} open />}
        </div>
      )}

      {(kind === 'all' || kind === 'shell') && onOpenShellLabs && (
        <div className="mt-12">
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">Shell labs</h2>
          <button
            onClick={onOpenShellLabs}
            className="mt-5 flex w-full max-w-xl flex-col gap-1 rounded-2xl border border-primary/40 bg-primary/5 p-5 text-left transition-shadow hover:shadow-lg hover:shadow-primary/5"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-foreground">
              <Terminal size={16} className="text-primary" /> Fix real machines from the terminal
            </span>
            <span className="text-sm text-muted-foreground">A real Linux machine on your computer, with a goal, hints and checks. Needs Docker Desktop.</span>
          </button>
        </div>
      )}

      {kind === 'all' && <HowItWorks title="How a guided lab works" steps={GUIDED_STEPS} icon={<Route size={18} />} />}
      {showVisual && <HowItWorks title="How a visual lab works" steps={VISUAL_STEPS} icon={<FlaskConical size={18} />} />}
    </section>
  );
}

function Chips({
  label,
  items,
  current,
  onPick,
}: {
  label: string;
  items: { id: string; label: string; count?: number }[];
  current: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="w-12 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onPick(item.id)}
          aria-pressed={current === item.id}
          className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${current === item.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary'}`}
        >
          {item.label}
          {item.count !== undefined && <span className="ml-1.5 opacity-70">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function HowItWorks({
  title,
  steps,
  icon,
  open,
}: {
  title: string;
  steps: { title: string; body: string }[];
  icon: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="mt-10 border-t border-border pt-4" open={open}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="text-primary">{icon}</span> {title}
      </summary>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
