import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";
import { ensureBaselineRelease, type ReleaseContent } from "../../src/services/courses/releases.js";
import { loadChapterReader } from "../../src/services/chapters/reader.js";

const app = createApp();

describe("stale chapter --ulid links after republish", () => {
  let fx: Awaited<ReturnType<typeof createCourseFixture>>;
  let logicalSlug: string;
  let staleId: string;
  let currentId: string;

  beforeAll(async () => {
    fx = await createCourseFixture();
    await prisma.course.update({
      where: { id: fx.course.id },
      data: { sequential: false, familySlug: "multi-vendor-marketplace", availableVariantSlugs: ["grocery", "digital-goods"] },
    });

    const baseline = await prisma.$transaction((tx) => ensureBaselineRelease(tx, fx.course.id));
    const content = structuredClone(baseline.content as unknown as ReleaseContent);
    const groceryModules = content.variants.grocery ?? Object.values(content.variants)[0]!;
    const old = groceryModules[0]!.chapters.find((chapter) => chapter.id === fx.chapterA.id)!;
    logicalSlug = "digital-goods-digital-goods-m1-01";
    staleId = "01m5pneeqmvrpgm6hnthaza524";

    const replacement = await prisma.chapter.create({
      data: {
        courseId: fx.course.id,
        moduleId: fx.chapterA.moduleId,
        slug: `${logicalSlug}--01m5currentchapterid000000001`,
        title: old.title,
        order: old.order,
        source: "# Digital goods intro",
        publishedAt: new Date(),
        contentKey: "digital-goods-m1-01",
      },
    });
    currentId = replacement.id;

    const nextGrocery = groceryModules.map((module, moduleIndex) =>
      moduleIndex !== 0
        ? module
        : {
            ...module,
            chapters: module.chapters.map((chapter) =>
              chapter.id === old.id
                ? { ...chapter, id: replacement.id, slug: logicalSlug, key: "digital-goods-m1-01" }
                : chapter
            ),
          }
    );
    content.variants.grocery = nextGrocery;
    content.variants["digital-goods"] = nextGrocery;

    const latestNumber = await prisma.courseRelease.aggregate({
      where: { courseId: fx.course.id },
      _max: { number: true },
    });
    const release = await prisma.courseRelease.create({
      data: {
        courseId: fx.course.id,
        number: (latestNumber._max.number ?? 0) + 1,
        content: content as unknown as object,
      },
    });
    await prisma.course.update({ where: { id: fx.course.id }, data: { activeReleaseId: release.id } });
    await prisma.enrollment.update({
      where: { id: fx.enrollment.id },
      data: { releaseId: release.id, variantSlug: "grocery", variantChosenAt: new Date(), variantLockedAt: new Date() },
    });
  });

  afterAll(() => fx.cleanup());

  const auth = () => ({ Authorization: `Bearer ${fx.learnerToken}` });

  it("opens a chapter when the URL carries a stale release id", async () => {
    const staleUrl = `${logicalSlug}--${staleId}`;
    const res = await request(app)
      .get(`/api/v1/courses/${fx.course.slug}/chapters/${encodeURIComponent(staleUrl)}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.chapter.slug).toBe(logicalSlug);
    expect(res.body.data.chapter.id).toBe(currentId);
    expect(res.body.data.locked).toBe(false);
    expect(res.body.data.content.source).toContain("Digital goods intro");
  });

  it("opens the logical release slug directly", async () => {
    const view = await loadChapterReader(fx.course.slug, logicalSlug, fx.learner);
    expect(view.chapter.id).toBe(currentId);
    expect(view.chapter.slug).toBe(logicalSlug);
  });
});
