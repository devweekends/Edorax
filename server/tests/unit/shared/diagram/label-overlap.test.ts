import { describe, expect, it } from "vitest";
import { mermaidToDiagram } from "../../../../src/shared/diagram/from-mermaid.js";
import { layoutDiagram, type Scene, type SceneLabel } from "../../../../src/shared/diagram/layout.js";
import { parseDiagram } from "../../../../src/shared/diagram/spec.js";
import { textWidth } from "../../../../src/shared/diagram/text.js";

// The chart from system-design 6.9, where two arrow labels were drawn over each other.
const RATE_LIMITER = `flowchart LR
  S["bucket.js, shared.js or pay.js"] --> SP["send.js or fetch: requests at planned moments"]
  SP -->|"HTTP, take turns"| A["server.js, copy A"]
  SP -->|"HTTP, take turns"| B["server.js, copy B"]
  A -->|"one atomic script"| V[("Valkey in Docker: buckets and idempotency keys")]
  B -->|"one atomic script"| V
  SP -->|"POST /payments with a key"| P["pay-server.js"]
  P -->|"SET key NX"| V
  P --> F["fake provider: slow, keeps a list of charges"]
`;

type Rect = { x: number; y: number; w: number; h: number };
const boxOf = (label: SceneLabel): Rect => {
  const w = Math.max(0, ...label.lines.map((line) => textWidth(line, label.size)));
  const x = label.anchor === "middle" ? label.x - w / 2 : label.anchor === "start" ? label.x : label.x - w;
  return { x, y: label.y - label.size, w, h: label.lines.length * label.size * 1.25 };
};
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Pairs of arrow labels drawn over each other, and arrow labels drawn over a part's text. */
function textClashes(scene: Scene): string[] {
  const labels = scene.edges.flatMap((edge) => (edge.label?.lines.length ? [edge.label] : []));
  const parts = scene.nodes.map((node) => node.label).filter((label) => label.lines.length);
  const out: string[] = [];
  labels.forEach((a, i) => {
    labels.slice(i + 1).forEach((b) => { if (overlap(boxOf(a), boxOf(b))) out.push(`${a.lines.join(" ")} over ${b.lines.join(" ")}`); });
    parts.forEach((p) => { if (overlap(boxOf(a), boxOf(p))) out.push(`${a.lines.join(" ")} over part ${p.lines.join(" ")}`); });
  });
  return out;
}

describe("arrow labels in a crowded flow", () => {
  const converted = mermaidToDiagram(RATE_LIMITER, "Challenge 5: what runs where");
  if (!converted) throw new Error("chart did not convert");
  const parsed = parseDiagram(converted.kind, converted.source);
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"));

  it("are not drawn over each other or over a part's text, wide or on a phone", () => {
    expect(textClashes(layoutDiagram(parsed.spec, false))).toEqual([]);
    expect(textClashes(layoutDiagram(parsed.spec, true))).toEqual([]);
  });
});
