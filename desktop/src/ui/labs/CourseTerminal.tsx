import { useCallback, useEffect, useState } from 'react';
import { LabTerminal, type TerminalCommand } from './LabTerminal';

export function CourseTerminal({
  courseSlug,
  active,
  command,
  onCommandDone,
}: {
  courseSlug: string;
  active: boolean;
  command?: TerminalCommand | null;
  onCommandDone?: () => void;
}) {
  const api = window.buildment.labs;
  const [session, setSession] = useState<{
    blockId: string;
    folder: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const report = useCallback((error: unknown) => {
    setError(
      String(error)
        .replace(
          /^(Error: )?Error invoking remote method '[^']+': (Error: )?/,
          '',
        )
        .replace(/^Error: /, ''),
    );
    setSession(null);
  }, []);

  // Local sessions need no course sign-in or IDE backend. Hiding the panel preserves the PTY.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setBusy(true);
    void api
      .prepareTerminal(courseSlug)
      .then((value) => {
        if (alive) {
          setSession(value);
          setError('');
        }
      })
      .catch((error) => {
        if (alive) report(error);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [api, active, courseSlug, report]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      setSession(await api.prepareTerminal(courseSlug));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Course terminal"
      className="flex h-full min-h-0 flex-col"
    >
      {error && (
        <p role="alert" className="px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {session ? (
        <div className="min-h-0 flex-1">
          <LabTerminal
            key={`${session.blockId}:${session.folder}`}
            blockId={session.blockId}
            onError={report}
            runCommand={command}
            onSent={onCommandDone}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <button
            disabled={busy}
            onClick={() => void start()}
            className="rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy
              ? 'Starting terminal…'
              : error
                ? 'Retry terminal'
                : 'Start terminal'}
          </button>
        </div>
      )}
    </section>
  );
}
