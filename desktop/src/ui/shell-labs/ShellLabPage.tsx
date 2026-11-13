import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Keyboard,
  Lightbulb,
  ListChecks,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Square,
  Target,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import type { ShellLabStatus, ShellLabView, ShellStartProgress, ShellStepResult } from '../../domain/shell-labs';
import { LabTerminal, type TerminalCommand } from '../labs/LabTerminal';
import { LabWorkspace, useLabLayout } from './LabWorkspace';
import { DockerSetup } from './DockerSetup';
import { StartProgress } from './StartProgress';
import { errorText, passedSteps, savePassedSteps } from './progress';

/** Plain text with `code` spans. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        index % 2 ? (
          <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const HINT_LABELS = ['Nudge', 'Hint', 'Worked example'];
/** How often the machine is checked while the lab is open and running. */
const LIVE_INTERVAL_MS = 3000;
const DONE = '__done';

type Step = ShellLabView['stepList'][number];

export function ShellLabPage({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [api] = useState(() => window.buildment.shellLabs);
  const [view, setView] = useState<ShellLabView | null>(null);
  const [status, setStatus] = useState<ShellLabStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [startProgress, setStartProgress] = useState<ShellStartProgress | null>(null);
  const [error, setError] = useState('');
  const [passed, setPassed] = useState<string[]>(() => passedSteps(slug));
  const [results, setResults] = useState<Record<string, ShellStepResult>>({});
  /** Steps whose failure reasons are shown: the learner pressed Check on them. */
  const [explained, setExplained] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');
  const [hints, setHints] = useState<Record<string, number>>({});
  const [terminal, setTerminal] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [typed, setTyped] = useState<TerminalCommand | null>(null);
  const [layout, setLayout] = useLabLayout();
  const polling = useRef(false);
  const stepTop = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status(slug));
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [api, slug]);

  useEffect(() => {
    api
      .view(slug)
      .then((loaded) => {
        setView(loaded);
        // Open on the first step not done yet, or the finish screen.
        const saved = passedSteps(slug);
        setViewing(loaded.stepList.find((step) => !saved.includes(step.id))?.id ?? DONE);
      })
      .catch((reason: unknown) => setError(errorText(reason)));
    void refresh();
  }, [api, slug, refresh]);

  useEffect(() => {
    // Older builds of the preload have no progress channel: the panel then shows a plain "Starting…".
    return api.onStartProgress?.((progress) => {
      if (progress.slug === slug) setStartProgress(progress);
    });
  }, [api, slug]);

  useEffect(() => {
    if (!busy) setStartProgress(null);
  }, [busy]);

  useEffect(() => {
    if (busy) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  async function act(name: string, work: () => Promise<unknown>) {
    setBusy(name);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  // A step stays done once it has passed. If the machine later breaks it, the step shows a warning.
  const markPassed = useCallback(
    (stepIds: string[]) => {
      setPassed((current) => {
        const fresh = stepIds.filter((id) => !current.includes(id));
        if (!fresh.length) return current;
        const next = [...current, ...fresh];
        savePassedSteps(slug, next);
        const numbers = fresh.map((id) => (view?.stepList.findIndex((step) => step.id === id) ?? -1) + 1).filter((n) => n > 0);
        if (numbers.length) setAnnouncement(`Step ${numbers.join(' and ')} done.`);
        return next;
      });
    },
    [slug, view],
  );

  const running = Boolean(status?.running);

  // Live checking: while the machine runs and the window is visible, check every step against it.
  useEffect(() => {
    if (!running || busy || !view) return;
    let stopped = false;
    async function poll() {
      if (polling.current || document.visibilityState !== 'visible') return;
      polling.current = true;
      try {
        const all = await api.checkAll(slug);
        if (stopped || !all) return;
        setResults(Object.fromEntries(all.map((result) => [result.stepId, result])));
        markPassed(all.filter((result) => result.passed).map((result) => result.stepId));
      } catch {
        /* A missed round is fine; the next one tries again. */
      } finally {
        polling.current = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), LIVE_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [api, slug, running, busy, view, markPassed]);

  async function check(stepId: string) {
    await act(`check:${stepId}`, async () => {
      const result = await api.check(slug, stepId);
      setResults((current) => ({ ...current, [stepId]: result }));
      setExplained((current) => ({ ...current, [stepId]: true }));
      if (result.passed) markPassed([stepId]);
    });
  }

  async function reset() {
    if (!window.confirm('Reset the lab? The machine is rebuilt from the start and your progress on this lab is cleared.')) return;
    await act('reset', async () => {
      await api.reset(slug);
      setResults({});
      setExplained({});
      setHints({});
      setPassed([]);
      savePassedSteps(slug, []);
      setViewing(view?.stepList[0]?.id ?? null);
      await api.start(slug);
      setTerminal((n) => n + 1);
    });
  }

  function go(stepId: string) {
    setViewing(stepId);
    stepTop.current?.scrollIntoView({ block: 'start' });
  }

  const onTerminalError = useCallback((message: string) => setError(errorText(message)), []);

  if (!view)
    return (
      <section className="p-8 text-sm text-muted-foreground">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          'Opening lab…'
        )}
      </section>
    );

  const steps = view.stepList;
  const complete = steps.every((step) => passed.includes(step.id));
  // A step opens once every step before it is done.
  const unlocked = (index: number) => steps.slice(0, index).every((step) => passed.includes(step.id));
  const shownIndex = steps.findIndex((step) => step.id === viewing);
  const shown = viewing === DONE && complete ? null : steps[shownIndex >= 0 && unlocked(shownIndex) ? shownIndex : Math.max(0, steps.findIndex((step) => !passed.includes(step.id)))];
  const progress = Math.round((passed.filter((id) => steps.some((step) => step.id === id)).length / steps.length) * 100);

  const stepPanel = (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-5">
      <div ref={stepTop} />
      <Stepper steps={steps} passed={passed} current={shown?.id ?? DONE} complete={complete} unlocked={unlocked} onSelect={go} />

      {shown ? (
        <StepView
          key={shown.id}
          step={shown}
          index={steps.indexOf(shown)}
          total={steps.length}
          scenario={view.scenario}
          character={view.character}
          done={passed.includes(shown.id)}
          result={results[shown.id]}
          explained={Boolean(explained[shown.id])}
          hintsShown={hints[shown.id] ?? 0}
          running={running}
          busy={busy}
          onCheck={() => void check(shown.id)}
          onHint={() => setHints((all) => ({ ...all, [shown.id]: (all[shown.id] ?? 0) + 1 }))}
          onType={(text) => setTyped({ text, nonce: Date.now(), submit: false })}
          onPrevious={steps.indexOf(shown) > 0 ? () => go(steps[steps.indexOf(shown) - 1].id) : undefined}
          onNext={() => go(steps[steps.indexOf(shown) + 1]?.id ?? DONE)}
        />
      ) : (
        <Finished view={view} onBack={onBack} onReview={() => go(steps[0].id)} />
      )}
    </div>
  );

  const terminalPane = running ? (
    <LabTerminal key={terminal} api={api} blockId={slug} onError={onTerminalError} runCommand={typed} onSent={() => setTyped(null)} />
  ) : status?.available === false ? (
    <div className="flex h-full items-center justify-center">
      <DockerSetup api={api} onReady={() => void refresh()} />
    </div>
  ) : busy === 'start' || busy === 'reset' ? (
    <StartProgress machine={view.machine} progress={startProgress} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white/80">
      <p className="font-semibold text-white">{`${view.machine} is not running`}</p>
      <p className="max-w-sm text-sm text-white/60">
        {status?.created
          ? 'Resume to continue where you left off. Your changes on the machine are kept.'
          : 'Start creates the machine. The first start downloads and prepares it, which can take a minute or two.'}
      </p>
      {(
        <button
          disabled={Boolean(busy)}
          onClick={() => void act('start', () => api.start(slug))}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === 'start' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {status?.created ? 'Resume machine' : 'Start machine'}
        </button>
      )}
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
            <ArrowLeft size={16} /> Shell labs
          </button>
          <h1 className="font-heading text-lg font-bold tracking-tight text-foreground">{view.title}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${running ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}
          >
            {status?.message ?? 'Checking Docker…'}
          </span>
          {running && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Every step is checked against the machine every few seconds">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live checking
            </span>
          )}
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
          <div className="ml-auto flex gap-2">
            {running ? (
              <button
                disabled={Boolean(busy)}
                onClick={() => void act('stop', () => api.stop(slug))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary disabled:opacity-50"
              >
                {busy === 'stop' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Stop
              </button>
            ) : (
              <button
                disabled={Boolean(busy) || status?.available === false}
                onClick={() => void act('start', () => api.start(slug))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {status?.created ? 'Resume' : 'Start'}
              </button>
            )}
            <button
              disabled={Boolean(busy) || status?.available === false}
              onClick={() => void reset()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary disabled:opacity-50"
            >
              {busy === 'reset' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reset
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-3" aria-label={`${progress}% of the lab done`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {passed.filter((id) => steps.some((step) => step.id === id)).length} of {steps.length} steps
          </span>
        </div>
      </header>

      {error && (
        <p role="alert" className="border-b border-border bg-destructive/5 px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <LabWorkspace
        steps={stepPanel}
        terminal={terminalPane}
        terminalTitle={`root@${view.machine}`}
        onReconnect={running ? () => setTerminal((n) => n + 1) : undefined}
        layout={layout}
        setLayout={setLayout}
      />
    </section>
  );
}

function Stepper({
  steps,
  passed,
  current,
  complete,
  unlocked,
  onSelect,
}: {
  steps: Step[];
  passed: string[];
  current: string;
  complete: boolean;
  unlocked: (index: number) => boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Lab steps" className="mb-6">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const done = passed.includes(step.id);
          const open = unlocked(index);
          const here = step.id === current;
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!open}
                onClick={() => onSelect(step.id)}
                aria-current={here ? 'step' : undefined}
                aria-label={`Step ${index + 1}${done ? ', done' : open ? '' : ', locked'}: ${step.goal}`}
                title={open ? step.goal : 'Finish the steps before this one first'}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  here
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : done
                      ? 'bg-emerald-500 text-white hover:ring-4 hover:ring-emerald-500/20'
                      : open
                        ? 'border-2 border-primary text-primary'
                        : 'border border-border text-muted-foreground'
                }`}
              >
                {done && !here ? <Check size={15} strokeWidth={3} /> : open ? index + 1 : <Lock size={12} />}
              </button>
              {index < steps.length - 1 && <span className={`mx-1.5 h-0.5 flex-1 rounded-full ${done ? 'bg-emerald-500' : 'bg-border'}`} />}
            </li>
          );
        })}
        <li className="ml-1.5 flex items-center">
          <span className={`mr-1.5 h-0.5 w-6 rounded-full ${complete ? 'bg-emerald-500' : 'bg-border'}`} />
          <button
            type="button"
            disabled={!complete}
            onClick={() => onSelect(DONE)}
            aria-label={complete ? 'Lab summary' : 'Lab summary, locked until every step is done'}
            className={`flex size-8 items-center justify-center rounded-full ${current === DONE ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : complete ? 'bg-amber-400 text-amber-950' : 'border border-border text-muted-foreground'}`}
          >
            <Trophy size={14} />
          </button>
        </li>
      </ol>
    </nav>
  );
}

/** Teaching that sits behind the mission: open on the first step, closed after, always one click away. */
function Fold({ icon, title, hint, open, children }: { icon: ReactNode; title: string; hint?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group mt-4 rounded-2xl border border-border bg-card/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
        {hint && <span className="hidden font-normal text-muted-foreground sm:inline">· {hint}</span>}
        <span className="ml-auto text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {icon} {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function StepView({
  step,
  index,
  total,
  scenario,
  character,
  done,
  result,
  explained,
  hintsShown,
  running,
  busy,
  onCheck,
  onHint,
  onType,
  onPrevious,
  onNext,
}: {
  step: Step;
  index: number;
  total: number;
  scenario: string;
  character?: ShellLabView['character'];
  done: boolean;
  result?: ShellStepResult;
  explained: boolean;
  hintsShown: number;
  running: boolean;
  busy: string | null;
  onCheck: () => void;
  onHint: () => void;
  onType: (text: string) => void;
  onPrevious?: () => void;
  onNext: () => void;
}) {
  const last = index === total - 1;
  return (
    <article aria-labelledby={`goal-${step.id}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        Mission {index + 1} of {total}
      </p>
      <h2 id={`goal-${step.id}`} className="font-heading mt-1.5 text-2xl font-bold leading-snug tracking-tight text-foreground">
        <Inline text={step.goal} />
      </h2>

      {(index === 0 || step.story) && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-label={index === 0 ? 'Your briefing' : 'Message'}>
          {index === 0 && (
            <div className="border-b border-border bg-gradient-to-br from-primary/10 via-card to-card px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Your briefing</p>
              <p className="mt-1.5 text-[16px] leading-relaxed text-foreground">
                <Inline text={scenario} />
              </p>
            </div>
          )}
          {step.story && (
            <div className="flex items-start gap-3 px-5 py-4" aria-label={character ? `Message from ${character.name}` : 'Message'}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
                {(character?.name ?? '?').slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1 text-[16px] leading-relaxed text-foreground">
                {character && (
                  <p className="mb-0.5 text-xs font-semibold text-muted-foreground">
                    {character.name} <span className="font-normal">· {character.role}</span>
                  </p>
                )}
                <Inline text={step.story} />
              </div>
            </div>
          )}
        </section>
      )}

      {done && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">{step.win ?? 'Step done. The machine does what this step asked.'}</p>
            {step.after && (
              <div className="mt-2 text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
                <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  <Sparkles size={12} /> What just happened
                </p>
                <Inline text={step.after} />
              </div>
            )}
            {result && !result.passed && (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                It passed earlier, but something you changed since then undid part of it. See the checks below.
              </p>
            )}
          </div>
          <button onClick={onNext} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            {last ? 'Finish lab' : 'Next step'} <ArrowRight size={15} />
          </button>
        </div>
      )}


      <section className="mt-5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.04]" aria-label="Your mission">
        <div className="border-b border-primary/15 bg-primary/[0.06] px-5 py-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Target size={13} /> Your mission
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-[16px] leading-relaxed text-foreground">
            <Inline text={step.body} />
          </p>
          <div>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ListChecks size={13} /> Done when
            </p>
            <ul className="space-y-2" aria-label="Checks">
          {step.checks.map((item) => {
            const live = result?.checks.find((check) => check.id === item.id);
            const passing = Boolean(live?.passed);
            // Not passing yet is neutral while you work; reasons show once you ask, or when a done step breaks.
            const reason = live && !passing && (explained || done);
            return (
              <li key={item.id} className="flex items-start gap-2.5 text-sm">
                {passing ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" aria-label="Passing" />
                ) : reason ? (
                  <XCircle size={17} className="mt-0.5 shrink-0 text-destructive" aria-label="Failing" />
                ) : (
                  <Circle size={17} className="mt-0.5 shrink-0 text-muted-foreground/60" aria-label="Not yet" />
                )}
                <span>
                  <span className={passing || reason ? 'font-medium text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                  {reason && <span className="block text-muted-foreground">{live?.message}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {result?.mistake && !result.passed && (explained || done) && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed text-foreground">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              <span className="font-semibold">It looks like this: </span>
              <Inline text={result.mistake} />
            </span>
          </div>
        )}
            {!running && <p className="mt-2 text-xs text-muted-foreground">Start the machine and these tick themselves as you work.</p>}
          </div>
        </div>
      </section>

      <Fold icon={<BookOpen size={13} />} title="Learn first" hint="The idea behind this step" open={index === 0 && !done}>
        <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
          {step.learn.map((paragraph, n) => (
            <p key={n}>
              <Inline text={paragraph} />
            </p>
          ))}
        </div>
      </Fold>
      {step.commands.length > 0 && (
        <Fold icon={<Keyboard size={13} />} title="Commands you will use" hint="General forms. Words in CAPITALS are placeholders." open={index === 0 && !done}>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {step.commands.map((note) => (
              <li key={note.command} className="flex items-start gap-3 bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <code className="block break-words font-mono text-sm font-semibold text-foreground">{note.command}</code>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <Inline text={note.meaning} />
                  </p>
                  {note.example && (
                    <details className="mt-1.5 text-sm">
                      <summary className="cursor-pointer text-xs font-semibold text-primary">See an example</summary>
                      <pre className="mt-1.5 overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100">
                        <span className="text-emerald-400">$ </span>
                        {note.example}
                        {note.output ? `\n${note.output}` : ''}
                      </pre>
                    </details>
                  )}
                </div>
                {note.key ? (
                  <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" title="Used inside a program or a file, not typed at the prompt">
                    Key
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!running}
                    onClick={() => onType(note.command)}
                    title={running ? 'Type this into the terminal. Edit the CAPITAL words, then press Enter.' : 'Start the machine first'}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
                  >
                    Type it
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Words in CAPITALS are placeholders: replace them with your own values.</p>
        </Fold>
      )}

      {hintsShown > 0 && (
        <Section icon={<Lightbulb size={13} />} title="Hints">
          <ul className="space-y-2">
            {step.hints.slice(0, hintsShown).map((hint, level) => (
              <li key={level} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm leading-relaxed text-foreground">
                <span className="font-semibold">{HINT_LABELS[level]}: </span>
                <Inline text={hint} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {onPrevious && (
          <button onClick={onPrevious} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15} /> Previous
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {hintsShown < step.hints.length && (
            <button onClick={onHint} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary">
              <Lightbulb size={15} /> {hintsShown ? 'More help' : 'Show a hint'}
            </button>
          )}
          {done ? (
            <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {last ? 'Finish lab' : 'Next step'} <ArrowRight size={15} />
            </button>
          ) : (
            <button
              disabled={!running || Boolean(busy)}
              onClick={onCheck}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === `check:${step.id}` && <Loader2 size={15} className="animate-spin" />} Why not yet?
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Finished({ view, onBack, onReview }: { view: ShellLabView; onBack: () => void; onReview: () => void }) {
  return (
    <article className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-400/20">
        <Trophy size={30} className="text-amber-500" />
      </div>
      <h2 className="font-heading mt-4 text-2xl font-bold tracking-tight text-foreground">Lab complete</h2>
      {view.badge && (
        <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <Sparkles size={14} /> Badge earned: {view.badge}
        </p>
      )}
      {view.outro && (
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-foreground">
          <Inline text={view.outro} />
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">Every check passes on {view.machine}. Here is what you did:</p>
      <ol className="mx-auto mt-6 max-w-xl space-y-2 text-left">
        {view.stepList.map((step, index) => (
          <li key={step.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={13} strokeWidth={3} />
            </span>
            <span>
              <span className="text-xs font-semibold text-muted-foreground">Step {index + 1}</span>
              <span className="block text-foreground">
                <Inline text={step.goal} />
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mx-auto mt-6 max-w-xl text-left">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Commands you can use now</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...new Set(view.stepList.flatMap((step) => step.commands.map((note) => note.command.split(' ')[0])))].map((name) => (
            <code key={name} className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
              {name}
            </code>
          ))}
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <button onClick={onReview} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-primary">
          Review the steps
        </button>
        <button onClick={onBack} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Choose another lab
        </button>
      </div>
    </article>
  );
}
