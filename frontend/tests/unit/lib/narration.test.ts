import { describe, expect, it } from "vitest";
import { formatClock, formatListenMinutes, formatMegabytes, resumePosition, NARRATION_SPEEDS } from "../../../src/lib/narration-format";
import { loadChapterNarration, narrationBase, pickNarration } from "../../../src/lib/narration";

const manifest = {
  version: 1,
  chapters: {
    "1-2-roles-and-expectations": { file: "01.02-roles-and-expectations.mp3", minutes: 3.7, bytes: 904_000, words: 625, voice: "af_heart", hash: "abc" },
  },
};

describe("pickNarration", () => {
  it("returns the player data for a chapter that has audio", () => {
    expect(pickNarration(manifest, "/narration", "collaboration", "1-2-roles-and-expectations")).toEqual({
      src: "/narration/collaboration/01.02-roles-and-expectations.mp3",
      minutes: 3.7,
      bytes: 904_000,
    });
  });

  it("returns nothing for a chapter without audio, so the reader shows no player", () => {
    expect(pickNarration(manifest, "/narration", "collaboration", "1-3-working-across-time-zones")).toBeNull();
  });

  it("ignores a broken manifest instead of failing the page", () => {
    expect(pickNarration(null, "/narration", "c", "s")).toBeNull();
    expect(pickNarration({}, "/narration", "c", "s")).toBeNull();
    expect(pickNarration({ chapters: { s: { file: "../../etc/passwd", minutes: 1, bytes: 1 } } }, "/narration", "c", "s")).toBeNull();
    expect(pickNarration({ chapters: { s: { file: "a.mp3", minutes: 0, bytes: 1 } } }, "/narration", "c", "s")).toBeNull();
    expect(pickNarration({ chapters: { s: { file: "a.mp3", minutes: 1 } } }, "/narration", "c", "s")).toBeNull();
  });
});

describe("narrationBase", () => {
  it("serves from the web app by default", () => {
    expect(narrationBase(undefined, undefined)).toBe("/narration");
    expect(narrationBase("   ", undefined)).toBe("/narration");
  });

  it("serves local files in development and on Vercel previews", () => {
    expect(narrationBase(undefined, "development")).toBe("/narration");
    expect(narrationBase(undefined, "preview")).toBe("/narration");
  });

  it("serves from the R2 bucket on Vercel production when nothing is configured", () => {
    expect(narrationBase(undefined, "production")).toBe("https://audio.edorax.com");
    expect(narrationBase("  ", "production")).toBe("https://audio.edorax.com");
  });

  it("lets an explicit address win everywhere, including production", () => {
    expect(narrationBase("https://audio.example.com/", "production")).toBe("https://audio.example.com");
    expect(narrationBase("https://audio.example.com/", "preview")).toBe("https://audio.example.com");
  });

  it("keeps an unsafe explicit address on the local files, even in production", () => {
    expect(narrationBase("//evil.example.com/x", "production")).toBe("/narration");
  });

  it("uses a configured https address without a trailing slash", () => {
    expect(narrationBase("https://audio.example.com/narration/")).toBe("https://audio.example.com/narration");
  });

  it("falls back for an unsafe address", () => {
    expect(narrationBase("//evil.example.com/x")).toBe("/narration");
    expect(narrationBase("javascript:alert(1)")).toBe("/narration");
  });
});

describe("loadChapterNarration", () => {
  it("rejects slugs that could escape the narration folder", async () => {
    expect(await loadChapterNarration("../secrets", "1-2-x")).toBeNull();
    expect(await loadChapterNarration("collaboration", "../../x")).toBeNull();
  });

  it("returns null when the course has no audio at all", async () => {
    expect(await loadChapterNarration("a-course-without-audio", "1-1-intro")).toBeNull();
  });
});

describe("player formatting", () => {
  it("rounds minutes up to at least one", () => {
    expect(formatListenMinutes(3.7)).toBe("4 min");
    expect(formatListenMinutes(0.2)).toBe("1 min");
  });

  it("shows the download size", () => {
    expect(formatMegabytes(904_000)).toBe("0.9 MB");
    expect(formatMegabytes(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("formats the clock", () => {
    expect(formatClock(65.9)).toBe("1:05");
    expect(formatClock(Number.NaN)).toBe("0:00");
  });

  it("offers a slower speed, normal, and every quarter step up to 4x", () => {
    expect(NARRATION_SPEEDS[0]).toBe(0.75);
    expect(NARRATION_SPEEDS).toContain(1);
    expect(NARRATION_SPEEDS).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4]);
    expect([...NARRATION_SPEEDS].sort((a, b) => a - b)).toEqual([...NARRATION_SPEEDS]);
  });

  it("resumes only from a useful spot", () => {
    expect(resumePosition(1, 200)).toBe(0);
    expect(resumePosition(80, 200)).toBe(80);
    expect(resumePosition(199, 200)).toBe(0);
    expect(resumePosition(80, 0)).toBe(0);
  });
});
