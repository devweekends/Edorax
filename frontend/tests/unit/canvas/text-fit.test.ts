import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveCanvas } from "@buildment/learning-ui/canvas/InteractiveCanvas";
import { MAP_CARD_H, mapLift } from "@buildment/learning-ui/canvas/primitives/block-map";
import { fitOneLine, sceneLift, textEms } from "@buildment/learning-ui/canvas/renderers/scene/geometry";
import type { Scene } from "@buildment/learning-ui/canvas/renderers/scene/types";
import { machineGeometry } from "@buildment/learning-ui/canvas/renderers/state-machine/geometry";
import type { StateMachineSpec } from "@buildment/learning-ui/canvas/renderers/state-machine/types";
import { breakLongWords, trayLines } from "@buildment/learning-ui/canvas/models/sorter";
import { sequenceGeometry } from "@buildment/learning-ui/canvas/renderers/sequence/geometry";
import type { SequenceSpec } from "@buildment/learning-ui/canvas/renderers/sequence/types";

// Text that is longer than the author expected must still fit its picture: it wraps, shrinks or
// the picture grows. These are the cases a sweep of live chapters found drawn over other text.

const sequence = (actors: { name: string; sub?: string }[]): SequenceSpec =>
  ({ kind: "sequence", title: "t", purpose: "p", summary: "s", limits: "l", actors, steps: [{ from: 0, to: 1, label: "go" }] }) as unknown as SequenceSpec;

describe("sequence lane headers", () => {
  it("are drawn as before when every name and second line fits", () => {
    const g = sequenceGeometry(sequence([{ name: "You", sub: "laptop" }, { name: "Docker" }]), "narrow");
    expect(g.pillH).toBe(46);
    expect(g.headerLines(0)).toEqual({ name: [{ text: "You", y: 26, textLength: undefined }], sub: [{ text: "laptop", y: 42, textLength: undefined }] });
    expect(g.headerLines(1)).toEqual({ name: [{ text: "Docker", y: 34, textLength: undefined }], sub: [] });
  });

  it("wrap long names and second lines on a phone, and every header grows together", () => {
    const actors = [
      { name: "You", sub: "at a terminal" },
      { name: "Docker", sub: "its records" },
      { name: "The image", sub: "a new container" },
      { name: "The network", sub: "from the inside" },
    ];
    const g = sequenceGeometry(sequence(actors), "narrow");
    expect(g.pillH).toBeGreaterThan(46);
    actors.forEach((actor, i) => {
      const lines = g.headerLines(i);
      expect(lines.name.map((l) => l.text).join(" ")).toBe(actor.name);
      expect(lines.sub.map((l) => l.text).join(" ")).toBe(actor.sub);
      for (const line of lines.sub) expect(line.text.length * g.subSize * 0.6, line.text).toBeLessThanOrEqual(g.pillW);
      for (const line of lines.name) expect(line.text.length * g.nameSize * 0.56, line.text).toBeLessThanOrEqual(g.pillW);
      const ys = [...lines.name, ...lines.sub].map((l) => l.y);
      expect(Math.min(...ys)).toBeGreaterThan(g.headerY + 8);
      expect(Math.max(...ys)).toBeLessThan(g.headerY + g.pillH);
    });
    // One word too long to wrap is held to the header's width.
    const tight = sequenceGeometry(sequence([{ name: "A", sub: "s3:DeleteObject" }, { name: "B" }, { name: "C" }, { name: "D" }]), "narrow");
    expect(tight.headerLines(0).sub[0].textLength).toBe(tight.pillW - 8);
    // Neighbouring headers do not reach each other.
    expect(g.laneX(1) - g.laneX(0)).toBeGreaterThanOrEqual(g.pillW);
  });
});

describe("flip deck", () => {
  const prompt = "Would an interviewer score this answer as strong or weak?";
  const longFront =
    "I start from the constraint. If the team already runs Kubernetes I use it, because one more workload costs the least work and keeps my alerts in one place. If there is no cluster I pick the managed container service, since nobody here wants to patch nodes at night, and I say what I would measure in the first month.";
  const deck = (front: string) => ({
    title: "Deck", limits: "None.", deckLabel: "Candidate answers", prompt, hint: "Pick one.", endNote: "Done.",
    verdicts: [{ id: "strong", label: "Strong" }, { id: "weak", label: "Weak" }],
    cards: [{ id: "1", front, answer: "strong", back: "It names the constraint first.", source: "Chapter 14.3" }],
  });
  const render = (front: string) => renderToString(createElement(InteractiveCanvas, { renderer: "flip-deck", data: deck(front) })).replaceAll("<!-- -->", "");

  it("puts a prompt that is too long for the banner on two lines instead of running off the picture", () => {
    const html = render("A short answer.");
    expect(html).not.toContain(`>${prompt}<`);
    expect(html).toContain(">Would an interviewer score<");
    expect(html).toContain(">this answer as strong or weak?<");
  });

  it("keeps a short card at the standard size", () => {
    const html = render("A short answer.");
    expect(html).toContain('viewBox="0 0 420 314"');
    expect(html).toContain('font-size="17"');
  });

  it("steps a long answer down in size so it stays between the card header and the line under it", () => {
    const html = render(longFront);
    expect(html).toContain('viewBox="0 0 420 314"');
    expect(html).not.toContain('font-size="17"');
    const ys = [...html.matchAll(/y="([\d.]+)" text-anchor="middle" font-size="1[2-5](?:\.5)?"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(5);
    // Header baseline is at 77, the line under the text at 278.
    expect(Math.min(...ys) - 12.5).toBeGreaterThan(77);
    expect(Math.max(...ys)).toBeLessThan(278 - 13);
  });

  it("grows the card when even the smallest size does not fit, so no words are cut", () => {
    const html = render(`${longFront} ${longFront}`);
    const height = Number(html.match(/viewBox="0 0 420 (\d+)"/)?.[1]);
    expect(height).toBeGreaterThan(314);
    expect(html).toContain("measure in the first month.<");
  });
});

describe("block map", () => {
  it("leaves a map alone when its top card is clear of the banner", () => {
    expect(mapLift([{ y: 46 + 5 + MAP_CARD_H / 2 }, { y: 200 }])).toBe(0);
  });

  it("moves a map down when its top card was placed under the banner", () => {
    const lift = mapLift([{ y: 30 }, { y: 200 }]);
    expect(30 + lift - MAP_CARD_H / 2 - 5).toBeGreaterThanOrEqual(46);
  });
});

describe("one line of text in a fixed box", () => {
  it("keeps its size when it fits, shrinks when it does not, and is held to the box past that", () => {
    expect(fitOneLine("Caller", 12.5, 84)).toEqual({ size: 12.5 });
    const smaller = fitOneLine("what the role may do", 11.5, 108);
    expect(smaller.size).toBeLessThan(11.5);
    expect(smaller.size).toBeGreaterThanOrEqual(11.5 * 0.8);
    expect(smaller.textLength).toBeUndefined();
    expect(textEms("what the role may do") * smaller.size * 1.04).toBeLessThanOrEqual(108.01);
    expect(fitOneLine("a much longer note than any card can hold on one line", 11.5, 100)).toEqual({ size: 11.5 * 0.8, textLength: 100 });
  });
});

describe("a scene with a verdict", () => {
  const scene = (y: number): Scene => ({
    width: 420, height: 200, loop: 3,
    actors: [{ id: "a", label: "Caller", x: 210, y }, { id: "b", label: "Verdict", x: 210, y: 160 }],
    events: [{ kind: "verdict", at: 1, text: "Allowed", tone: "good" }],
  });

  it("is left alone when its top box is clear of the banner", () => {
    expect(sceneLift(scene(80))).toBe(0);
  });

  it("is drawn lower when its top box was placed under the banner", () => {
    const lift = sceneLift(scene(40));
    expect(40 + lift - 30 - 5).toBeGreaterThanOrEqual(44);
    expect(sceneLift({ ...scene(40), events: [] })).toBe(0);
  });
});

describe("state machine pills", () => {
  const machine = (states: { id: string; name: string; sub?: string; col: number; row: number }[], edges: { from: string; to: string; label: string }[] = []): StateMachineSpec =>
    ({ kind: "state-machine", title: "t", purpose: "p", summary: "s", limits: "l", states, edges, steps: [] }) as unknown as StateMachineSpec;

  it("are drawn as before when the text fits", () => {
    const g = machineGeometry(machine([{ id: "a", name: "Draft", sub: "not sent", col: 0, row: 0 }, { id: "b", name: "Sent", col: 1, row: 0 }]), "wide");
    expect([g.pillW, g.pillH]).toEqual([128, 48]);
    expect(g.stateLines("a", 100)).toEqual({ name: [{ text: "Draft", y: 97, textLength: undefined }], sub: [{ text: "not sent", y: 113, textLength: undefined }] });
    expect(g.stateLines("b", 100).name[0].y).toBe(104.5);
  });

  it("wrap a long second line and grow every pill", () => {
    const g = machineGeometry(machine([{ id: "a", name: "Terraform's folder", sub: "lock names registry.terraform.io", col: 0, row: 0 }, { id: "b", name: "Plan", col: 1, row: 0 }]), "wide");
    const lines = g.stateLines("a", 100);
    expect(lines.sub.length).toBeGreaterThan(1);
    expect(g.pillH).toBeGreaterThan(48);
    for (const line of lines.sub) expect(line.textLength ?? line.text.length * g.subSize * 0.6).toBeLessThanOrEqual(g.pillW - 12 + 0.01);
  });

  it("narrow the pills on a phone when three rows share the width, so none leaves the picture", () => {
    const states = [0, 1, 2].map((row) => ({ id: `s${row}`, name: "Plan reviewed", sub: "a person read it", col: 0, row }));
    const g = machineGeometry(machine(states), "narrow");
    const xs = states.map((s) => g.byId.get(s.id)!.at[0]);
    expect(Math.min(...xs) - g.halfW).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs) + g.halfW).toBeLessThanOrEqual(g.width);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(g.pillW);
  });
});

describe("sorter trays with long identifiers", () => {
  it("break a word longer than a line after its separators", () => {
    expect(breakLongWords("replace_because_cannot_update", 12)).toBe("replace_ because_ cannot_ update");
    expect(breakLongWords("short words stay", 12)).toBe("short words stay");
    const w = (420 - 2 * 10 - 3 * 10) / 4;
    for (const line of trayLines(w, "replace_because_cannot_update", "the plan says so").label) expect(line.length * 7).toBeLessThanOrEqual(w - 8);
  });
});
