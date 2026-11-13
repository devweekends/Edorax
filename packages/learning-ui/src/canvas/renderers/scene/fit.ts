import { actorBox, BOX_H } from "./geometry";
import type { Scene } from "./types";

// A scene's boxes are placed by hand. Four boxes of 112 in a row of a 420 wide
// picture cannot fit, and a box placed 45 from the left edge starts outside
// it. The renderer used to draw exactly what it was given, so such boxes were
// drawn over each other and cut by the edge. This pass keeps the author's
// arrangement and spreads it out just enough: the picture gets wider or
// taller, and the browser scales the whole of it to the column.

/** Clear space kept between two boxes, and between a box and the picture's edge. */
export const FIT_GAP = 8;
export const FIT_EDGE = 6;
/** Beyond this the arrangement is not a near miss, and spreading it would only make a tiny picture. */
const MAX_SPREAD = 3;

export type FitBox = { x: number; top: number; w: number; h: number };

export type Spread = { kx: number; ky: number; dx: number; dy: number; width: number; height: number };

const IDENTITY = (width: number, height: number): Spread => ({ kx: 1, ky: 1, dx: 0, dy: 0, width, height });

/**
 * How to move boxes (centred on x, hanging from `top`) so that none covers
 * another and all sit inside the picture: scale the positions apart by kx and
 * ky, shift by dx and dy, and use the returned picture size. Each pair that
 * collides is separated along the axis that needs the smaller stretch, so a
 * row spreads sideways and a column spreads downward.
 */
export function spreadBoxes(boxes: FitBox[], width: number, height: number): Spread {
  if (boxes.length === 0) return IDENTITY(width, height);
  let kx = 1;
  let ky = 1;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const needX = (a.w + b.w) / 2 + FIT_GAP;
      const gapX = Math.abs(a.x - b.x);
      // Tops, not centres: boxes hang from their top edge and may differ in height.
      const [upper, lower] = a.top <= b.top ? [a, b] : [b, a];
      const needY = upper.h + FIT_GAP;
      const gapY = lower.top - upper.top;
      // Only boxes that really cover each other are moved; boxes that merely sit close are the author's choice.
      if (gapX >= needX - FIT_GAP || gapY >= needY - FIT_GAP) continue;
      const stretchX = gapX > 0 ? needX / gapX : Infinity;
      const stretchY = gapY > 0 ? needY / gapY : Infinity;
      if (stretchX <= stretchY) kx = Math.max(kx, stretchX);
      else ky = Math.max(ky, stretchY);
    }
  }
  if (!Number.isFinite(kx) || !Number.isFinite(ky) || kx > MAX_SPREAD || ky > MAX_SPREAD) {
    kx = Math.min(Number.isFinite(kx) ? kx : 1, MAX_SPREAD);
    ky = Math.min(Number.isFinite(ky) ? ky : 1, MAX_SPREAD);
  }
  const left = Math.min(...boxes.map((b) => b.x * kx - b.w / 2));
  const right = Math.max(...boxes.map((b) => b.x * kx + b.w / 2));
  const top = Math.min(...boxes.map((b) => b.top * ky));
  const bottom = Math.max(...boxes.map((b) => b.top * ky + b.h));
  const dx = left < 0 ? FIT_EDGE - left : 0;
  const dy = top < 0 ? FIT_EDGE - top : 0;
  const spread = {
    kx,
    ky,
    dx,
    dy,
    width: Math.ceil(Math.max(width * kx + dx, right + dx > width * kx + dx ? right + dx + FIT_EDGE : 0)),
    height: Math.ceil(Math.max(height * ky + dy, bottom + dy > height * ky + dy ? bottom + dy + FIT_EDGE : 0)),
  };
  // Nothing to do: hand back the picture's own size, so a well laid out picture is drawn exactly as before.
  if (kx === 1 && ky === 1 && dx === 0 && dy === 0 && spread.width <= width && spread.height <= height) return IDENTITY(width, height);
  return spread;
}

const fitted = new WeakMap<Scene, Scene>();

/**
 * The scene with its boxes spread so none covers another or leaves the
 * picture. A scene that already fits is returned as it is (the same object).
 */
export function fitScene(scene: Scene): Scene {
  const known = fitted.get(scene);
  if (known) return known;
  // Where each box is really drawn: a box that grew for its text is already nudged back inside the picture.
  const drawn = scene.actors.map((a) => actorBox(a, scene));
  const boxes = drawn.map((b) => ({ x: (b.left + b.right) / 2, top: b.top, w: b.right - b.left, h: b.bottom - b.top }));
  const s = spreadBoxes(boxes, scene.width, scene.height);
  let result = scene;
  if (s.kx !== 1 || s.ky !== 1 || s.dx !== 0 || s.dy !== 0 || s.width !== scene.width || s.height !== scene.height) {
    // A box hangs from y - BOX_H / 2, so the top edge is what moves; the centre follows.
    const moveY = (y: number) => (y - BOX_H / 2) * s.ky + s.dy + BOX_H / 2;
    result = {
      ...scene,
      width: s.width,
      height: s.height,
      actors: scene.actors.map((a, i) => ({ ...a, x: boxes[i].x * s.kx + s.dx, y: moveY(boxes[i].top + BOX_H / 2) })),
      strip: scene.strip ? { ...scene.strip, y: scene.strip.y * s.ky + s.dy } : undefined,
    };
  }
  fitted.set(scene, result);
  return result;
}
