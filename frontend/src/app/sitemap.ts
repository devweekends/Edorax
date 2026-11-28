import type { MetadataRoute } from "next";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import { serverApiFetch } from "@/lib/api-server";
import { SITE_URL } from "@/lib/site";
import { LAB_KINDS, LEARN_AREAS } from "@/lib/learn-areas";
import { LAB_SLUGS } from "@/shared/lab/slugs";
import { FEATURE_PAGES, featurePath } from "@/components/marketing/edorax/feature-pages";

// Built on request from the live catalog, so a newly published course is listed without a deploy.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/learn`, changeFrequency: "weekly", priority: 0.8 },
    ...FEATURE_PAGES.map((page) => ({ url: `${SITE_URL}${featurePath(page.slug)}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...LEARN_AREAS.filter((area) => area.href !== "/catalog").map((area) => ({ url: `${SITE_URL}${area.href}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    // Only plain paths are listed. Shell collections (/labs/linux) come from the API and are left out here.
    ...LAB_KINDS.filter((kind) => !/[?#]/.test(kind.href)).map((kind) => ({ url: `${SITE_URL}${kind.href}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...LAB_SLUGS.map((slug) => ({ url: `${SITE_URL}/labs/visual/${slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
  try {
    const { courses } = await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog", { token: null });
    for (const course of courses) {
      pages.push({ url: `${SITE_URL}/catalog/${course.slug}`, changeFrequency: "weekly", priority: 0.8 });
    }
  } catch {
    // The API being down should not break the sitemap; the fixed pages are still listed.
  }
  return pages;
}
