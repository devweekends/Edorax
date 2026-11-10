// Pure helpers for the Audiobooks area: a course's narration manifest becomes a book with parts and
// tracks, and the saved listening state becomes progress and a place to resume. No I/O here, so the
// server loader, the player and the tests share one definition.

import { categoryName } from '../ui/courses/format';

export type CourseCategory = string;

export const AUDIOBOOK_AUTHOR = "Zeeshan Adil";

const AUDIO_FILE = /^[\w.-]+\.mp3$/;
const PART_AND_CHAPTER = /^(\d+)\.(\d+)/;

export type AudiobookTrack = {
  /** The chapter slug, which is also the manifest key. */
  slug: string;
  title: string;
  minutes: number;
  src: string;
  /** 1-based part (course module) and chapter number inside it, from the numbered audio file. */
  part: number;
  chapter: number;
};

export type AudiobookPart = { number: number; title: string | null; firstTrack: number; trackCount: number; minutes: number };

export type Audiobook = {
  /** True when every chapter is saved on this computer. */
  downloaded?: boolean;
  slug: string;
  title: string;
  author: string;
  category: CourseCategory;
  subcategory: string | null;
  description: string | null;
  totalMinutes: number;
  tracks: AudiobookTrack[];
  parts: AudiobookPart[];
};

/** Module titles by module order, and chapter titles by "module.chapter", from the public course detail. */
export type CourseOutline = { modules: { order: number; title: string; chapters: { order: number; title: string }[] }[] };

/** "1-2-roles-and-expectations" reads as "Roles and expectations". */
export function chapterTitleFromSlug(slug: string): string {
  const words = slug.replace(/^(?:\d+[.-])+/, "").replace(/-/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

/**
 * The playable tracks of a manifest in course order (the audio files are numbered "01.02-...mp3"),
 * or an empty list. Entries without a safe file name or a positive length are skipped.
 */
export function manifestTracks(manifest: unknown, base: string, courseSlug: string): AudiobookTrack[] {
  if (!manifest || typeof manifest !== "object") return [];
  const chapters = (manifest as { chapters?: unknown }).chapters;
  if (!chapters || typeof chapters !== "object") return [];
  const rows: (AudiobookTrack & { file: string })[] = [];
  for (const [slug, entry] of Object.entries(chapters as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { file, minutes } = entry as Record<string, unknown>;
    if (typeof file !== "string" || !AUDIO_FILE.test(file)) continue;
    if (typeof minutes !== "number" || !(minutes > 0)) continue;
    const numbers = PART_AND_CHAPTER.exec(file);
    rows.push({
      slug,
      title: chapterTitleFromSlug(slug),
      minutes,
      src: `${base}/${courseSlug}/${file}`,
      part: numbers ? Number(numbers[1]) : 1,
      chapter: numbers ? Number(numbers[2]) : rows.length + 1,
      file,
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  return rows.map(({ file: _file, ...track }) => track);
}

/** Builds the book. The outline is optional: without it, titles come from the chapter slugs. */
export function buildAudiobook(
  course: { slug: string; title: string; description: string | null; category: CourseCategory; subcategory: string | null },
  tracks: AudiobookTrack[],
  outline: CourseOutline | null = null,
): Audiobook | null {
  if (tracks.length === 0) return null;
  const moduleByOrder = new Map(outline?.modules.map((m) => [m.order, m]) ?? []);
  const titled = tracks.map((track) => {
    const chapter = moduleByOrder.get(track.part)?.chapters.find((c) => c.order === track.chapter);
    return chapter?.title.trim() ? { ...track, title: chapter.title.trim() } : track;
  });
  const parts: AudiobookPart[] = [];
  titled.forEach((track, index) => {
    const last = parts[parts.length - 1];
    if (last && last.number === track.part) {
      last.trackCount += 1;
      last.minutes += track.minutes;
      return;
    }
    parts.push({ number: track.part, title: moduleByOrder.get(track.part)?.title.trim() || null, firstTrack: index, trackCount: 1, minutes: track.minutes });
  });
  return {
    slug: course.slug,
    title: course.title,
    // Every Edorax course is published in Zeeshan Adil's name; the catalog's instructor field can name the team.
    author: AUDIOBOOK_AUTHOR,
    category: course.category,
    subcategory: course.subcategory,
    description: course.description,
    totalMinutes: titled.reduce((sum, track) => sum + track.minutes, 0),
    tracks: titled,
    parts,
  };
}

export function categoryLabel(category: CourseCategory): string {
  return categoryName(category) || "Course";
}

// ---- Listening state ---------------------------------------------------------------

/** Saved per chapter: position and duration in seconds, and whether it was heard to the end. */
export type TrackState = { p: number; d: number; done?: boolean };
/** Saved per book: the chapter heard last, when, and every chapter's state. */
export type BookState = { track: string; at: number; tracks: Record<string, TrackState> };

export type BookListening = {
  started: boolean;
  finished: boolean;
  listenedMinutes: number;
  leftMinutes: number;
  /** 0 to 1. */
  fraction: number;
  doneCount: number;
};

function trackListenedMinutes(track: AudiobookTrack, state: TrackState | undefined): number {
  if (!state) return 0;
  if (state.done) return track.minutes;
  const seconds = state.d > 0 ? Math.min(state.p, state.d) : state.p;
  return Math.min(track.minutes, Math.max(0, seconds) / 60);
}

export function bookListening(book: Pick<Audiobook, "tracks" | "totalMinutes">, state: BookState | undefined): BookListening {
  const listened = book.tracks.reduce((sum, track) => sum + trackListenedMinutes(track, state?.tracks[track.slug]), 0);
  const doneCount = book.tracks.filter((track) => state?.tracks[track.slug]?.done).length;
  const finished = doneCount === book.tracks.length;
  return {
    started: listened > 0 || doneCount > 0,
    finished,
    listenedMinutes: listened,
    leftMinutes: finished ? 0 : Math.max(0, book.totalMinutes - listened),
    fraction: book.totalMinutes > 0 ? Math.min(1, listened / book.totalMinutes) : 0,
    doneCount,
  };
}

/** Where a saved position is worth resuming: not the first seconds, not the last ones. */
export function resumeAt(state: TrackState | undefined): number {
  if (!state || state.done) return 0;
  if (!Number.isFinite(state.p) || state.p <= 3) return 0;
  if (state.d > 0 && state.p >= state.d - 3) return 0;
  return state.p;
}

/**
 * The chapter and second to start from: the chapter heard last, or the next unfinished one after it
 * when it was finished, or the first chapter of a book never opened. `finished` is true when every
 * chapter is done, in which case it starts again from the top.
 */
export function resumeTarget(book: Pick<Audiobook, "tracks">, state: BookState | undefined): { index: number; at: number; finished: boolean } {
  if (!state) return { index: 0, at: 0, finished: false };
  const last = book.tracks.findIndex((track) => track.slug === state.track);
  if (last >= 0 && !state.tracks[state.track]?.done) return { index: last, at: resumeAt(state.tracks[state.track]), finished: false };
  const order = last >= 0 ? [...book.tracks.slice(last + 1), ...book.tracks.slice(0, last)] : book.tracks;
  const next = order.find((track) => !state.tracks[track.slug]?.done);
  if (!next) return { index: 0, at: 0, finished: book.tracks.length > 0 };
  const index = book.tracks.indexOf(next);
  return { index, at: resumeAt(state.tracks[next.slug]), finished: false };
}

/** "Part 2, chapter 3" for a track. */
export function trackLabel(track: Pick<AudiobookTrack, "part" | "chapter">): string {
  return `Part ${track.part}, chapter ${track.chapter}`;
}

// ---- Formatting --------------------------------------------------------------------

/** "45 min", "1 h", "3 h 20 min". Never "0 min". */
export function formatBookLength(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "1:05" or "1:02:09" for the scrubber. */
export function formatPlayerClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Speeds offered in the player, slowest first. */
export const AUDIOBOOK_SPEEDS: readonly number[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Sleep timer choices in minutes; "end" stops at the end of the current chapter. */
export const SLEEP_CHOICES: readonly (number | "end")[] = [5, 15, 30, 45, 60, "end"];

export const SKIP_BACK_SECONDS = 15;
export const SKIP_FORWARD_SECONDS = 30;

export type AudiobookLibraryResult = { books: Audiobook[]; catalogReachable: boolean };
