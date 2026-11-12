// The Dev Weekends take-home tracks that make up Guided labs. The course text, price and length
// come from the catalog at request time; this file holds what the catalog does not carry: who each
// track is for and what the learner builds.
//
// To flip a track to open: nothing to do. A track whose `slug` appears in the catalog becomes a
// normal card with an Open link by itself. Level 2 (`site-and-outreach`) is listed here before it
// is published, so it shows as coming soon until the course exists.

import type { CatalogCourseSummary } from "@/shared/api/catalog";

export interface GuidedTrack {
  /** Catalog slug. */
  slug: string;
  /** Short label above the title, for example "Level 1". */
  level: string;
  /** Used until the catalog supplies the real title, and for tracks not published yet. */
  fallbackTitle: string;
  /** Who it is for, in one sentence. */
  audience: string;
  /** What the learner builds, in one sentence. */
  build: string;
  /** Length shown when the catalog has none (a track that is not published yet). */
  fallbackLength?: string;
}

export const GUIDED_TRACKS: readonly GuidedTrack[] = [
  {
    slug: "dw-level-1",
    level: "Level 1",
    fallbackTitle: "Code Foundations",
    audience: "For people who have never written code.",
    build: "A command-line errand tracker in your own GitHub repository: find the cause of real bugs, write it, save it to a database, then rebuild it in classes with your own tests.",
  },
  {
    slug: "site-and-outreach",
    level: "Level 2",
    fallbackTitle: "Personal site and outreach engine",
    audience: "For people who can build a small app and want to be found.",
    build: "A personal site with a blog and a tracked outreach engine, on a live address, checked by tests we run and you cannot edit.",
    fallbackLength: "About two weeks",
  },
  {
    slug: "dw-level-3",
    level: "Level 3",
    fallbackTitle: "Support and knowledge agents",
    audience: "For engineers ready to build with language models and prove the result.",
    build: "A support or knowledge agent for one company, answering from about 150 documents with citations and a human handoff, with your own harness showing what each change did to quality, security and cost.",
  },
];

export interface GuidedTrackView {
  track: GuidedTrack;
  /** True when the course exists in the catalog, so the card can link to it. */
  open: boolean;
  title: string;
  /** For example "36 hours · 68 chapters". Empty when unknown. */
  length: string;
  /** For example "$10.00" or "Free". Empty when unknown. */
  price: string;
  href: string | null;
}

/** Join the track list with whatever the catalog returned. Pure, so it is unit tested. */
export function guidedTrackViews(
  courses: readonly CatalogCourseSummary[] | null,
  formatPrice: (cents: number, currency: string) => string,
): GuidedTrackView[] {
  return GUIDED_TRACKS.map((track) => {
    const course = courses?.find((c) => c.slug === track.slug) ?? null;
    if (!course) {
      return { track, open: false, title: track.fallbackTitle, length: track.fallbackLength ?? "", price: "", href: null };
    }
    const parts: string[] = [];
    if (course.estimatedHours) parts.push(`${course.estimatedHours} hours`);
    if (course.chapterCount) parts.push(`${course.chapterCount} chapters`);
    return {
      track,
      open: true,
      title: course.title,
      length: parts.join(" · "),
      price: course.pricingType === "PAID" ? formatPrice(course.priceCents, course.currency) : "Free",
      href: `/catalog/${course.slug}`,
    };
  });
}
