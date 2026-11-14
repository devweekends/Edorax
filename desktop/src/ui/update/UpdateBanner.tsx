import { useState } from 'react';
import { X } from 'lucide-react';
import type { AppUpdateState } from '../../domain/app-update';

const DISMISSED_KEY = 'edorax-update-dismissed';

function dismissedVersion(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '';
  } catch {
    return '';
  }
}

/** A small, dismissible notice for a newer version that is not required. A dismissal is remembered for that version only. */
export function UpdateBanner({ state, onDownload }: { state: AppUpdateState; onDownload: () => void }) {
  const [dismissed, setDismissed] = useState(dismissedVersion);
  if (state.status !== 'available' || !state.latestVersion || dismissed === state.latestVersion) return null;
  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, state.latestVersion);
    } catch {
      /* The notice is hidden for this session even if it cannot be remembered. */
    }
    setDismissed(state.latestVersion);
  }
  return (
    <div
      role="region"
      aria-label="Update available"
      className="flex shrink-0 items-center justify-center gap-3 border-b border-border bg-secondary px-4 py-2 text-sm"
    >
      <span>Version {state.latestVersion} is available.</span>
      {state.downloadUrl && (
        <button type="button" onClick={onDownload} className="font-medium text-primary underline underline-offset-2">
          Download
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss update notice"
        className="ml-2 rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
