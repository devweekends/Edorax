import "server-only";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import { serverApiFetch } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { guidedTrackViews, type GuidedTrackView } from "@/lib/guided-labs";

/** The guided tracks joined with the live catalog. Without the catalog the tracks still list, minus price and length. */
export async function loadGuidedTracks(): Promise<GuidedTrackView[]> {
  let courses: CatalogCourseSummary[] | null = null;
  try {
    courses = (await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog")).courses;
  } catch {
    courses = null;
  }
  return guidedTrackViews(courses, formatPriceCents);
}
