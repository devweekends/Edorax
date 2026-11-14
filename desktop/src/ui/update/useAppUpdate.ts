import { useCallback, useEffect, useState } from 'react';
import { isAppUpdateState, type AppUpdateState } from '../../domain/app-update';

/** How long the app waits for the first status before it opens anyway. */
const FIRST_STATUS_WAIT_MS = 1500;

function api() {
  return typeof window === 'undefined' ? undefined : window.buildment?.update;
}

/** The update status from the main process. Anything unexpected counts as "no update news", never as a lock. */
export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const accept = (value: unknown) => {
      if (active && isAppUpdateState(value)) setState(value);
    };
    const timer = setTimeout(() => active && setLoaded(true), FIRST_STATUS_WAIT_MS);
    let stop: unknown;
    try {
      void Promise.resolve(api()?.status())
        .then(accept)
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoaded(true);
        });
      stop = api()?.onChange?.(accept);
    } catch {
      setLoaded(true);
    }
    return () => {
      active = false;
      clearTimeout(timer);
      if (typeof stop === 'function') stop();
    };
  }, []);

  const check = useCallback(async () => {
    try {
      const next: unknown = await api()?.check();
      if (isAppUpdateState(next)) {
        setState(next);
        return next;
      }
    } catch {
      /* A failed check keeps the status as it is. */
    }
    return null;
  }, []);

  const openDownload = useCallback(async () => {
    try {
      await api()?.openDownload();
    } catch {
      /* Nothing else to do: the button stays available. */
    }
  }, []);

  return { state, loaded, check, openDownload };
}
