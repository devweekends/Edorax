import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { ShellStartProgress } from '../../domain/shell-labs';

/** 83 seconds as "1:23". */
function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Shown in place of the terminal while a machine starts for the first time: the steps ahead,
 * the step in progress with its percent when it has one, and a timer so a slow step still looks alive.
 */
export function StartProgress({ machine, progress }: { machine: string; progress: ShellStartProgress | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const plan = progress?.plan ?? [];
  const known = typeof progress?.percent === 'number';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-white/80" role="status" aria-live="polite">
      <div className="text-center">
        <p className="font-semibold text-white">{`Getting ${machine} ready`}</p>
        <p className="mt-1 max-w-sm text-sm text-white/60">The first start downloads and builds the machine. After this it opens in seconds.</p>
      </div>
      {plan.length ? (
        <ol className="w-full max-w-sm space-y-3">
          {plan.map((label, index) => {
            const active = index === progress!.step;
            const done = index < progress!.step;
            return (
              <li key={label} className={active ? 'text-white' : done ? 'text-white/50' : 'text-white/35'}>
                <div className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      done ? 'bg-emerald-500/80 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-white/10'
                    }`}
                  >
                    {done ? <Check size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : index + 1}
                  </span>
                  <span className="flex-1">{label}</span>
                  {active && <span className="tabular-nums text-xs text-white/50">{clock(now - progress!.stepStartedAt)}</span>}
                </div>
                {active && (
                  <div className="ml-[30px] mt-2">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-white/10"
                      role="progressbar"
                      aria-label={label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={known ? progress!.percent : undefined}
                    >
                      {known ? (
                        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress!.percent}%` }} />
                      ) : (
                        <div className="h-full w-1/3 animate-[shell-slide_1.4s_ease-in-out_infinite] rounded-full bg-primary/80" />
                      )}
                    </div>
                    <p className="mt-1.5 flex justify-between gap-3 text-xs text-white/55">
                      <span className="truncate">{progress!.detail ?? 'Working…'}</span>
                      {known && <span className="tabular-nums">{progress!.percent}%</span>}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 size={14} className="animate-spin" /> Starting…
        </p>
      )}
    </div>
  );
}
