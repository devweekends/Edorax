import { useEffect } from 'react';
import { TypingWatch } from './typing-watch';

function lengthOf(target: EventTarget | null): number {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    return target.value.length;
  if (target instanceof HTMLElement && target.isContentEditable)
    return target.textContent?.length ?? 0;
  return 0;
}

/** Watches how text arrives in the exam's answer boxes and reports big chunks or impossible speeds. */
export function useTypingMonitor(enabled: boolean, blockId: string | null) {
  useEffect(() => {
    if (!enabled) return;
    const watch = new TypingWatch();
    const before = new WeakMap<EventTarget, number>();
    const onBefore = (event: Event) => {
      if (event.target) before.set(event.target, lengthOf(event.target));
    };
    const onInput = (event: Event) => {
      const target = event.target;
      if (!target) return;
      const delta = lengthOf(target) - (before.get(target) ?? lengthOf(target));
      // Code editors keep their text elsewhere, so also trust the event's own data.
      const chars = Math.max(delta, (event as InputEvent).data?.length ?? 0);
      const finding = watch.feed(chars, Date.now());
      if (finding)
        void window.buildment.secure.report(
          'TYPING_BURST',
          { reason: finding.reason, chars: finding.chars, ms: finding.ms },
          blockId,
        );
    };
    document.addEventListener('beforeinput', onBefore, true);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('beforeinput', onBefore, true);
      document.removeEventListener('input', onInput, true);
    };
  }, [enabled, blockId]);
}
