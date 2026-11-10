import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward, X } from 'lucide-react';
import { AUDIOBOOK_SPEEDS, SKIP_BACK_SECONDS, SKIP_FORWARD_SECONDS, formatPlayerClock } from '../../domain/audiobooks';
import { usePlayback } from './PlaybackContext';

// Stays at the bottom of the window while an audiobook plays, on any screen.
export function MiniPlayer() {
  const { playback, toggle, seek, skip, next, prev, setSpeed, close } = usePlayback();
  if (!playback) return null;
  const track = playback.book.tracks[playback.index];
  const total = playback.duration || track.minutes * 60;

  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-border bg-card px-5 py-3" role="region" aria-label="Audiobook player">
      <div className="min-w-0 w-56">
        <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">{playback.book.title}</p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={prev} aria-label="Previous chapter" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><StepBack size={17} /></button>
        <button onClick={() => skip(-SKIP_BACK_SECONDS)} aria-label={`Back ${SKIP_BACK_SECONDS} seconds`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><SkipBack size={17} /></button>
        <button onClick={toggle} aria-label={playback.playing ? 'Pause' : 'Play'} className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {playback.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={() => skip(SKIP_FORWARD_SECONDS)} aria-label={`Forward ${SKIP_FORWARD_SECONDS} seconds`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><SkipForward size={17} /></button>
        <button onClick={next} aria-label="Next chapter" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><StepForward size={17} /></button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatPlayerClock(playback.time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={Math.min(playback.time, total)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Seek"
          className="min-w-0 flex-1 accent-[var(--primary)]"
        />
        <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatPlayerClock(total)}</span>
      </div>
      <select
        value={playback.speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
        aria-label="Playback speed"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        {AUDIOBOOK_SPEEDS.map((speed) => (
          <option key={speed} value={speed}>{speed}×</option>
        ))}
      </select>
      <button onClick={close} aria-label="Close player" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button>
    </div>
  );
}
