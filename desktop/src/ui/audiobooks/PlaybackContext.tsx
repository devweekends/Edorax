import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Audiobook } from '../../domain/audiobooks';
import { resumeTarget } from '../../domain/audiobooks';
import {
  readAudiobookStore,
  saveSpeed,
  saveTrackState,
} from '../../domain/audiobook-progress';

// One audio element for the whole app, so playback continues while you browse.

export type Playback = {
  book: Audiobook;
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  speed: number;
};

type PlaybackApi = {
  playback: Playback | null;
  play(book: Audiobook, index?: number): void;
  toggle(): void;
  seek(seconds: number): void;
  skip(seconds: number): void;
  next(): void;
  prev(): void;
  setSpeed(speed: number): void;
  close(): void;
};

const PlaybackContext = createContext<PlaybackApi | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const current = useRef<Playback | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const lastSaved = useRef(0);

  // Keep the ref in step with state so event handlers always see the latest book and track.
  useEffect(() => {
    current.current = playback;
  }, [playback]);

  const save = useCallback((done = false) => {
    const now = current.current;
    const element = audio.current;
    if (!now || !element) return;
    const track = now.book.tracks[now.index];
    saveTrackState(now.book.slug, track.slug, {
      p: element.currentTime,
      d: Number.isFinite(element.duration) ? element.duration : 0,
      done,
    });
  }, []);

  useEffect(() => {
    const element = new Audio();
    element.preload = 'metadata';
    audio.current = element;
    const onTime = () => {
      setPlayback((value) => (value ? { ...value, time: element.currentTime, duration: element.duration || 0 } : value));
      if (Date.now() - lastSaved.current > 5000) {
        lastSaved.current = Date.now();
        save();
      }
    };
    const onMeta = () => {
      if (pendingSeek.current !== null) {
        element.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      setPlayback((value) => (value ? { ...value, duration: element.duration || 0 } : value));
    };
    const onPlay = () => setPlayback((value) => (value ? { ...value, playing: true } : value));
    const onPause = () => {
      setPlayback((value) => (value ? { ...value, playing: false } : value));
      save();
    };
    const onEnded = () => {
      save(true);
      const now = current.current;
      if (now && now.index + 1 < now.book.tracks.length) {
        load(now.book, now.index + 1, 0, true);
      } else {
        setPlayback((value) => (value ? { ...value, playing: false } : value));
      }
    };
    element.addEventListener('timeupdate', onTime);
    element.addEventListener('loadedmetadata', onMeta);
    element.addEventListener('play', onPlay);
    element.addEventListener('pause', onPause);
    element.addEventListener('ended', onEnded);
    return () => {
      save();
      element.pause();
      element.removeAttribute('src');
      element.load();
      audio.current = null;
    };
    // load is stable below; the element lives as long as the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  function load(book: Audiobook, index: number, at: number, autoplay: boolean) {
    const element = audio.current;
    if (!element) return;
    const track = book.tracks[index];
    pendingSeek.current = at > 0 ? at : null;
    element.src = track.src;
    element.playbackRate = current.current?.speed ?? 1;
    setPlayback({
      book,
      index,
      playing: autoplay,
      time: at,
      duration: track.minutes * 60,
      speed: current.current?.speed ?? readAudiobookStore().speed ?? 1,
    });
    if (autoplay) void element.play().catch(() => setPlayback((value) => (value ? { ...value, playing: false } : value)));
  }

  const play = useCallback((book: Audiobook, index?: number) => {
    const state = readAudiobookStore().books[book.slug];
    const target = resumeTarget(book, state);
    const useIndex = index ?? target.index;
    const at = index === undefined ? target.at : 0;
    if (current.current && current.current.book.slug !== book.slug) save();
    load(book, useIndex, at, true);
    // load reads the element through the ref, so it is safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  const api = useMemo<PlaybackApi>(() => ({
    playback,
    play,
    toggle() {
      const element = audio.current;
      if (!element || !current.current) return;
      if (element.paused) void element.play();
      else element.pause();
    },
    seek(seconds) {
      const element = audio.current;
      if (element) element.currentTime = Math.max(0, seconds);
    },
    skip(seconds) {
      const element = audio.current;
      if (element) element.currentTime = Math.max(0, element.currentTime + seconds);
    },
    next() {
      const now = current.current;
      if (now && now.index + 1 < now.book.tracks.length) load(now.book, now.index + 1, 0, true);
    },
    prev() {
      const now = current.current;
      const element = audio.current;
      if (!now || !element) return;
      if (element.currentTime > 3 || now.index === 0) element.currentTime = 0;
      else load(now.book, now.index - 1, 0, true);
    },
    setSpeed(speed) {
      const element = audio.current;
      if (element) element.playbackRate = speed;
      saveSpeed(speed);
      setPlayback((value) => (value ? { ...value, speed } : value));
    },
    close() {
      save();
      audio.current?.pause();
      setPlayback(null);
    },
  }), [playback, play, save]);

  return <PlaybackContext.Provider value={api}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackApi {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used inside PlaybackProvider');
  return value;
}
