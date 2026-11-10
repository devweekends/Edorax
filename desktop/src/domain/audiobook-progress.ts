import { useSyncExternalStore } from 'react';
import type { BookState, TrackState } from './audiobooks';

// Where every audiobook was left, kept in this browser. Edorax has no listening-progress model on
// the server yet, so signed-in or not this is per device. Storage can be missing or full (private
// windows, blocked site data); every read and write is guarded and the player works without it.

const KEY = 'edorax:audiobooks:v1';
const EMPTY: AudiobookStore = { books: {} };

export type AudiobookStore = { books: Record<string, BookState>; speed?: number };

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedStore: AudiobookStore = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): AudiobookStore {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as AudiobookStore;
    return value && typeof value === "object" && value.books && typeof value.books === "object" ? value : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function readAudiobookStore(): AudiobookStore {
  if (typeof window === "undefined") return EMPTY;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedStore = parse(raw);
  }
  return cachedStore;
}

function write(next: AudiobookStore) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Out of space or blocked: keep it in memory for this visit.
  }
  cachedRaw = readRaw();
  cachedStore = next;
  listeners.forEach((listener) => listener());
}

export function saveTrackState(bookSlug: string, trackSlug: string, state: TrackState) {
  const store = readAudiobookStore();
  const book = store.books[bookSlug] ?? { track: trackSlug, at: 0, tracks: {} };
  write({
    ...store,
    books: { ...store.books, [bookSlug]: { track: trackSlug, at: Date.now(), tracks: { ...book.tracks, [trackSlug]: state } } },
  });
}

export function saveSpeed(speed: number) {
  write({ ...readAudiobookStore(), speed });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved state, live: updates as the player saves and when another tab does. Empty on the server. */
export function useAudiobookStore(): AudiobookStore {
  return useSyncExternalStore(subscribe, readAudiobookStore, () => EMPTY);
}

// The chapter reader's own Listen player keeps a position per audio file under this key. Reading it
// and writing it keeps the two players in step: stop in one, carry on in the other.
export function readReaderPosition(src: string): number {
  try {
    return Number(window.localStorage.getItem(`buildment:narration:${src}`)) || 0;
  } catch {
    return 0;
  }
}

export function writeReaderPosition(src: string, seconds: number) {
  try {
    window.localStorage.setItem(`buildment:narration:${src}`, String(Math.floor(seconds)));
  } catch {
    // Same as above: a convenience only.
  }
}
