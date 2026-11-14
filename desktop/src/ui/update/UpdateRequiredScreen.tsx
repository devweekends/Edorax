import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import type { AppUpdateState } from '../../domain/app-update';
import { BrandMark } from '../auth/BrandMark';

/**
 * Covers the whole window when this version is below the minimum. It does not depend on sign-in,
 * it replaces the app (nothing behind it can be reached) and it cannot be closed.
 */
export function UpdateRequiredScreen({
  state,
  onCheck,
  onDownload,
}: {
  state: AppUpdateState;
  onCheck: () => Promise<AppUpdateState | null>;
  onDownload: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const target = state.latestVersion || state.minimumVersion;

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    // Focus may not leave this screen.
    const keep = (event: FocusEvent) => {
      if (dialog.current && event.target instanceof Node && !dialog.current.contains(event.target))
        dialog.current.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    };
    document.addEventListener('focusin', keep);
    return () => document.removeEventListener('focusin', keep);
  }, []);

  function keys(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    if (!buttons.length) {
      event.preventDefault();
      dialog.current?.focus();
      return;
    }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function checkAgain() {
    setBusy(true);
    setNote('');
    const next = await onCheck();
    setBusy(false);
    if (!next) setNote('Could not check for updates. Check your connection and try again.');
    else if (next.status === 'required')
      setNote(next.blocked ? 'This version still has a known problem.' : 'This version is still out of date.');
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-background px-5 text-foreground">
      <div
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-required-title"
        aria-describedby="update-required-text"
        tabIndex={-1}
        onKeyDown={keys}
        className="w-full max-w-xl outline-none"
      >
        <BrandMark className="size-12" />
        <h1 id="update-required-title" className="mt-6 font-display text-4xl font-semibold">
          Update required
        </h1>
        <div id="update-required-text">
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {state.blocked
              ? `This version (${state.currentVersion}) has a known problem.${target ? ` Install version ${target} to continue.` : ' Install the newest version to continue.'}`
              : `Your version of Edorax (${state.currentVersion}) is out of date.${target ? ` Install version ${target} to continue.` : ' Install the newest version to continue.'}`}
          </p>
          {state.message && <p className="mt-3 text-sm leading-6">{state.message}</p>}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDownload}
            disabled={!state.downloadUrl}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all active:scale-[0.99] disabled:opacity-50"
          >
            <Download size={16} />
            <span>Download the new version</span>
          </button>
          <button
            type="button"
            onClick={() => void checkAgain()}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium shadow-xs transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span>Check again</span>
          </button>
        </div>
        <p role="status" className="mt-4 min-h-5 text-sm text-muted-foreground">
          {note}
        </p>
      </div>
    </div>
  );
}
