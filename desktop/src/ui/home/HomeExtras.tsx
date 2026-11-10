import { useState, type FormEvent } from 'react';
import { Flame, Target } from 'lucide-react';
import { Dot } from '@buildment/learning-ui/brand-dot';
import type { HomeSummary } from '../../domain/home';
import { DOT_TIPS, dotTipIndex } from '../../domain/dot';

type Goal = NonNullable<HomeSummary['goal']>;

const KIND_LABEL: Record<Goal['kind'], string> = { SESSIONS: 'sessions', CHAPTERS: 'chapters', MINUTES: 'minutes' };
const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const BUTTON = 'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';
const GHOST = 'text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50';

export function GoalCard({ goal, onChanged }: { goal: Goal | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState<'WEEKLY' | 'DAILY'>('WEEKLY');
  const [kind, setKind] = useState<Goal['kind']>('CHAPTERS');
  const [target, setTarget] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(target) || target < 1) {
      setError('Enter a whole number of 1 or more.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.buildment.remote.request('/api/v1/learner/weekly-goal', 'PUT', { period, kind, target });
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      onChanged();
    } else {
      setError(result.message);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    const result = await window.buildment.remote.request('/api/v1/learner/weekly-goal', 'DELETE');
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.message);
  }

  const percent = goal ? Math.min(100, Math.round((goal.progress / Math.max(goal.target, 1)) * 100)) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading flex items-center gap-2 text-base font-bold">
          <Target size={16} className="text-primary" /> Study goal
        </h3>
        {goal && !editing && (
          <button type="button" onClick={() => void clear()} disabled={busy} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Remove
          </button>
        )}
      </div>

      {goal && !editing ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {goal.period === 'DAILY' ? 'Today' : 'This week'}: {goal.progress} of {goal.target} {KIND_LABEL[goal.kind]}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Goal progress" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <button type="button" onClick={() => setEditing(true)} className={`${GHOST} mt-4`}>Change goal</button>
        </div>
      ) : editing || !goal ? (
        editing ? (
          <form onSubmit={save} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm font-medium">
                Period
                <select value={period} onChange={(e) => setPeriod(e.target.value as 'WEEKLY' | 'DAILY')} className={FIELD}>
                  <option value="WEEKLY">Weekly</option>
                  <option value="DAILY">Daily</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                Measure
                <select value={kind} onChange={(e) => setKind(e.target.value as Goal['kind'])} className={FIELD}>
                  <option value="CHAPTERS">Chapters</option>
                  <option value="SESSIONS">Sessions</option>
                  <option value="MINUTES">Minutes</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              Target
              <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value))} className={FIELD} />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={busy} className={BUTTON}>Save goal</button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">Set a target so Home can track your week.</p>
            <button type="button" onClick={() => setEditing(true)} className={`${BUTTON} mt-4 w-full`}>Set a study goal</button>
          </div>
        )
      ) : null}
      {!editing && error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function DotTip() {
  const tip = DOT_TIPS[dotTipIndex()] ?? DOT_TIPS[0];
  return (
    <section aria-label="Dot's tip" className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
      <Dot mood="happy" size={56} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-muted-foreground">Dot&apos;s tip</p>
        <p className="mt-1 text-sm leading-6 text-foreground">{tip}</p>
      </div>
    </section>
  );
}

export function MilestoneCard({ days, onAcknowledged, onSeeRank }: { days: number; onAcknowledged: () => void; onSeeRank: () => void }) {
  const [busy, setBusy] = useState(false);

  async function celebrate() {
    setBusy(true);
    await window.buildment.remote.request(`/api/v1/learner/streak-milestones/${days}/acknowledge`, 'POST');
    setBusy(false);
    onAcknowledged();
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-4">
        <Dot mood="cheer" size={56} />
        <div>
          <p className="font-heading flex items-center gap-2 text-lg font-bold">
            <Flame size={18} className="text-primary" /> {days}-day streak!
          </p>
          <p className="text-sm text-muted-foreground">You studied {days} days in a row. Keep it going.</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onSeeRank} className="text-sm font-medium text-primary underline-offset-4 hover:underline">See the leaderboard</button>
        <button type="button" onClick={() => void celebrate()} disabled={busy} className={BUTTON}>Celebrate</button>
      </div>
    </section>
  );
}
