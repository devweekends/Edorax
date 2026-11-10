// An architecture map as a pure model: blocks placed on a small canvas, each
// with the path a request takes from the start block to reach it. Breaking a
// block cuts off every block whose path runs through it, or that needs it;
// the links on those paths are the ones that fail. No React here.

import type { ActorKind } from "../renderers/scene/types";

export type MapFailure = {
  /** The banner when this block is broken, at most 38 characters. */
  verdict: string;
  /** Another block that takes the extra load, and what its pill says. */
  strain?: { block: string; status: string };
  /**
   * Blocks that stay up but feel this one go: each shows its own warning pill
   * (at most 15 characters), for example the app servers when the database is down.
   */
  affects?: { block: string; status: string }[];
};

/** Every block that shows an effect of this failure (not cut off), with its pill text. */
export function effectsOf(failure: MapFailure | undefined): { block: string; status: string }[] {
  return failure ? [...(failure.strain ? [failure.strain] : []), ...(failure.affects ?? [])] : [];
}

export type MapBlock = {
  id: string;
  label: string;
  kind: ActorKind;
  x: number;
  y: number;
  /** The pill under the name: its job in a few words (at most 15 characters). */
  role: string;
  /** Panel line 1: what it does. */
  does: string;
  /** Panel line 2: what happens when it fails. */
  fails: string;
  /** Panel line 3: the managed service with this job in AWS (or another cloud). */
  cloud: string;
  /** Block ids a request passes through to reach this block, starting at the start block and ending with this one. */
  path: string[];
  /** Blocks this one cannot work without that are not on its path, for example DNS. */
  needs?: string[];
  /** Leave out for a block that cannot be broken, such as the users. */
  failure?: MapFailure;
};

export type MapLink = [string, string];
/** Chapter data writes an extra link as { from, to }; canvases in code write a tuple. Both are read. */
export type MapLinkInput = MapLink | { from: string; to: string };

/** One extra link as a tuple, whichever way it was written. */
export function toMapLink(link: MapLinkInput): MapLink {
  return Array.isArray(link) ? [link[0], link[1]] : [link.from, link.to];
}

export const linkKey = (a: string, b: string) => [a, b].sort().join("~");

/** The links of one path, in order. */
export function pathLinks(path: string[]): MapLink[] {
  const out: MapLink[] = [];
  for (let i = 1; i < path.length; i++) out.push([path[i - 1], path[i]]);
  return out;
}

/** Every link to draw: each step of every path, plus any extra links, without repeats. */
export function mapLinks(blocks: MapBlock[], extra: MapLinkInput[] = []): MapLink[] {
  const seen = new Map<string, MapLink>();
  for (const b of blocks) for (const l of pathLinks(b.path)) seen.set(linkKey(...l), l);
  for (const raw of extra) {
    const l = toMapLink(raw);
    seen.set(linkKey(...l), l);
  }
  return [...seen.values()];
}

/** The broken block plus every block that cannot work without it. */
export function cutOff(blocks: MapBlock[], broken: string | null): Set<string> {
  const out = new Set<string>();
  if (!broken || !blocks.some((b) => b.id === broken)) return out;
  out.add(broken);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of blocks) {
      if (out.has(b.id)) continue;
      if (b.path.some((id) => out.has(id)) || (b.needs ?? []).some((id) => out.has(id))) {
        out.add(b.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * The links that fail: on the path to each cut-off block, every link from
 * the first cut-off block onward, plus any link between two cut-off blocks.
 */
export function failedLinks(blocks: MapBlock[], links: MapLink[], broken: string | null): Set<string> {
  const off = cutOff(blocks, broken);
  const out = new Set<string>();
  for (const b of blocks) {
    if (!off.has(b.id)) continue;
    const first = b.path.findIndex((id) => off.has(id));
    pathLinks(b.path.slice(Math.max(0, first - 1))).forEach((l) => out.add(linkKey(...l)));
  }
  for (const [a, b] of links) if (off.has(a) && off.has(b)) out.add(linkKey(a, b));
  return out;
}

/** How far along its path a request gets: the index of the first cut-off block, or null if it arrives. */
export function stopIndex(path: string[], off: Set<string>): number | null {
  const i = path.findIndex((id) => off.has(id));
  return i < 0 ? null : i;
}

export type Point = { x: number; y: number };

/**
 * The fraction of the segment a to b at which a dot reaches the edge of a
 * card of half-size hw by hh centred on b, plus a margin. Used to stop a
 * request at the edge of a broken block instead of inside it.
 */
export function edgeFraction(a: Point, b: Point, hw: number, hh: number, margin = 8): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const tx = dx > 0 ? (hw + margin) / dx : Infinity;
  const ty = dy > 0 ? (hh + margin) / dy : Infinity;
  return Math.max(0, 1 - Math.min(tx, ty, 1));
}

/** A point along a polyline, at t from 0 (first point) to 1 (last point), by hop count. */
export function alongRoute(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const hops = points.length - 1;
  const u = Math.max(0, Math.min(1, t)) * hops;
  const i = Math.min(hops - 1, Math.floor(u));
  const f = u - i;
  return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f };
}

/** Problems in a map that would break the picture: unknown ids, paths that do not end at their block, long text. */
export function checkMap(blocks: MapBlock[]): string[] {
  const ids = new Set(blocks.map((b) => b.id));
  const start = blocks[0]?.path[0];
  const problems: string[] = [];
  for (const b of blocks) {
    if (b.path[b.path.length - 1] !== b.id) problems.push(`${b.id}: path does not end at the block`);
    if (b.path[0] !== start) problems.push(`${b.id}: path does not begin at ${start}`);
    for (const id of [...b.path, ...(b.needs ?? []), ...effectsOf(b.failure).map((e) => e.block)]) if (!ids.has(id)) problems.push(`${b.id}: unknown block ${id}`);
    for (const e of effectsOf(b.failure)) if (e.status.length > 15) problems.push(`${b.id}: pill "${e.status}" longer than 15 characters`);
    if (b.role.length > 15) problems.push(`${b.id}: role longer than 15 characters`);
    if (b.failure && b.failure.verdict.length > 38) problems.push(`${b.id}: verdict longer than 38 characters`);
  }
  return problems;
}
