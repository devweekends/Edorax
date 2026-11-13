import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Play, RefreshCw } from 'lucide-react';
import type {
  DockerReadiness,
  DockerSetupProgress,
  ShellLabsAPI,
} from '../../domain/shell-labs';
import { errorText } from './progress';

type Api = Pick<
  ShellLabsAPI,
  'dockerState' | 'startDocker' | 'setUpDocker' | 'onDockerProgress'
>;

/**
 * Shown where a lab cannot start because Docker is not ready. One button does the next thing:
 * start Docker if it is installed, or download and open the official installer if it is not.
 * It never installs silently, and it keeps checking so the lab opens as soon as Docker answers.
 */
export function DockerSetup({
  api,
  onReady,
}: {
  api: Api;
  onReady: () => void;
}) {
  const [readiness, setReadiness] = useState<DockerReadiness | null>(null);
  const [progress, setProgress] = useState<DockerSetupProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = useRef(onReady);
  ready.current = onReady;

  const check = useCallback(async () => {
    try {
      const next = await api.dockerState();
      setReadiness(next);
      if (next.state === 'ready') ready.current();
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [api]);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), 4000);
    const stop = api.onDockerProgress(setProgress);
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [api, check]);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      void check();
    }
  }

  const linux =
    readiness?.state === 'missing' &&
    readiness.platform !== 'win32' &&
    readiness.platform !== 'darwin';
  const downloading = busy && progress?.phase === 'download';

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center text-white/80">
      <p className="text-base font-semibold text-white">Labs need Docker</p>

      {!readiness && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 size={15} className="animate-spin" /> Checking Docker…
        </p>
      )}

      {readiness?.state === 'not-running' && (
        <>
          <p className="text-sm leading-relaxed">
            Docker is installed, but it is not running. Start it and wait about
            a minute. This page opens the lab by itself when Docker is ready.
          </p>
          {readiness.canStart && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => api.startDocker())}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Play size={15} /> Start Docker
            </button>
          )}
        </>
      )}

      {readiness?.state === 'missing' && (
        <>
          <p className="text-sm leading-relaxed">
            {linux
              ? 'Docker Engine is not installed. The install steps depend on your Linux system, so the button opens the official guide.'
              : 'Docker Desktop is not installed. The button downloads the official installer from docker.com (about 600 MB) and opens it. The installer shows its own license terms and asks for your permission.'}
          </p>
          {!linux && (
            <p className="text-xs leading-relaxed text-white/60">
              Docker Desktop is made by Docker Inc. It is free for personal use
              and education. Larger companies need a paid plan. You may need to
              restart your computer when the installer finishes.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.setUpDocker())}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            {linux
              ? 'Open the install guide'
              : 'Download and open the installer'}
          </button>
        </>
      )}

      {downloading && typeof progress?.percent === 'number' && (
        <div
          className="w-full"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
      {progress && (
        <p
          className={`text-sm leading-relaxed ${progress.phase === 'error' ? 'text-red-300' : 'text-white/70'}`}
        >
          {progress.message}
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void check()}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-white/60 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
      >
        <RefreshCw size={12} /> Check again
      </button>
    </div>
  );
}
