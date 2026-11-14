import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { load, dump } from "js-yaml";
import { parseCourseZip } from "../../src/services/teach/course-import.js";
import { importCourseZip } from "../../src/services/teach/course-import.js";
import { readCourseZip } from "../../src/services/teach/course-import.js";
import { prisma } from "../../src/db/prisma.js";
import { randomUUID } from "node:crypto";
import { getCourseOverview } from "../../src/services/courses/overview.js";
import { chooseCourseVariant } from "../../src/services/courses/track.js";
import { loadChapterReader } from "../../src/services/chapters/reader.js";
import { saveChapterDraft } from "../../src/services/teach/chapters.js";
import { approveCourseZipUpdate, previewCourseZipUpdate } from "../../src/services/teach/course-update.js";
import { releaseForEnrollment } from "../../src/services/courses/releases.js";

describe("course ZIP variant overrides", () => {
  it("keeps the dashboard ZIP file bound while allowing a bounded repository family package", () => {
    const files: Record<string, Uint8Array> = { "course.yaml": strToU8("slug: example\n") };
    for (let index = 1; index <= 1000; index += 1) files[`01-example/01.${index}-lesson.md`] = strToU8("One lesson.");
    const archive = Buffer.from(zipSync(files));
    expect(() => readCourseZip(archive)).toThrow("1,000 entries");
    expect(Object.keys(readCourseZip(archive, "repository"))).toHaveLength(1001);
  });

  it("publishes a variant-only module, an omitted shared module, and a stable variant sequence", async () => {
    const directory = new URL("../fixtures/public-course/", import.meta.url);
    const files: Record<string, Uint8Array> = {};
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
      for (const file of readdirSync(new URL(`${entry.name}/`, directory))) {
        files[`${entry.name}/${file}`] = strToU8(readFileSync(new URL(`${entry.name}/${file}`, directory), "utf8"));
      }
    }
    const slug = `variant-module-${randomUUID()}`;
    const manifest = load(readFileSync(new URL("course.yaml", directory), "utf8")) as Record<string, any>;
    manifest.slug = slug;
    manifest.family = slug;
    manifest.variantFamily = { slug, label: "Marketplace", defaultVariantSlug: "food", variants: [
      { slug: "food", label: "Food", productName: "FreshMarket", summary: "Build a food market", hardestConstraint: "Inventory" },
      { slug: "books", label: "Books", productName: "Hamesh", summary: "Build a book market", hardestConstraint: "Edition matching" },
    ] };
    for (const module of manifest.modules) {
      module.key = `shared-${module.dir.replace(/^\d+-/, "")}`;
      for (const lesson of module.lessons) lesson.key = `${module.key}-${lesson.file.replace(/^\d+\.\d+-/, "").replace(/\.md$/, "")}`;
    }
    const original = manifest.modules[0];
    const variantDir = "01-books-evidence";
    const variantModule = { key: "books-evidence", dir: variantDir, title: "Books evidence",
      lessons: original.lessons.map((lesson: { file: string; title: string; goal: string }) => ({
        ...lesson, key: `books-${lesson.file.replace(/^\d+\.\d+-/, "").replace(/\.md$/, "")}`,
      })) };
    for (const lesson of variantModule.lessons) {
      files[`variants/books/${variantDir}/${lesson.file}`] = files[`${original.dir}/${lesson.file}`]!;
    }
    const order = manifest.modules.map((module: { key: string }) => module.key).filter((key: string) => key !== manifest.modules[1].key);
    order.splice(1, 0, variantModule.key);
    manifest.availableVariantSlugs = ["food", "books"];
    manifest.variants = [{ slug: "books", modules: [variantModule], moduleOrder: order,
      omitLessonKeys: [original.lessons[1].key] }];
    files["course.yaml"] = strToU8(dump(manifest));
    const archive = Buffer.from(zipSync(files));
    const parsed = await parseCourseZip(archive);
    expect(parsed.plan.variants?.[0].modules?.[0].lessons).toHaveLength(original.lessons.length);
    const owner = await prisma.user.create({ data: { email: `${slug}@test.local`, role: "MENTOR", emailVerified: new Date() } });
    let learnerId: string | null = null;
    try {
      expect((await importCourseZip(owner, archive)).courseSlug).toBe(slug);
      const course = await prisma.course.findUniqueOrThrow({ where: { slug } });
      const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: course.activeReleaseId! } });
      const variants = (release.content as any).variants;
      expect(variants.food).toHaveLength(manifest.modules.length);
      expect(variants.books.map((module: { key: string }) => module.key)).toEqual(order);
      expect(variants.books.flatMap((module: { chapters: { key: string }[] }) => module.chapters).some((chapter: { key: string }) => chapter.key === original.lessons[1].key)).toBe(false);
      const firstOwn = variants.books.find((module: { key: string }) => module.key === variantModule.key).chapters[0];
      const readerChapter = await prisma.chapter.findUniqueOrThrow({ where: { id: firstOwn.id } });
      expect(readerChapter.source).toBeTruthy();
      await prisma.course.update({ where: { id: course.id }, data: { sequential: false } });
      const learner = await prisma.user.create({ data: { email: `learner-${slug}@test.local`, role: "MENTEE", emailVerified: new Date() } });
      learnerId = learner.id;
      await prisma.enrollment.create({ data: { courseId: course.id, userId: learner.id, lifecycle: "ACTIVE" } });
      await chooseCourseVariant(slug, learner, "books");
      const beforeReader = await loadChapterReader(slug, firstOwn.slug, learner);
      expect(beforeReader.content?.source).toBe(readerChapter.source);
      expect((await prisma.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: learner.id } } })).releaseId).toBe(release.id);
      const update = Buffer.from(zipSync({ ...files, "course.yaml": strToU8(dump({ ...manifest, publication: "update" })) }));
      const preview = await previewCourseZipUpdate(owner, course.id, update);
      await approveCourseZipUpdate(owner, course.id, preview.previewId);
      expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).activeReleaseId).toBe(release.id);
      const variantPath = `variants/books/${variantDir}/${variantModule.lessons[0].file}`;
      const changed = Buffer.from(zipSync({ ...files,
        [variantPath]: strToU8(Buffer.from(files[variantPath]!).toString("utf8") + "\nA revised book-specific evidence step.\n"),
        "course.yaml": strToU8(dump({ ...manifest, publication: "update" })),
      }));
      const changedPreview = await previewCourseZipUpdate(owner, course.id, changed);
      await approveCourseZipUpdate(owner, course.id, changedPreview.previewId);
      const latest = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(latest.activeReleaseId).not.toBe(release.id);
      const newRelease = await prisma.courseRelease.findUniqueOrThrow({ where: { id: latest.activeReleaseId! } });
      const latestOwn = (newRelease.content as any).variants.books.find((module: { key: string }) => module.key === variantModule.key).chapters[0];
      expect(latestOwn.id).not.toBe(firstOwn.id);
      const pinnedEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: learner.id } } });
      expect(pinnedEnrollment.releaseId).toBe(release.id);
      const pinned = await releaseForEnrollment(course.id, pinnedEnrollment, course.familySlug);
      expect(pinned?.modules.find(module => module.key === variantModule.key)?.chapters[0]?.id).toBe(firstOwn.id);
      // Opening the chapter moves the in-progress learner to the new release and its revised text.
      expect((await loadChapterReader(slug, firstOwn.slug, learner)).content?.source).toContain("A revised book-specific evidence step.");
      expect((await prisma.enrollment.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: learner.id } } })).releaseId).toBe(latest.activeReleaseId);
    } finally {
      await prisma.course.deleteMany({ where: { slug } });
      if (learnerId) await prisma.user.delete({ where: { id: learnerId } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  }, 60000);

  it("keeps explicit removals in a package with no lesson files", async () => {
    const directory = new URL("../fixtures/public-course/", import.meta.url);
    const manifest = load(readFileSync(new URL("course.yaml", directory), "utf8")) as Record<string, unknown>;
    manifest.slug = `remove-only-${randomUUID()}`;
    manifest.publication = "update";
    manifest.modules = [];
    manifest.remove = { moduleKeys: [], lessonKeys: ["retired-lesson"] };
    const archive = Buffer.from(zipSync({ "course.yaml": strToU8(dump(manifest)) }));
    const parsed = await parseCourseZip(archive);
    expect(parsed.plan.modules).toEqual([]);
    expect(parsed.plan.remove).toEqual({ moduleKeys: [], lessonKeys: ["retired-lesson"] });
    await expect(importCourseZip({} as Parameters<typeof importCourseZip>[0], archive))
      .rejects.toThrow("declares an update");
  }, 30000);

  it("refuses to create a course from a declared update package", async () => {
    const directory = new URL("../fixtures/public-course/", import.meta.url);
    const files: Record<string, Uint8Array> = {};
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
      for (const file of readdirSync(new URL(`${entry.name}/`, directory))) {
        files[`${entry.name}/${file}`] = strToU8(readFileSync(new URL(`${entry.name}/${file}`, directory), "utf8"));
      }
    }
    const manifest = load(readFileSync(new URL("course.yaml", directory), "utf8")) as Record<string, unknown>;
    manifest.slug = `update-only-${randomUUID()}`;
    manifest.publication = "update";
    files["course.yaml"] = strToU8(dump(manifest));
    await expect(importCourseZip({} as Parameters<typeof importCourseZip>[0], Buffer.from(zipSync(files))))
      .rejects.toThrow("declares an update");
  }, 30000);

  it("parses a text replacement and a whole chapter replacement", async () => {
    const directory = new URL("../fixtures/public-course/", import.meta.url);
    const files: Record<string, Uint8Array> = {};
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        for (const file of readdirSync(new URL(`${entry.name}/`, directory))) {
          files[`${entry.name}/${file}`] = strToU8(readFileSync(new URL(`${entry.name}/${file}`, directory), "utf8"));
        }
      }
    }
    const manifest = load(readFileSync(new URL("course.yaml", directory), "utf8")) as Record<string, unknown> & {
      modules: { lessons: { key?: string }[] }[];
    };
    manifest.family = "multi-vendor-marketplace";
    manifest.modules[0].lessons[0].key = "scene";
    manifest.modules[0].lessons[1].key = "roles";
    manifest.variants = [{ slug: "books", overrides: [
      { lessonKey: "scene", replacements: [{ from: "Almost always, the second one.", to: "For the books team, the second one." }] },
      { lessonKey: "roles", file: "variants/books/01-how-good-teams-work/01.02-roles-and-expectations.md" },
    ] }];
    files["course.yaml"] = strToU8(dump(manifest));
    files["variants/books/01-how-good-teams-work/01.02-roles-and-expectations.md"] = strToU8(
      "---\ntitle: Books team roles\nsummary: Assign book catalog work.\nestimatedMinutes: 5\n---\n\n## Roles\n\nAssign the ISBN matching and copy grading tasks.\n");
    const parsed = await parseCourseZip(Buffer.from(zipSync(files)));
    const overrides = parsed.plan.variants?.[0].overrides;
    expect(overrides?.[0].lesson.source).toContain("For the books team, the second one.");
    expect(overrides?.[1].lesson.title).toBe("Books team roles");
  }, 30000);

  it("creates a course with its own two variants and materialized override", async () => {
    const directory = new URL("../fixtures/public-course/", import.meta.url);
    const files: Record<string, Uint8Array> = {};
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
      for (const file of readdirSync(new URL(`${entry.name}/`, directory))) {
        files[`${entry.name}/${file}`] = strToU8(readFileSync(new URL(`${entry.name}/${file}`, directory), "utf8"));
      }
    }
    const slug = `custom-variant-${randomUUID()}`;
    const manifest = load(readFileSync(new URL("course.yaml", directory), "utf8")) as Record<string, unknown> & {
      modules: { dir: string; key?: string; lessons: { file: string; key?: string }[] }[];
    };
    manifest.slug = slug;
    manifest.family = slug;
    manifest.variantFamily = { slug, label: "Team projects", defaultVariantSlug: "food", variants: [
      { slug: "food", label: "Food", productName: "FreshMarket", summary: "Build a food app", hardestConstraint: "Inventory" },
      { slug: "electricity", label: "Electricity", productName: "GridMarket", summary: "Build a grid app", hardestConstraint: "Matching" },
    ] };
    for (const module of manifest.modules) {
      module.key = module.dir.replace(/^\d+-/, "");
      for (const lesson of module.lessons) lesson.key = `${module.key}-${lesson.file.replace(/^\d+\.\d+-/, "").replace(/\.md$/, "")}`;
    }
    const targetKey = manifest.modules[0].lessons[0].key!;
    manifest.variants = [{ slug: "electricity", overrides: [{ lessonKey: targetKey,
      replacements: [{ from: "Almost always, the second one.", to: "The electricity team picks the second one." }] }] }];
    files["course.yaml"] = strToU8(dump(manifest));
    const owner = await prisma.user.create({ data: { email: `${slug}@test.local`, role: "MENTOR", emailVerified: new Date() } });
    let learnerId: string | null = null;
    try {
      expect((await importCourseZip(owner, Buffer.from(zipSync(files)))).courseSlug).toBe(slug);
      const course = await prisma.course.findUniqueOrThrow({ where: { slug }, include: { releases: true } });
      expect(course.activeReleaseId).not.toBeNull();
      const active = course.releases.find(release => release.id === course.activeReleaseId)!;
      const variants = (active.content as any).variants;
      expect(variants.food[0].chapters[0].id).not.toBe(variants.electricity[0].chapters[0].id);
      const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: variants.electricity[0].chapters[0].id } });
      expect(chapter.source).toContain("The electricity team picks the second one.");
      await prisma.course.update({ where: { id: course.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      await expect(saveChapterDraft(owner, chapter.id, "An unsafe direct edit"))
        .rejects.toThrow("Chapter not found");
      expect((await prisma.chapter.findUniqueOrThrow({ where: { id: chapter.id } })).source).toBe(chapter.source);
      const learner = await prisma.user.create({ data: { email: `learner-${slug}@test.local`, role: "MENTEE", emailVerified: new Date() } });
      learnerId = learner.id;
      await prisma.enrollment.create({ data: { courseId: course.id, userId: learner.id, lifecycle: "ACTIVE" } });
      expect((await getCourseOverview(slug, learner)).track?.family?.variants.map(variant => variant.slug)).toEqual(["food", "electricity"]);
      expect((await chooseCourseVariant(slug, learner, "electricity")).track.variantSlug).toBe("electricity");
      const reader = await loadChapterReader(slug, variants.electricity[0].chapters[0].slug, learner);
      expect(reader.content?.source).toContain("The electricity team picks the second one.");
    } finally {
      await prisma.course.deleteMany({ where: { slug } });
      if (learnerId) await prisma.user.delete({ where: { id: learnerId } });
      await prisma.user.delete({ where: { id: owner.id } });
    }
  }, 30000);
});
