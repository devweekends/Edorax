import type { Course } from './catalog';

// The Dev Weekends take-home tracks that make up Guided labs, the same list the web uses
// (frontend/src/lib/guided-labs.ts). Title, price and length come from the catalog; this file
// holds what the catalog does not carry. A track whose slug is in the catalog opens by itself.

export interface GuidedTrack {
  slug: string;
  level: string;
  fallbackTitle: string;
  audience: string;
  build: string;
  fallbackLength?: string;
}

export const GUIDED_TRACKS: readonly GuidedTrack[] = [
  {
    slug: 'dw-level-1',
    level: 'Level 1',
    fallbackTitle: 'Code Foundations',
    audience: 'For people who have never written code.',
    build: 'A command-line errand tracker in your own GitHub repository: find the cause of real bugs, write it, save it to a database, then rebuild it in classes with your own tests.',
  },
  {
    slug: 'site-and-outreach',
    level: 'Level 2',
    fallbackTitle: 'Personal site and outreach engine',
    audience: 'For people who can build a small app and want to be found.',
    build: 'A personal site with a blog and a tracked outreach engine, on a live address, checked by tests we run and you cannot edit.',
    fallbackLength: 'About two weeks',
  },
  {
    slug: 'dw-level-3',
    level: 'Level 3',
    fallbackTitle: 'Support and knowledge agents',
    audience: 'For engineers ready to build with language models and prove the result.',
    build: 'A support or knowledge agent for one company, answering from about 150 documents with citations and a human handoff, with your own harness showing what each change did to quality, security and cost.',
  },
];

export interface GuidedTrackView {
  track: GuidedTrack;
  /** The course exists in the catalog, so the card can open it. */
  open: boolean;
  title: string;
  /** For example "36 hours · 68 chapters". Empty when unknown. */
  length: string;
  /** For example "$10.00" or "Free". Empty when unknown. */
  price: string;
}

/** Join the track list with the catalog. Pure, so it is unit tested. */
export function guidedTrackViews(
  courses: readonly Course[] | null,
  formatPrice: (course: Course) => string,
): GuidedTrackView[] {
  return GUIDED_TRACKS.map((track) => {
    const course = courses?.find((c) => c.slug === track.slug) ?? null;
    if (!course) return { track, open: false, title: track.fallbackTitle, length: track.fallbackLength ?? '', price: '' };
    const parts: string[] = [];
    if (course.estimatedHours) parts.push(`${course.estimatedHours} hours`);
    if (course.chapterCount) parts.push(`${course.chapterCount} chapters`);
    return { track, open: true, title: course.title, length: parts.join(' · '), price: formatPrice(course) };
  });
}
