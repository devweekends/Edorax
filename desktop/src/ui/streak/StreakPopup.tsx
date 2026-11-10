import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';

type PopupDay = { day: string; weekday: string; status: 'completed' | 'missed' | 'today'; seconds: number };
type PopupView = { show: boolean; streakCount: number; todayActive: boolean; today: string; week: PopupDay[]; seenOn: string | null };

export function StreakPopup() {
  const [view, setView] = useState<PopupView | null>(null);

  useEffect(() => {
    let alive = true;
    void window.buildment.remote.request('/api/v1/learner/streak-popup', 'GET').then((result) => {
      if (alive && result.ok) setView(result.data as PopupView);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!view?.show) return null;

  async function dismiss() {
    setView(null);
    await window.buildment.remote.request('/api/v1/learner/streak-popup/dismiss', 'POST');
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Daily streak" className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Flame size={28} />
        </span>
        <h2 className="font-heading mt-4 text-2xl font-bold">{view.streakCount}-day streak</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.todayActive ? 'You studied today. Nice work.' : 'Study today to keep your streak alive.'}
        </p>
        <div className="mt-6 flex justify-between gap-2">
          {view.week.map((day) => (
            <span
              key={day.day}
              aria-label={`${day.day}: ${day.status}`}
              className={`grid size-9 place-items-center rounded-full text-xs font-semibold ${
                day.status === 'completed'
                  ? 'bg-primary text-primary-foreground'
                  : day.status === 'today'
                    ? 'border-2 border-primary text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {day.weekday}
            </span>
          ))}
        </div>
        <button type="button" onClick={() => void dismiss()} className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          Keep going
        </button>
      </div>
    </div>
  );
}
