import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  bucketCount,
  checkDeck,
  currentCard,
  dealOrder,
  fitsOneLine,
  DEFAULT_WHY,
  isDone,
  placeCard,
  sortVerdict,
  startSort,
  trayLines,
  wrapWords,
  type SortBucket,
  type SortCard,
} from "@buildment/learning-ui/canvas/models/sorter";
import { InteractiveCanvas } from "@buildment/learning-ui/canvas/InteractiveCanvas";
import { REQUIREMENT_BUCKETS, REQUIREMENT_CARDS, sysdesignM1RequirementSorter } from "@buildment/learning-ui/canvas/sysdesign-m1-requirement-sorter/data";

const buckets: SortBucket[] = [
  { id: "a", label: "A", sub: "first" },
  { id: "b", label: "B", sub: "second" },
];
const cards: SortCard[] = [
  { id: "1", text: "one", answer: "a", why: { b: "one is an A" } },
  { id: "2", text: "two", answer: "b", why: {} },
];

describe("sorter model", () => {
  it("deals in data order with seed 0 and in a stable shuffle otherwise", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    expect(dealOrder(ids, 0)).toEqual(ids);
    expect(dealOrder(ids, 3)).toEqual(dealOrder(ids, 3));
    expect([...dealOrder(ids, 3)].sort()).toEqual(ids);
  });

  it("moves on after a right answer and counts it in its bucket", () => {
    const s0 = startSort(cards, buckets);
    expect(currentCard(s0, cards)?.id).toBe("1");
    const { state, outcome } = placeCard(s0, cards, "a");
    expect(outcome.kind).toBe("right");
    expect(bucketCount(state, "a")).toBe(1);
    expect(currentCard(state, cards)?.id).toBe("2");
  });

  it("keeps the card after a wrong answer, gives its reason, and remembers the miss once", () => {
    const s0 = startSort(cards, buckets);
    const first = placeCard(s0, cards, "b");
    expect(first.outcome).toMatchObject({ kind: "wrong", reason: "one is an A" });
    expect(currentCard(first.state, cards)?.id).toBe("1");
    const second = placeCard(first.state, cards, "b");
    expect(second.state.missed).toEqual(["1"]);
    const next = placeCard(placeCard(second.state, cards, "a").state, cards, "a");
    expect(next.outcome).toMatchObject({ kind: "wrong", reason: DEFAULT_WHY });
  });

  it("ignores unknown buckets and answers after the end, and gives a short verdict", () => {
    const s0 = startSort(cards, buckets);
    expect(placeCard(s0, cards, "zzz").outcome.kind).toBe("ignored");
    const end = placeCard(placeCard(s0, cards, "a").state, cards, "b").state;
    expect(isDone(end)).toBe(true);
    expect(currentCard(end, cards)).toBeNull();
    expect(placeCard(end, cards, "a").outcome.kind).toBe("ignored");
    expect(sortVerdict(end)).toBe("All sorted, all right first time");
    for (const missed of [[], ["x"], ["x", "y"], Array.from({ length: 12 }, (_, i) => `${i}`)]) {
      expect(sortVerdict({ ...end, missed }).length).toBeLessThanOrEqual(38);
    }
  });

  it("wraps text at spaces and keeps long words whole", () => {
    expect(wrapWords("a bb ccc dddd", 6)).toEqual(["a bb", "ccc", "dddd"]);
    expect(wrapWords("supercalifragilistic x", 5)).toEqual(["supercalifragilistic", "x"]);
    expect(wrapWords("", 10)).toEqual([]);
  });
});

describe("sysdesign-m1-requirement-sorter", () => {
  it("has a clean deck of 6 to 8 cards using every bucket, with short text", () => {
    expect(checkDeck(REQUIREMENT_CARDS, REQUIREMENT_BUCKETS)).toEqual([]);
    expect(REQUIREMENT_CARDS.length).toBeGreaterThanOrEqual(6);
    expect(REQUIREMENT_CARDS.length).toBeLessThanOrEqual(8);
    for (const b of REQUIREMENT_BUCKETS) expect(REQUIREMENT_CARDS.some((c) => c.answer === b.id)).toBe(true);
    for (const c of REQUIREMENT_CARDS) {
      // Three lines of 40 characters fit on the card; a reason is one line.
      expect(wrapWords(c.text, 40).length, c.id).toBeLessThanOrEqual(3);
      for (const reason of Object.values(c.why)) expect(reason.length, reason).toBeLessThanOrEqual(60);
    }
    for (const b of REQUIREMENT_BUCKETS) expect(`Right: ${b.label}`.length).toBeLessThanOrEqual(38);
  });

  it("plays a whole round to the end", () => {
    let s = startSort(REQUIREMENT_CARDS, REQUIREMENT_BUCKETS, 2);
    while (!isDone(s)) s = placeCard(s, REQUIREMENT_CARDS, currentCard(s, REQUIREMENT_CARDS)!.answer).state;
    expect(REQUIREMENT_BUCKETS.reduce((n, b) => n + bucketCount(s, b.id), 0)).toBe(REQUIREMENT_CARDS.length);
  });

  it("server-renders the picture, the buckets and the limits fold", () => {
    const { component: Canvas, title, purpose, limits } = sysdesignM1RequirementSorter;
    const html = renderToString(createElement(Canvas, { title, purpose, limits })).replaceAll("<!-- -->", "");
    expect(html).toContain("<svg");
    expect(html).toContain("What this picture leaves out");
    expect(html).toContain("Non-functional");
    expect(html).toContain("A student can upload a PDF note for a course.");
    expect(html.match(/<button/g)?.length).toBe(REQUIREMENT_BUCKETS.length);
  });
});

describe("sorter tray text", () => {
  // Three trays share a 420 wide picture, as in a "Finished / Waiting / Failed" sorter.
  const trayW = (420 - 2 * 10 - 2 * 10) / 3;
  const three: SortBucket[] = [
    { id: "done", label: "Finished", sub: "the prompt came back" },
    { id: "wait", label: "Waiting", sub: "the program is running" },
    { id: "fail", label: "Failed", sub: "a line says what went wrong" },
  ];

  it("keeps the roomy one-line layout only when the name and the gloss both fit the tray", () => {
    expect(fitsOneLine(195, "A", "first")).toBe(true);
    expect(fitsOneLine(trayW, "Works", "short gloss")).toBe(true);
    expect(fitsOneLine(trayW, "Failed", "a line says what went wrong")).toBe(false);
    expect(fitsOneLine(trayW, "Quietly does nothing useful", "no error")).toBe(false);
  });

  it("wraps a long name and gloss to lines that fit the tray, without losing words", () => {
    for (const bucket of [...three, { id: "q", label: "Quietly does nothing useful", sub: "no error, but not what you meant" }]) {
      const lines = trayLines(trayW, bucket.label, bucket.sub);
      expect(lines.label.join(" "), bucket.label).toBe(bucket.label);
      expect(lines.sub.join(" "), bucket.sub).toBe(bucket.sub);
      expect(lines.label.length + lines.sub.length).toBeLessThanOrEqual(4);
      for (const line of lines.label) expect(line.length * 7, line).toBeLessThanOrEqual(trayW - 8);
      for (const line of lines.sub) expect(line.length * 5.9, line).toBeLessThanOrEqual(trayW - 8);
    }
  });

  it("draws a three-tray sorter with each long gloss on more than one line", () => {
    const deck: SortCard[] = [{ id: "1", text: "The prompt came back.", answer: "done", why: { wait: "It came back.", fail: "No error line." } }];
    const html = renderToString(createElement(InteractiveCanvas, { renderer: "sorter", data: { title: "Sorter", limits: "None.", buckets: three, cards: deck, deckLabel: "Screen", prompt: "Waiting, finished or failed?", hint: "Pick one.", endNote: "Done." } })).replaceAll("<!-- -->", "");
    expect(html).not.toContain(">a line says what went wrong<");
    expect(html).toContain(">a line says<");
    expect(html).toContain(">what went wrong<");
  });
});
