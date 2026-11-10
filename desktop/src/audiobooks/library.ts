import {
  buildAudiobook,
  manifestTracks,
  type Audiobook,
  type AudiobookLibraryResult,
  type CourseOutline,
} from '../domain/audiobooks';
import type { Course } from '../domain/catalog';
import { listDownloaded } from './offline';

// Runs in the Electron main process: the renderer's Content Security Policy only allows requests to
// the app's own backend, so narration manifests are fetched here and handed to the renderer.
export const NARRATION_BASE =
  process.env.NARRATION_BASE_URL?.trim().replace(/\/+$/, '') ||
  'https://audio.edorax.com';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CatalogSource = {
  listCourses(): Promise<{ ok: true; courses: Course[] } | { ok: false }>;
  courseDetail(slug: string): Promise<{ ok: true; data: { modules: CourseOutline['modules'] } } | { ok: false }>;
};

async function fetchManifest(slug: string): Promise<unknown> {
  try {
    const response = await fetch(`${NARRATION_BASE}/${slug}/manifest.json`, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function outlineFor(source: CatalogSource, slug: string): Promise<CourseOutline | null> {
  try {
    const detail = await source.courseDetail(slug);
    return detail.ok ? { modules: detail.data.modules } : null;
  } catch {
    return null;
  }
}

/** Never throws. Downloaded books always show, so the shelf works offline. */
export async function loadAudiobookLibrary(source: CatalogSource): Promise<AudiobookLibraryResult> {
  const downloaded = await listDownloaded();
  const offlineOnly = { books: Object.values(downloaded), catalogReachable: false };

  let catalog: Course[];
  try {
    const result = await source.listCourses();
    if (!result.ok) return offlineOnly;
    catalog = result.courses;
  } catch {
    return offlineOnly;
  }

  const online = await Promise.all(
    catalog.map(async (course): Promise<Audiobook | null> => {
      if (!SLUG.test(course.slug)) return null;
      if (downloaded[course.slug]) return downloaded[course.slug];
      const tracks = manifestTracks(await fetchManifest(course.slug), NARRATION_BASE, course.slug);
      if (tracks.length === 0) return null;
      return buildAudiobook(course, tracks, await outlineFor(source, course.slug));
    }),
  );

  const books = new Map<string, Audiobook>();
  for (const book of online) if (book) books.set(book.slug, book);
  for (const [slug, book] of Object.entries(downloaded)) if (!books.has(slug)) books.set(slug, book);
  return { books: [...books.values()], catalogReachable: true };
}
