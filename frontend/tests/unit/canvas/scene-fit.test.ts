import { describe, expect, it } from "vitest";
import { canvasRegistry } from "@buildment/learning-ui/canvas/registry";
import { fitScene, spreadBoxes } from "@buildment/learning-ui/canvas/renderers/scene/fit";
import { sceneFrame } from "@buildment/learning-ui/canvas/renderers/scene/frame";
import { actorBox, actorsInside, frameCollisions } from "@buildment/learning-ui/canvas/renderers/scene/geometry";
import type { Scene } from "@buildment/learning-ui/canvas/renderers/scene/types";

// "Six services, one job each" from AWS in Practice 39.1: four 112 wide boxes 100 apart in a
// 420 wide picture, the first one starting left of the edge. They were drawn over each other.
const sixServices: Scene = {
  width: 420,
  height: 300,
  actors: [
    { id: "student", label: "Student", kind: "phone", sub: "one report", x: 45, y: 55 },
    { id: "page", label: "Web page", kind: "server", sub: "EC2", x: 145, y: 55 },
    { id: "door", label: "Front door", kind: "router", sub: "API Gateway", x: 250, y: 55 },
    { id: "fn", label: "Function", kind: "worker", sub: "Lambda", x: 355, y: 55 },
    { id: "bucket", label: "Files", kind: "database", sub: "S3", x: 355, y: 150 },
    { id: "table", label: "Records", kind: "note", sub: "DynamoDB", x: 230, y: 150 },
    { id: "queue", label: "Queue", kind: "queue", sub: "SQS", x: 355, y: 245 },
    { id: "indexer", label: "Indexer", kind: "worker", sub: "Lambda", x: 180, y: 245 },
  ],
  events: [
    { kind: "fly", at: 0.5, dur: 1, from: "student", to: "page", label: "report" },
    { kind: "say", at: 4.5, actor: "student", text: "all 12 uploaded", tone: "good" },
    { kind: "verdict", at: 13, text: "Uploads accepted: 12 of 12. Only the previews are late.", tone: "good" },
  ],
  loop: 16,
};

const clashes = (scene: Scene) => [0, 5, scene.loop].flatMap((t) => frameCollisions(scene, sceneFrame(scene, t)));

describe("fitting a scene whose boxes were placed too close", () => {
  it("reproduces the defect: as authored, boxes cover each other and one leaves the picture", () => {
    expect(clashes(sixServices).length).toBeGreaterThan(0);
    expect(actorBox(sixServices.actors[0], sixServices).left).toBeLessThan(0);
  });

  it("spreads the boxes so none covers another and all are inside a wider picture", () => {
    const fit = fitScene(sixServices);
    expect(clashes(fit)).toEqual([]);
    expect(actorsInside(fit)).toBe(true);
    expect(fit.width).toBeGreaterThan(sixServices.width);
    // The arrangement is kept: same order left to right, same rows.
    const xs = fit.actors.slice(0, 4).map((a) => a.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(fit.actors.slice(0, 4).map((a) => a.y)).size).toBe(1);
    // Rows that were fine keep their height: only the width changed.
    expect(fit.height).toBe(sixServices.height);
    expect(fitScene(sixServices)).toBe(fit);
  });

  it("spreads a column downward when stacked boxes cover each other", () => {
    const stacked: Scene = { width: 420, height: 200, loop: 2, events: [], actors: [{ id: "a", label: "A", x: 210, y: 60 }, { id: "b", label: "B", x: 210, y: 100 }] };
    const fit = fitScene(stacked);
    expect(clashes(fit)).toEqual([]);
    expect(fit.width).toBe(420);
    expect(fit.height).toBeGreaterThan(200);
  });

  it("returns a scene that already fits unchanged, close boxes included", () => {
    const fine: Scene = { width: 420, height: 200, loop: 2, events: [], actors: [{ id: "a", label: "A", x: 60, y: 100 }, { id: "b", label: "B", x: 174, y: 100 }] };
    expect(fitScene(fine)).toBe(fine);
    expect(spreadBoxes([], 420, 200)).toEqual({ kx: 1, ky: 1, dx: 0, dy: 0, width: 420, height: 200 });
  });

  it("leaves every registered scene exactly as authored", () => {
    for (const [slug, spec] of Object.entries(canvasRegistry)) {
      if (spec.kind === "scene") expect(fitScene(spec.scene), slug).toBe(spec.scene);
    }
  });
});
