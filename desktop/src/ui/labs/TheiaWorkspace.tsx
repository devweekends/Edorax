import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderPlus, Code2 } from 'lucide-react';
import type { IDESession } from '../../domain/ide';
export type LessonSnippetRequest = {
  id: number;
  source: string;
  filename: string;
};

// Module-level ref so CourseIDE can call focusTheiaHost() without going through contextBridge
let _theiaHost: HTMLDivElement | null = null;
export function focusTheiaHost() {
  _theiaHost?.focus();
}

export function TheiaWorkspace({
  active,
  courseSlug,
  snippet,
  request,
  onRequestHandled,
}: {
  active: boolean;
  courseSlug: string;
  focused?: boolean;
  snippet: LessonSnippetRequest | null;
  request?: { create: boolean; nonce: number } | null;
  onRequestHandled?: () => void;
}) {
  const api = window.buildment.ide!;
  const host = useRef<HTMLDivElement>(null);

  // Keep the module-level ref in sync with the DOM ref
  useEffect(() => {
    _theiaHost = host.current;
    return () => {
      _theiaHost = null;
    };
  }, []);
  const imported = useRef<number | null>(null);
  const handledRequest = useRef<number | null>(null);
  const [session, setSession] = useState<IDESession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const report = (error: unknown) =>
    setError(
      (error instanceof Error ? error.message : String(error)).replace(
        /^(Error: )?Error invoking remote method '[^']+': (Error: )?/,
        '',
      ),
    );

  useEffect(() => {
    if (!active) return;
    // A toolbar open/new request drives the launch instead of the resume.
    if (request && handledRequest.current !== request.nonce) return;
    let alive = true;
    setBusy(true);
    setError('');
    void api
      .resume(courseSlug)
      .then((value) => {
        if (alive) setSession(value);
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
  }, [api, courseSlug, active, request]);

  useEffect(() => {
    return () => {
      void api.bounds(null, courseSlug);
    };
  }, [api, courseSlug]);

  useEffect(() => {
    // Layout shifts (the lesson header settling, Full screen, Hide IDE) do not fire resize or scroll,
    // so check the host's position every frame and send it only when it changes.
    let frame = 0;
    let last = '';
    const send = () => {
      const rect = host.current?.getBoundingClientRect();
      const shown = !!host.current?.getClientRects().length;
      const next =
        !active || busy || !session || !rect || !shown
          ? null
          : {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
      const key = next
        ? `${next.x},${next.y},${next.width},${next.height},${window.devicePixelRatio}`
        : '';
      if (key === last) return;
      last = key;
      void api.bounds(next, courseSlug).catch(report);
    };
    const tick = () => {
      try {
        send();
      } finally {
        // Keep checking even if one update fails, so the IDE never stops following the page.
        frame = window.requestAnimationFrame(tick);
      }
    };
    tick();
    return () => window.cancelAnimationFrame(frame);
  }, [api, courseSlug, active, session, busy]);

  // Hide the IDE view as soon as the IDE closes, independent of the position loop.
  useEffect(() => {
    if (!active) void api.bounds(null, courseSlug).catch(report);
  }, [api, courseSlug, active]);

  useEffect(() => {
    if (
      !active ||
      !session ||
      busy ||
      !snippet ||
      imported.current === snippet.id
    )
      return;
    imported.current = snippet.id;
    setError('');
    void api
      .importSnippet(snippet.source, snippet.filename, courseSlug)
      .catch(report);
  }, [api, courseSlug, active, session, snippet, busy]);

  async function open(create: boolean) {
    if (
      session &&
      !window.confirm(
        'Switch projects? Save any unsaved files in the IDE first.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const next = await api.open(create, courseSlug);
      if (next) {
        setSession(next);
        imported.current = null;
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!request || handledRequest.current === request.nonce || !active || busy)
      return;
    handledRequest.current = request.nonce;
    void openRef.current(request.create).finally(() => onRequestHandled?.());
  }, [request, active, busy, onRequestHandled]);

  return (
    <section
      aria-label="Project IDE"
      className="flex h-full min-h-[400px] min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {(error || busy) && (
        <p
          role={error ? 'alert' : 'status'}
          className="shrink-0 border-b border-border px-3 py-2 text-xs"
        >
          {error || 'Opening course workspace…'}
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1" tabIndex={-1}>
        {!session && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
              <Code2 size={24} className="text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold tracking-tight">
                Open your workspace
              </h3>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Create a new project or select an existing folder on your
                computer to launch the full IDE.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                disabled={busy}
                onClick={() => void open(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <FolderPlus size={16} />
                Create a new project
              </button>
              <button
                disabled={busy}
                onClick={() => void open(false)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <FolderOpen size={16} />
                Select folder
              </button>
            </div>
            {snippet && (
              <p className="text-xs text-muted-foreground">
                Your lesson snippet will open automatically once you select a
                folder.
              </p>
            )}
            {(error || busy) && (
              <p
                role={error ? 'alert' : 'status'}
                className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-muted-foreground'}`}
              >
                {error || 'Starting IDE workspace…'}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
