import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InteractiveCanvas } from "@buildment/learning-ui/canvas/InteractiveCanvas";
import { canvasRegistry } from "@buildment/learning-ui/canvas/registry";
import { buildLagScene } from "@buildment/learning-ui/canvas/models/replica-lag-scene";
import { buildTrueTimeScene } from "@buildment/learning-ui/canvas/models/truetime-scene";
import { loopTime, sceneFrame } from "@buildment/learning-ui/canvas/renderers/scene/frame";
import { actorBox, actorsInside, BOX_H, BOX_W, chipBox, chipTops, frameCollisions, longestWaitLabel, MAX_BOX_W, MAX_SUB_CHARS, nodeSize, subCharsAt, SUB_LINE_H, waitLabelBox, waitPillBox, wrapBalanced, wrapLines } from "@buildment/learning-ui/canvas/renderers/scene/geometry";
import type { Scene } from "@buildment/learning-ui/canvas/renderers/scene/types";
import { bandOverlap, clampB } from "@buildment/learning-ui/canvas/sysdesign-band-overlap/model";
import { clampEpsilon, clockBandFrame } from "@buildment/learning-ui/canvas/sysdesign-clock-band/model";
import { clampLag, replicaBehindFrame } from "@buildment/learning-ui/canvas/sysdesign-replica-behind/model";
import { twoClocksFrame } from "@buildment/learning-ui/canvas/sysdesign-two-clocks/model";

const SYSDESIGN = Object.keys(canvasRegistry).filter((slug) => slug.startsWith("sysdesign-"));

/** Every scene the system design beats can show, across their inputs. */
function allScenes(): [string, Scene][] {
  const out: [string, Scene][] = [];
  for (const routing of ["any", "leader", "token"] as const) out.push([`lag ${routing}`, buildLagScene(routing)]);
  for (let eps = 1; eps <= 10; eps++) for (const wait of [false, true]) out.push([`truetime eps ${eps} wait ${wait}`, buildTrueTimeScene(eps, wait)]);
  for (const slug of SYSDESIGN) {
    const spec = canvasRegistry[slug as keyof typeof canvasRegistry];
    if (spec.kind === "scene") out.push([slug, spec.scene]);
  }
  return out;
}

describe("scene frames", () => {
  const scene: Scene = {
    width: 420,
    height: 200,
    actors: [
      { id: "a", label: "A", sub: "start", x: 60, y: 100 },
      { id: "b", label: "B", x: 360, y: 100 },
    ],
    events: [
      { kind: "fly", at: 0, dur: 2, from: "a", to: "b", label: "hi" },
      { kind: "say", at: 2, actor: "b", text: "got it", tone: "good" },
      { kind: "wait", at: 2, dur: 1, actor: "b", label: "waiting {n} ms", doneLabel: "waited 8 ms", total: 8 },
      { kind: "verdict", at: 3, text: "Done", tone: "good" },
    ],
    loop: 4,
  };

  it("moves a message along its path and drops it on arrival", () => {
    expect(sceneFrame(scene, 0).packets[0]).toMatchObject({ x: 60, y: 100, label: "hi" });
    expect(sceneFrame(scene, 1).packets[0].x).toBeCloseTo(210);
    expect(sceneFrame(scene, 2).packets).toHaveLength(0);
  });

  it("changes what an actor says, counts a wait up, and ends on the verdict", () => {
    const mid = sceneFrame(scene, 2.5);
    expect(mid.actors.find((a) => a.id === "b")).toMatchObject({ sub: "got it", tone: "good" });
    expect(mid.waits[0]).toMatchObject({ progress: 0.5, label: "waiting 4.0 ms" });
    const end = sceneFrame(scene, 3.5);
    expect(end.waits[0].label).toBe("waited 8 ms");
    expect(end.verdict).toEqual({ text: "Done", tone: "good" });
  });

  it("loops, and treats a huge time as the final frame for reduced motion", () => {
    expect(loopTime(scene, 5)).toBeCloseTo(1);
    expect(loopTime(scene, 1e6)).toBe(4);
    expect(sceneFrame(scene, loopTime(scene, 1e6)).verdict?.text).toBe("Done");
  });
});

describe("system design scenes", () => {
  it("never draw two boxes over each other, at any moment, and keep actors inside the picture", () => {
    for (const [name, scene] of allScenes()) {
      expect(actorsInside(scene), name).toBe(true);
      for (let t = 0; t <= scene.loop; t += 0.25) {
        expect(frameCollisions(scene, sceneFrame(scene, t)), `${name} at ${t}s`).toEqual([]);
      }
    }
  });

  it("put every wait label on a pill that holds the text, and keep the pill clear of the boxes", () => {
    for (const [name, scene] of allScenes()) {
      for (let t = 0; t <= scene.loop; t += 0.25) {
        const frame = sceneFrame(scene, t);
        for (const w of frame.waits) {
          const actor = frame.actors.find((a) => a.id === w.actor)!;
          const text = waitLabelBox(actor, w.label);
          const pill = waitPillBox(actor, longestWaitLabel(scene, w.actor, w.label));
          expect(pill.left, `${name} at ${t}s`).toBeLessThanOrEqual(text.left);
          expect(pill.right, `${name} at ${t}s`).toBeGreaterThanOrEqual(text.right);
          expect(pill.top).toBeLessThanOrEqual(text.top);
          expect(pill.bottom).toBeGreaterThanOrEqual(text.bottom);
        }
      }
    }
  });

  it("place a message label only where it is clear of every card, and never over a card edge", () => {
    for (const [name, scene] of allScenes()) {
      for (let t = 0; t <= scene.loop; t += 0.2) {
        const frame = sceneFrame(scene, t);
        const tops = chipTops(scene, frame);
        const placed: ReturnType<typeof chipBox>[] = [];
        frame.packets.forEach((p, i) => {
          const top = tops[i];
          if (top === null) return;
          const box = chipBox(p, top);
          for (const other of placed) {
            const hit = box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom;
            expect(hit, `${name} at ${t}s: "${p.label}" over "${other.label}"`).toBe(false);
          }
          if (Math.max(0, Math.min(1, (Math.min(p.progress, 1 - p.progress) - 0.12) / 0.1)) > 0) placed.push(box);
          for (const a of frame.actors) {
            const c = actorBox(a);
            const hit = box.left < c.right && c.left < box.right && box.top < c.bottom && c.top < box.bottom;
            expect(hit, `${name} at ${t}s: "${p.label}" over ${a.label}`).toBe(false);
          }
        });
      }
    }
  });

  it("keep every second line short enough to fit inside its box", () => {
    for (const [name, scene] of allScenes()) {
      for (const a of scene.actors) expect((a.sub ?? "").length, `${name}: ${a.sub}`).toBeLessThanOrEqual(MAX_SUB_CHARS);
      for (const e of scene.events) if (e.kind === "say") expect(e.text.length, `${name}: ${e.text}`).toBeLessThanOrEqual(MAX_SUB_CHARS);
    }
  });

  it("keep the verdict line at the top clear of every box and its highlight ring", () => {
    for (const [name, scene] of allScenes()) {
      if (!scene.events.some((e) => e.kind === "verdict")) continue;
      for (const a of scene.actors) expect(a.y - BOX_H / 2 - 5, `${name}: ${a.id}`).toBeGreaterThanOrEqual(44);
    }
  });

  it("keep every verdict short enough for a phone", () => {
    for (const [name, scene] of allScenes()) {
      for (const e of scene.events) if (e.kind === "verdict") expect(e.text.length, `${name}: ${e.text}`).toBeLessThanOrEqual(38);
    }
  });

  it("tell the TrueTime story with the model's numbers", () => {
    const bug = sceneFrame(buildTrueTimeScene(4, false), 1e9);
    expect(bug.tags.map((t) => t.label)).toEqual(["s1 27.6", "s2 22.4"]);
    expect(bug.verdict).toEqual({ text: "Photo stamped before the unfriend", tone: "bad" });
    const fixed = buildTrueTimeScene(4, true);
    const end = sceneFrame(fixed, fixed.loop);
    expect(end.tags.map((t) => t.label)).toEqual(["s1 27.6", "s2 30.4"]);
    expect(end.waits[0].label).toBe("waited 8.0 ms");
    expect(end.verdict?.tone).toBe("good");
  });

  it("tell Amna's story the way the lag model says", () => {
    const any = buildLagScene("any");
    expect(sceneFrame(any, any.loop).verdict?.text).toBe("Her comment vanished, then came back");
    const leader = buildLagScene("leader");
    expect(sceneFrame(leader, leader.loop).verdict?.text).toBe("Always there; leader served 3 of 3");
    expect(sceneFrame(leader, leader.loop).actors.find((a) => a.id === "leader")?.sub).toBe("served 3 of 3");
    const token = buildLagScene("token");
    expect(sceneFrame(token, token.loop).verdict).toEqual({ text: "Always there; reads stay on replicas", tone: "good" });
  });
});

describe("beat models", () => {
  it("two clocks stamp .000 and .001 when the writes land", () => {
    expect(twoClocksFrame(0)).toMatchObject({ clockA: "11:59:59.994", stamped: false });
    expect(twoClocksFrame(1.2)).toMatchObject({ clockA: "12:00:00.000", clockB: "12:00:00.001", stamped: true });
    expect(twoClocksFrame(1e9).stamped).toBe(true);
  });

  it("the clock band always contains real time, and epsilon is bounded", () => {
    for (let t = 0; t < 30; t += 0.37) for (const eps of [1, 4, 10]) expect(clockBandFrame(t, eps).contains).toBe(true);
    expect(clampEpsilon(0)).toBe(1);
    expect(clampEpsilon(99)).toBe(10);
    expect(clampEpsilon(4.3)).toBe(4.5);
    expect(clampEpsilon(Number.NaN)).toBe(4);
  });

  it("bands overlap until the gap is more than 2 epsilon", () => {
    expect(bandOverlap(16, 20).order).toBe("unknown");
    expect(bandOverlap(16, 24).order).toBe("unknown"); // touching at exactly 2 eps
    expect(bandOverlap(16, 24.5).order).toBe("a-first");
    expect(bandOverlap(16, 7).order).toBe("b-first");
    expect(clampB(-5)).toBe(2);
  });

  it("replicas fill the leader's log later, by their lag", () => {
    const f = replicaBehindFrame(1e9, 600);
    expect(f).toMatchObject({ leader: 10, r1: 8, r2: 4, behindWrites: 6, r1LagMs: 150 });
    expect(replicaBehindFrame(1e9, 0)).toMatchObject({ leader: 10, r1: 10, r2: 10 });
    expect(clampLag(5000)).toBe(1500);
    expect(clampLag(Number.NaN)).toBe(600);
  });
});

describe("system design beat canvases render on the server", () => {
  it("renders every one without errors, with its limits fold", () => {
    expect(SYSDESIGN.length).toBeGreaterThanOrEqual(9);
    for (const slug of SYSDESIGN) {
      const html = renderToString(createElement(InteractiveCanvas, { slug })).replaceAll("<!-- -->", "");
      expect(html, slug).toContain("What this picture leaves out");
      expect(html, slug).toContain("<svg");
      expect(html, slug).not.toContain("not available right now");
    }
  }, 60_000);
});

describe("actor boxes hold their text", () => {
  const longNote = "where a running program keeps its list";

  it("keep the standard size while the name and note fit", () => {
    expect(nodeSize("Tracker", ["clock fast"])).toEqual({ w: BOX_W, h: BOX_H });
    expect(nodeSize("Disk", ["x".repeat(MAX_SUB_CHARS)])).toEqual({ w: BOX_W, h: BOX_H });
    expect(nodeSize("You")).toEqual({ w: BOX_W, h: BOX_H });
  });

  it("wrap a long note and grow, so every line fits inside the box", () => {
    for (const [label, note] of [["Memory", longNote], ["Methods", "getText(), markDone()"], ["Outside code", "the rest of the app"], ["Disk", "a-long-file-name.json here"]]) {
      const size = nodeSize(label, [note]);
      const lines = wrapLines(note, subCharsAt(size.w));
      expect(lines.join(" ")).toBe(note);
      expect(size.w, note).toBeLessThanOrEqual(MAX_BOX_W);
      expect(size.h, note).toBe(BOX_H + (lines.length - 1) * SUB_LINE_H);
      for (const line of lines) expect(line.length, `${note}: ${line}`).toBeLessThanOrEqual(subCharsAt(size.w));
    }
    expect(nodeSize("Memory", [longNote]).h).toBeGreaterThan(BOX_H);
  });

  it("widen for a name that is longer than the standard box", () => {
    expect(nodeSize("rice.markDone()", ["the call"]).w).toBeGreaterThan(BOX_W);
    expect(nodeSize("Private fields", []).w).toBeGreaterThan(BOX_W);
  });

  const scene: Scene = {
    width: 420,
    height: 200,
    actors: [
      { id: "memory", label: "Memory", kind: "note", sub: "empty", x: 375, y: 166 },
      { id: "you", label: "You", kind: "user", x: 60, y: 60 },
    ],
    events: [
      { kind: "fly", at: 0, dur: 1, from: "you", to: "memory", label: "add rice" },
      { kind: "say", at: 1, actor: "memory", text: longNote },
    ],
    loop: 3,
  };

  it("size a box for every note the story gives it, and keep it inside the picture", () => {
    const before = actorBox(sceneFrame(scene, 0).actors[0], scene);
    const after = actorBox(sceneFrame(scene, 2).actors[0], scene);
    expect(before).toEqual(after);
    expect(after.right - after.left).toBeGreaterThan(BOX_W);
    expect(after.bottom - after.top).toBeGreaterThan(BOX_H);
    expect(after.right).toBeLessThanOrEqual(scene.width);
    expect(after.bottom).toBeLessThanOrEqual(scene.height);
    expect(actorsInside(scene)).toBe(true);
    // An actor whose text fits is drawn exactly where it was.
    expect(actorBox(scene.actors[1], scene)).toEqual(actorBox(scene.actors[1]));
  });

  it("draw the long note on more than one line", () => {
    const html = renderToString(createElement(InteractiveCanvas, { renderer: "scene", data: { title: "Memory", purpose: "Where the list lives.", limits: "None.", scene: { ...scene, actors: [{ ...scene.actors[0], sub: longNote }, scene.actors[1]] } } })).replaceAll("<!-- -->", "");
    expect(html).not.toContain(`>${longNote}<`);
    expect(html).toContain(">where a running<");
    expect(html).toContain(">program keeps its list<");
  });
});

describe("balanced wrapping", () => {
  it("keeps the line count and evens the lines out, so no short word is left alone", () => {
    expect(wrapLines("files on the disk", 15)).toEqual(["files on the", "disk"]);
    expect(wrapBalanced("files on the disk", 15)).toEqual(["files on", "the disk"]);
    expect(wrapBalanced("clock fast", 15)).toEqual(["clock fast"]);
    expect(wrapBalanced("getText(), markDone()", 15)).toEqual(["getText(),", "markDone()"]);
    expect(wrapBalanced("", 15)).toEqual([]);
  });
});

describe("registered scenes after boxes learned to grow", () => {
  it("keep a name that fits in the standard box, as designed", () => {
    expect(nodeSize("Chat server", ["answers"])).toEqual({ w: BOX_W, h: BOX_H });
    expect(nodeSize("Tracker", ["answers"])).toEqual({ w: BOX_W, h: BOX_H });
  });

  it("stay inside their picture with no box over another", () => {
    for (const [slug, spec] of Object.entries(canvasRegistry)) {
      if (spec.kind !== "scene") continue;
      expect(actorsInside(spec.scene), slug).toBe(true);
      for (let t = 0; t <= spec.scene.loop; t += 0.5) expect(frameCollisions(spec.scene, sceneFrame(spec.scene, t)), `${slug} at ${t}s`).toEqual([]);
    }
  });
});
