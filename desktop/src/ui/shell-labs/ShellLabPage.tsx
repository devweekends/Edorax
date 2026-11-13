import { Fragment, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Lightbulb, Loader2, Play, RotateCcw, Square, XCircle } from 'lucide-react';
import type { ShellLabStatus, ShellLabView, ShellStepResult } from '../../domain/shell-labs';
import { LabTerminal } from '../labs/LabTerminal';
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

export function ShellLabPage({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [api] = useState(() => window.buildment.shellLabs);
  const [view, setView] = useState<ShellLabView | null>(null);
  const [status, setStatus] = useState<ShellLabStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [passed, setPassed] = useState<string[]>(() => passedSteps(slug));
  const [results, setResults] = useState<Record<string, ShellStepResult>>({});
  const [hints, setHints] = useState<Record<string, number>>({});
  const [terminal, setTerminal] = useState(0);

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
      .then(setView)
      .catch((reason: unknown) => setError(errorText(reason)));
    void refresh();
  }, [api, slug, refresh]);

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

  function markPassed(stepId: string, ok: boolean) {
    setPassed((current) => {
      const next = ok ? [...new Set([...current, stepId])] : current.filter((id) => id !== stepId);
      savePassedSteps(slug, next);
      return next;
    });
  }

  async function check(stepId: string) {
    await act(`check:${stepId}`, async () => {
      const result = await api.check(slug, stepId);
      setResults((current) => ({ ...current, [stepId]: result }));
      markPassed(stepId, result.passed);
    });
  }

  async function reset() {
    if (!window.confirm('Reset the lab? The machine is rebuilt from the start and your progress on this lab is cleared.')) return;
    await act('reset', async () => {
      await api.reset(slug);
      setResults({});
      setHints({});
      setPassed([]);
      savePassedSteps(slug, []);
      await api.start(slug);
      setTerminal((n) => n + 1);
    });
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

  const running = Boolean(status?.running);
  const current = view.stepList.find((step) => !passed.includes(step.id))?.id;
  const complete = view.stepList.every((step) => passed.includes(step.id));

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
          <ArrowLeft size={16} /> Shell labs
        </button>
        <h1 className="font-heading text-lg font-bold tracking-tight text-foreground">{view.title}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${running ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}
        >
          {status?.message ?? 'Checking Docker…'}
        </span>
        <span className="text-xs text-muted-foreground">
          {passed.length} of {view.steps} steps done
        </span>
        <div className="ml-auto flex gap-2">
          {running ? (
            <button
              disabled={Boolean(busy)}
              onClick={() => void act('stop', () => api.stop(slug))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary disabled:opacity-50"
            >
              <Square size={13} /> Stop
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
      </header>

      {error && (
        <p role="alert" className="border-b border-border bg-destructive/5 px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[400px] shrink-0 overflow-y-auto border-r border-border p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{view.scenario}</p>
          {complete && (
            <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Lab complete. Every check passes on {view.machine}.
            </p>
          )}
          <ol className="mt-5 space-y-4">
            {view.stepList.map((step, index) => {
              const done = passed.includes(step.id);
              const result = results[step.id];
              const shown = hints[step.id] ?? 0;
              return (
                <li
                  key={step.id}
                  className={`rounded-2xl border p-4 ${step.id === current ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                >
                  <div className="flex items-start gap-2">
                    {done ? (
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step {index + 1}</p>
                      <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                        <Inline text={step.goal} />
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <Inline text={step.body} />
                  </p>

                  {shown > 0 && (
                    <ul className="mt-3 space-y-2">
                      {step.hints.slice(0, shown).map((hint, level) => (
                        <li key={level} className="rounded-lg bg-muted/60 p-2.5 text-xs leading-relaxed text-foreground">
                          <span className="font-semibold">{HINT_LABELS[level]}: </span>
                          <Inline text={hint} />
                        </li>
                      ))}
                    </ul>
                  )}

                  {result && (
                    <ul className="mt-3 space-y-1.5">
                      {result.checks.map((item) => (
                        <li key={item.id} className="flex items-start gap-2 text-xs">
                          {item.passed ? (
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                          ) : (
                            <XCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
                          )}
                          <span>
                            <span className="font-medium text-foreground">{item.label}</span>
                            {!item.passed && <span className="block text-muted-foreground">{item.message}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={!running || Boolean(busy)}
                      onClick={() => void check(step.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {busy === `check:${step.id}` && <Loader2 size={13} className="animate-spin" />} Check
                    </button>
                    {shown < step.hints.length && (
                      <button
                        onClick={() => setHints((all) => ({ ...all, [step.id]: shown + 1 }))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary"
                      >
                        <Lightbulb size={13} /> {shown ? 'More help' : 'Hint'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {running ? (
            <div className="min-h-0 flex-1">
              <LabTerminal key={terminal} api={api} blockId={slug} label={`root@${view.machine}`} onError={onTerminalError} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="font-semibold text-foreground">{status?.available === false ? 'Docker is needed for shell labs' : `${view.machine} is not running`}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                {status?.available === false
                  ? status.message
                  : status?.created
                    ? 'Resume to continue where you left off. Your changes on the machine are kept.'
                    : 'Start creates the machine. The first start downloads a small Linux image, which can take a minute.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
