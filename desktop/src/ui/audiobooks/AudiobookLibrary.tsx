import { CardGridSkeleton } from '../shared/Skeleton';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pause, Play, Loader2, AlertCircle } from 'lucide-react';
import type { Audiobook } from '../../domain/audiobooks';
import { bookListening, formatBookLength, trackLabel } from '../../domain/audiobooks';
import { useAudiobookStore } from '../../domain/audiobook-progress';
import { CoverArt } from '../courses/CoverArt';
import { usePlayback } from './PlaybackContext';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; books: Audiobook[]; catalogReachable: boolean }
  | { status: 'error'; message: string };

export function AudiobookLibrary() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const [busyDownload, setBusyDownload] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Audiobook | null>(null);
  const store = useAudiobookStore();
  const { playback, play, toggle } = usePlayback();

  useEffect(() => {
    let alive = true;
    window.buildment.audiobooks
      .library()
      .then((result) => alive && setState({ status: 'ready', ...result }))
      .catch(() => alive && setState({ status: 'error', message: 'Could not load audiobooks.' }));
    return () => {
      alive = false;
    };
  }, [version]);

  const continueListening = useMemo(() => {
    if (state.status !== 'ready') return null;
    return state.books
      .map((book) => ({ book, saved: store.books[book.slug] }))
      .filter(({ book, saved }) => saved && bookListening(book, saved).started && !bookListening(book, saved).finished)
      .sort((a, b) => (b.saved?.at ?? 0) - (a.saved?.at ?? 0))[0]?.book ?? null;
  }, [state, store]);

  async function toggleDownload(book: Audiobook) {
    setBusyDownload(true);
    setDownloadError(null);
    const result = book.downloaded
      ? await window.buildment.audiobooks.remove(book.slug)
      : await window.buildment.audiobooks.download(book.slug);
    setBusyDownload(false);
    if (!result.ok) setDownloadError(result.message ?? 'Something went wrong.');
    setVersion((value) => value + 1);
    setOpen(null);
  }

  if (state.status === 'loading') {
    return (
      <CardGridSkeleton />
    );
  }
  if (state.status === 'error') {
    return <p role="alert" className="p-8 text-sm text-destructive">{state.message}</p>;
  }
  if (open) {
    const saved = store.books[open.slug];
    const listening = bookListening(open, saved);
    const currentlyPlaying = playback?.book.slug === open.slug;
    return (
      <section className="mx-auto max-w-3xl p-8">
        <button onClick={() => setOpen(null)} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> All audiobooks
        </button>
        <div className="flex gap-6">
          <div className="relative size-40 shrink-0 overflow-hidden rounded-2xl border border-border">
            <CoverArt variant={state.books.indexOf(open)} />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">{open.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{open.author}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatBookLength(open.totalMinutes)} · {open.tracks.length} chapters
              {listening.started && ` · ${Math.round(listening.fraction * 100)}% heard`}
            </p>
            <button
              onClick={() => (currentlyPlaying ? toggle() : play(open))}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {currentlyPlaying && playback?.playing ? <Pause size={16} /> : <Play size={16} />}
              {currentlyPlaying ? (playback?.playing ? 'Pause' : 'Resume') : listening.started ? 'Continue' : 'Play'}
            </button>
            <button
              onClick={() => void toggleDownload(open)}
              disabled={busyDownload}
              className="ml-3 mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {busyDownload && <Loader2 size={16} className="animate-spin" />}
              {open.downloaded ? 'Remove download' : 'Download for offline'}
            </button>
            {open.downloaded && <p className="mt-2 text-xs text-muted-foreground">Available offline on this computer.</p>}
            {downloadError && <p role="alert" className="mt-2 text-sm text-destructive">{downloadError}</p>}
          </div>
        </div>
        <ol className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
          {open.tracks.map((track, index) => {
            const trackState = saved?.tracks[track.slug];
            const active = currentlyPlaying && playback?.index === index;
            return (
              <li key={track.slug}>
                <button
                  onClick={() => play(open, index)}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm hover:bg-muted ${active ? 'text-primary' : 'text-foreground'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{track.title}</span>
                    <span className="text-xs text-muted-foreground">{trackLabel(track)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {trackState?.done ? 'Heard' : `${track.minutes} min`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  return (
    <section className="p-8">
      {state.status === 'ready' && !state.catalogReachable && (
        <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle size={15} /> The course service is unreachable. Showing what is available.
        </p>
      )}
      {continueListening && (
        <div className="mb-10 rounded-2xl border border-border bg-secondary/60 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Continue listening</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold text-foreground">{continueListening.title}</p>
              <p className="text-sm text-muted-foreground">{continueListening.author}</p>
            </div>
            <button onClick={() => play(continueListening)} className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Play size={15} /> Resume
            </button>
          </div>
        </div>
      )}
      <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">All audiobooks</h2>
      {state.books.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No audiobooks are available yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6">
          {state.books.map((book, index) => {
            const listening = bookListening(book, store.books[book.slug]);
            return (
              <li key={book.slug}>
                <button onClick={() => setOpen(book)} className="group block w-full text-left">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border transition-transform group-hover:-translate-y-1">
                    <CoverArt variant={index} />
                  </div>
                  <p className="mt-3 line-clamp-2 font-semibold leading-snug text-foreground group-hover:underline">{book.title}</p>
                  <p className="text-xs text-muted-foreground">{book.author}</p>
                  <p className="text-xs text-muted-foreground">{formatBookLength(book.totalMinutes)} · {book.tracks.length} chapters</p>
                  {listening.started && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.round(listening.fraction * 100)}%` }} />
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
