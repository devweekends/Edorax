import { BookOpen } from 'lucide-react';

export function LessonLoading() {
  return (
    <div
      role="status"
      aria-label="Loading lesson"
      className="grid min-h-[calc(100vh-72px)] grid-cols-[260px_minmax(0,1fr)] items-start xl:grid-cols-[300px_minmax(0,1fr)]"
    >
      <div
        aria-hidden="true"
        className="h-full border-r border-border bg-sidebar p-5"
      >
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold">
          <BookOpen size={17} />
          Course curriculum
        </div>
        <div className="space-y-7 motion-safe:animate-pulse">
          {[0, 1, 2].map((group) => (
            <div key={group} className="space-y-4 border-t border-border pt-5">
              <div className="h-3 w-3/4 rounded bg-muted" />
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 ${group === 0 && row === 0 ? 'border-l-2 border-primary/40 bg-primary/5' : ''}`}
                >
                  <div className="size-3 shrink-0 rounded-full border border-border" />
                  <div
                    className={`h-2 rounded bg-muted ${row === 1 ? 'w-2/3' : 'w-full'}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto w-full min-w-0 max-w-[860px] px-7 py-10 lg:px-12 lg:py-14">
        <div className="mb-8 flex items-center gap-2.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
          />
          Loading your lesson…
        </div>
        <div aria-hidden="true" className="space-y-9 motion-safe:animate-pulse">
          <div className="space-y-3">
            <div className="h-8 w-4/5 rounded-lg bg-muted lg:h-10" />
            <div className="h-8 w-1/2 rounded-lg bg-muted lg:h-10" />
          </div>
          <div className="space-y-3.5">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-5 h-3 w-1/3 rounded bg-muted" />
            <div className="space-y-3">
              <div className="h-2.5 w-5/6 rounded bg-muted" />
              <div className="h-2.5 w-2/3 rounded bg-muted" />
              <div className="h-2.5 w-3/4 rounded bg-muted" />
            </div>
          </div>
          <div className="space-y-3.5">
            <div className="mb-5 h-5 w-1/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
