import { describe, expect, it } from "vitest";
import { GUIDED_TRACKS, guidedTrackViews, withoutGuidedTracks } from "@/lib/guided-labs";
import type { CatalogCourseSummary } from "@/shared/api/catalog";

function course(slug: string, over: Partial<CatalogCourseSummary> = {}): CatalogCourseSummary {
  return {
    id: slug,
    slug,
    title: `Title of ${slug}`,
    description: null,
    coverUrl: null,
    difficulty: null,
    estimatedHours: 36,
    category: "TECH",
    subcategory: null,
    tags: [],
    pricingType: "PAID",
    priceCents: 1000,
    currency: "USD",
    projectGoal: null,
    instructorName: null,
    moduleCount: 4,
    chapterCount: 57,
    ratingAverage: null,
    ratingCount: 0,
    enrollmentLifecycle: null,
    ...over,
  };
}

const price = (cents: number, currency: string) => `${currency} ${cents / 100}`;

describe("guided labs", () => {
  it("lists the three Dev Weekends levels in order", () => {
    expect(GUIDED_TRACKS.map((t) => t.slug)).toEqual(["dw-level-1", "site-and-outreach", "dw-level-3"]);
  });

  it("opens a track that is in the catalog, with its title, length, price and link", () => {
    const views = guidedTrackViews([course("dw-level-1"), course("dw-level-3", { estimatedHours: null })], price);
    const one = views.find((v) => v.track.slug === "dw-level-1")!;
    expect(one).toMatchObject({ open: true, title: "Title of dw-level-1", length: "36 hours · 57 chapters", price: "USD 10", href: "/catalog/dw-level-1" });
    expect(views.find((v) => v.track.slug === "dw-level-3")!.length).toBe("57 chapters");
  });

  it("shows a track that is not published as coming soon, with no link", () => {
    const two = guidedTrackViews([course("dw-level-1")], price).find((v) => v.track.slug === "site-and-outreach")!;
    expect(two).toMatchObject({ open: false, href: null, price: "" });
  });

  it("turns Level 2 into a normal card once its course is in the catalog", () => {
    const two = guidedTrackViews([course("site-and-outreach")], price).find((v) => v.track.slug === "site-and-outreach")!;
    expect(two).toMatchObject({ open: true, href: "/catalog/site-and-outreach" });
  });

  it("still lists every track when the catalog is unavailable", () => {
    const views = guidedTrackViews(null, price);
    expect(views).toHaveLength(3);
    expect(views.every((v) => !v.open && v.href === null)).toBe(true);
  });

  it("calls a free course free", () => {
    const one = guidedTrackViews([course("dw-level-1", { pricingType: "FREE", priceCents: 0 })], price)[0];
    expect(one.price).toBe("Free");
  });

  it("leaves the three tracks out of course lists and keeps every other course", () => {
    const list = [course("dw-level-1"), course("aws-in-practice"), course("site-and-outreach"), course("dw-level-3"), course("communication")];
    expect(withoutGuidedTracks(list).map((c) => c.slug)).toEqual(["aws-in-practice", "communication"]);
  });

  it("uses no em or en dashes in learner copy", () => {
    expect(JSON.stringify(GUIDED_TRACKS)).not.toMatch(/[\u2013\u2014]/);
  });
});
