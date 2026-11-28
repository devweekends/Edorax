import { describe, expect, it } from "vitest";
import { pickContinueTarget, resolveContinueChapterPath } from "../../../../src/services/progress/enrollment-syllabus.js";
import type { SyllabusChapter } from "../../../../src/types/syllabus.js";

function chapter(
  slug: string,
  status: SyllabusChapter["status"],
  locked = false
): Pick<SyllabusChapter, "slug" | "title" | "status" | "locked"> {
  return { slug, title: slug, status, locked };
}

describe("pickContinueTarget", () => {
  it("prefers in-progress unlocked chapter", () => {
    const flat = [
      chapter("a", "COMPLETED"),
      chapter("b", "IN_PROGRESS"),
      chapter("c", "NOT_STARTED"),
    ];
    expect(pickContinueTarget(flat)?.slug).toBe("b");
  });

  it("skips locked in-progress and picks first unlocked not-started", () => {
    const flat = [
      chapter("a", "COMPLETED"),
      chapter("b", "IN_PROGRESS", true),
      chapter("c", "NOT_STARTED"),
      chapter("d", "NOT_STARTED", true),
    ];
    expect(pickContinueTarget(flat)?.slug).toBe("c");
  });

  it("falls back to first unlocked when all complete", () => {
    const flat = [chapter("a", "COMPLETED"), chapter("b", "COMPLETED")];
    expect(pickContinueTarget(flat)?.slug).toBe("a");
  });

  it("returns no target when every chapter is locked", () => {
    const flat = [chapter("a", "IN_PROGRESS", true), chapter("b", "NOT_STARTED", true)];
    expect(pickContinueTarget(flat)).toBeNull();
  });

  describe("with the chapter the learner studied last", () => {
    it("resumes there, not at the first in-progress chapter", () => {
      const flat = [chapter("a", "IN_PROGRESS"), chapter("b", "COMPLETED"), chapter("c", "IN_PROGRESS"), chapter("d", "NOT_STARTED")];
      expect(pickContinueTarget(flat, "c")?.slug).toBe("c");
    });

    it("moves to the next unfinished chapter when the last one is complete", () => {
      const flat = [chapter("a", "IN_PROGRESS"), chapter("b", "COMPLETED"), chapter("c", "COMPLETED"), chapter("d", "NOT_STARTED")];
      expect(pickContinueTarget(flat, "b")?.slug).toBe("d");
    });

    it("skips locked chapters after the last one", () => {
      const flat = [chapter("a", "IN_PROGRESS"), chapter("b", "COMPLETED"), chapter("c", "NOT_STARTED", true), chapter("d", "NOT_STARTED")];
      expect(pickContinueTarget(flat, "b")?.slug).toBe("d");
    });

    it("falls back to the old rule when nothing is open from there on", () => {
      const flat = [chapter("a", "IN_PROGRESS"), chapter("b", "COMPLETED"), chapter("c", "COMPLETED")];
      expect(pickContinueTarget(flat, "c")?.slug).toBe("a");
    });

    it("ignores a last chapter that is not in the course", () => {
      const flat = [chapter("a", "IN_PROGRESS"), chapter("b", "NOT_STARTED")];
      expect(pickContinueTarget(flat, "gone")?.slug).toBe("a");
      expect(pickContinueTarget(flat, null)?.slug).toBe("a");
    });

    it("matches release-suffixed slugs against cleaned slugs and advances past completed chapters", () => {
      const flat = [
        chapter("1-1-set-the-scene", "COMPLETED"),
        chapter("1-2-gap-between-read-and-write", "COMPLETED"),
        chapter("1-3-check-inside-update", "NOT_STARTED"),
      ];
      expect(pickContinueTarget(flat, "1-1-set-the-scene--01m5w41ba4")?.slug).toBe("1-3-check-inside-update");
      expect(pickContinueTarget(flat, "1-2-gap-between-read-and-write--01m5w41ba4")?.slug).toBe("1-3-check-inside-update");
    });
  });
});

describe("resolveContinueChapterPath", () => {
  it("builds deep link to continue target", () => {
    const path = resolveContinueChapterPath("fresh-market", [
      chapter("intro", "COMPLETED"),
      chapter("next", "IN_PROGRESS"),
    ]);
    expect(path).toBe("/courses/fresh-market/next");
  });
});
