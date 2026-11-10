import type { ReactNode } from 'react';

const BLOCK = 'rounded-md bg-muted motion-safe:animate-pulse';
const PAGE = 'mx-auto w-full max-w-7xl px-8 py-8';

/** A grey placeholder block. Pulses unless the system asks for reduced motion. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`${BLOCK} ${className}`} />;
}

/** Wraps placeholder blocks so screen readers announce the loading state once. */
function Busy({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <Busy label="Loading your learning" className={PAGE}>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 h-44 w-full rounded-2xl" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-72 rounded-2xl" />
        <div className="space-y-6">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-40 rounded-2xl" />
        ))}
      </div>
    </Busy>
  );
}

export function MyLearningSkeleton() {
  return (
    <Busy label="Loading your courses" className={PAGE}>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-11 w-96 max-w-full rounded-xl" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-72 rounded-2xl" />
        ))}
      </div>
    </Busy>
  );
}

export function ProgressSkeleton() {
  return (
    <Busy label="Loading your progress" className={PAGE}>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-12 h-64 rounded-2xl" />
      <div className="mt-12 space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    </Busy>
  );
}

export function LeaderboardSkeleton() {
  return (
    <Busy label="Loading leaderboard" className="mx-auto w-full max-w-6xl px-8 py-8">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((key) => (
            <Skeleton key={key} className="h-16 rounded-xl" />
          ))}
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </Busy>
  );
}

/** A stack of list rows, for notifications, questions and board standings. */
export function ListSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <Busy label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, key) => (
        <Skeleton key={key} className="h-20 rounded-2xl" />
      ))}
    </Busy>
  );
}

/** Placeholder for a settings-style form: labelled fields and a save button. */
export function FormSkeleton() {
  return (
    <Busy label="Loading settings" className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="flex justify-end">
        <Skeleton className="h-10 w-32" />
      </div>
    </Busy>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Busy label="Loading" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, key) => (
        <Skeleton key={key} className="h-72 rounded-2xl" />
      ))}
    </Busy>
  );
}
