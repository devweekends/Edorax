import { useEffect, useState } from 'react';

/**
 * Shows a message from the quiz hook for a few seconds and then hides it. Without this a notice such
 * as "Copying is blocked" stayed on screen until the page was left. The same text appearing again
 * after it cleared shows again.
 */
export function useTransientNotice<T extends { text: string }>(
  notice: T | null | undefined,
  ms = 4_000,
): T | null {
  const [visible, setVisible] = useState<T | null>(null);
  const text = notice?.text ?? null;
  useEffect(() => {
    if (!notice) {
      setVisible(null);
      return;
    }
    setVisible(notice);
    const timer = window.setTimeout(() => setVisible(null), ms);
    return () => window.clearTimeout(timer);
    // Keyed by the text, so a notice object rebuilt on every render cannot keep the timer restarting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ms]);
  return visible;
}
