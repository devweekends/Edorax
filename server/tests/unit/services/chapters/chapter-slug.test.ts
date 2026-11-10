import { describe, expect, it } from "vitest";
import { cleanChapterSlug, findChapterIndex } from "../../../../src/services/chapters/chapter-slug.js";

const chapters = [
  { id: "01M5Q3X9XNWA6YJPWASXBYQE5H", slug: "1-1-set-the-scene-launch-day" },
  { id: "01M5Q3XB0ZHAW4EVRBD60YER9E", slug: "20-4-deep-dive-the-read-path-at-scale" },
  { id: "01M5PNEEQMVRPGM6HNTHAZA999", slug: "digital-goods-digital-goods-m1-01" },
];

describe("cleanChapterSlug", () => {
  it("strips a trailing release id", () => {
    expect(cleanChapterSlug("digital-goods-digital-goods-m1-01--01m5pneeqmvrpgm6hnthaza524")).toBe(
      "digital-goods-digital-goods-m1-01"
    );
  });

  it("leaves a release slug unchanged", () => {
    expect(cleanChapterSlug("digital-goods-digital-goods-m1-01")).toBe("digital-goods-digital-goods-m1-01");
  });
});

describe("findChapterIndex", () => {
  it("matches the release slug", () => {
    expect(findChapterIndex(chapters, "20-4-deep-dive-the-read-path-at-scale")).toBe(1);
  });

  it("matches a chapter row's slug that carries the release id", () => {
    expect(findChapterIndex(chapters, "20-4-deep-dive-the-read-path-at-scale--01m5q3xb0zhaw4evrbd60yer9e")).toBe(1);
  });

  it("matches by logical slug when the release id is stale after republish", () => {
    expect(
      findChapterIndex(chapters, "digital-goods-digital-goods-m1-01--01m5pneeqmvrpgm6hnthaza524")
    ).toBe(2);
  });

  it("finds nothing for an unknown slug", () => {
    expect(findChapterIndex(chapters, "no-such-chapter")).toBe(-1);
    expect(findChapterIndex(chapters, "no-such-chapter--01m5zzzzzzzzzzzzzzzzzzzzzz")).toBe(-1);
  });
});
