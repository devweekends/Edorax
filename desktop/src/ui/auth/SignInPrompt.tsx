import { Sprout, Loader2, ArrowRight } from 'lucide-react';

export function SignInPrompt({
  busy,
  onSignIn,
  firstScreen = false,
}: {
  busy: boolean;
  onSignIn: () => void;
  firstScreen?: boolean;
}) {
  return (
    <section
      aria-labelledby="ready-title"
      className="mt-8 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-secondary/60 p-6 shadow-sm"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs">
        <Sprout size={24} />
      </span>
      <div className="min-w-48 flex-1">
        <h2 id="ready-title" className="text-lg font-semibold tracking-tight">
          Ready to start learning?
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {firstScreen
            ? 'Continue in your browser. After signing in, come back to your desktop courses.'
            : 'Explore the full outline below. Sign in when you’re ready to enroll.'}
        </p>
      </div>
      <button
        disabled={busy}
        onClick={onSignIn}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all active:scale-[0.99] disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Connecting…</span>
          </>
        ) : (
          <>
            <span>Sign in with browser</span>
            <ArrowRight size={15} />
          </>
        )}
      </button>
    </section>
  );
}
