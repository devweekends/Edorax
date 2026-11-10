import { app, protocol } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { Audiobook } from '../domain/audiobooks';

// Downloaded narrations live in the app's data folder and play through a private scheme, so the
// renderer never needs a file:// address.
export const AUDIO_SCHEME = 'edorax-audio';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Must run before the app is ready. */
export function registerAudioScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

const rootDir = () => path.join(app.getPath('userData'), 'offline-audio');
const bookDir = (slug: string) => path.join(rootDir(), slug);
export const localTrackUrl = (slug: string, index: number) => `${AUDIO_SCHEME}://${slug}/${index}.mp3`;

/** Downloaded books, with tracks pointing at the local copies. */
export async function listDownloaded(): Promise<Record<string, Audiobook>> {
  const found: Record<string, Audiobook> = {};
  let entries: string[] = [];
  try {
    entries = await readdir(rootDir());
  } catch {
    return found;
  }
  for (const slug of entries) {
    if (!SLUG.test(slug)) continue;
    try {
      const book = JSON.parse(await readFile(path.join(bookDir(slug), 'index.json'), 'utf8')) as Audiobook;
      found[slug] = {
        ...book,
        downloaded: true,
        tracks: book.tracks.map((track, index) => ({ ...track, src: localTrackUrl(slug, index) })),
      };
    } catch {
      // Missing or incomplete: not available offline.
    }
  }
  return found;
}

/** Downloads every chapter, then publishes the book. Interrupted downloads never show as complete. */
export async function downloadBook(book: Audiobook): Promise<void> {
  if (!SLUG.test(book.slug)) throw new Error('Invalid course.');
  const dir = bookDir(book.slug);
  const partial = `${dir}.partial`;
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true });
  for (let index = 0; index < book.tracks.length; index += 1) {
    const response = await fetch(book.tracks[index].src, { redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`Chapter ${index + 1} could not be downloaded.`);
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path.join(partial, `${index}.mp3`)));
  }
  await writeFile(path.join(partial, 'index.json'), JSON.stringify({ ...book, downloaded: undefined }));
  await rm(dir, { recursive: true, force: true });
  await rename(partial, dir);
}

export async function removeBook(slug: string): Promise<void> {
  if (!SLUG.test(slug)) throw new Error('Invalid course.');
  await rm(bookDir(slug), { recursive: true, force: true });
}

/** Serves local chapters, including byte ranges, so seeking works. Must run after the app is ready. */
export function registerAudioProtocol() {
  protocol.handle(AUDIO_SCHEME, async (request) => {
    const url = new URL(request.url);
    const slug = url.hostname;
    const match = /^\/(\d+)\.mp3$/.exec(url.pathname);
    if (!SLUG.test(slug) || !match) return new Response('Not found', { status: 404 });
    const file = path.join(bookDir(slug), `${match[1]}.mp3`);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    if (!range) {
      return new Response(await readFile(file), { headers: { ...base, 'Content-Length': String(size) } });
    }
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const handle = await open(file, 'r');
    try {
      const buffer = Buffer.alloc(end - start + 1);
      await handle.read(buffer, 0, buffer.length, start);
      return new Response(buffer, {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(buffer.length) },
      });
    } finally {
      await handle.close();
    }
  });
}
