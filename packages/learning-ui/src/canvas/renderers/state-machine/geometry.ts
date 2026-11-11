import { wrapBalanced } from "../scene/geometry";
import type { MachineEdge, StateMachineSpec } from "./types";

// Two fixed layouts, like the sequence diagram. The wide one draws the grid as
// authored. The narrow one turns it on its side (columns become rows), so a
// left-to-right lifecycle becomes a top-to-bottom one that fits a phone with
// room for labels beside it, and nothing scrolls sideways.

export type MachineLayout = "narrow" | "wide";

const LAYOUT = {
  narrow: { width: 340, pillW: 128, pillH: 46, gapAlong: 112, gapAcross: 150, nameSize: 13, subSize: 10.5, labelSize: 11, charW: 6.3 },
  wide: { width: 640, pillW: 128, pillH: 48, gapAlong: 130, gapAcross: 0, nameSize: 13.5, subSize: 11, labelSize: 11.5, charW: 6.6 },
} as const;

const LOOP_ROOM = 58;

type Pt = [number, number];

export type EdgeShape = {
  d: string;
  /** Middle of the edge: where the label sits and where the still dot rests. */
  mid: Pt;
  labelAnchor: "middle" | "start";
};

export function machineGeometry(spec: StateMachineSpec, layout: MachineLayout) {
  const L = LAYOUT[layout];
  const cols = Math.max(1, ...spec.states.map((s) => s.col + 1));
  const rows = Math.max(1, ...spec.states.map((s) => s.row + 1));
  // Pills narrow when more of them share the width than the standard pill allows, so they never
  // overlap or leave the picture. A name or second line wider than its pill wraps, and every pill
  // grows to the tallest one. The second line is monospace, 0.6 of its size per character.
  const across = layout === "wide" ? cols : rows;
  const pillW = Math.min(L.pillW, (L.width - 12 - (across - 1) * 8) / across);
  const nameChars = Math.max(4, Math.floor((pillW - 12) / (L.nameSize * 0.56)));
  const subChars = Math.max(4, Math.floor((pillW - 12) / (L.subSize * 0.6)));
  const nameLh = L.nameSize + 2;
  const subLh = L.subSize + 2;
  const wrapped = new Map(spec.states.map((s) => [s.id, { name: wrapBalanced(s.name, nameChars), sub: s.sub ? wrapBalanced(s.sub, subChars) : [] }]));
  const most = (pick: (w: { name: string[]; sub: string[] }) => number) => Math.max(1, ...[...wrapped.values()].map(pick));
  const grow = (most((w) => w.name.length) - 1) * nameLh + (most((w) => w.sub.length) - 1) * subLh;
  const pillH = L.pillH + grow;
  const gapAlong = L.gapAlong + grow;
  const halfW = pillW / 2;
  const halfH = pillH / 2;
  /** Baselines of one state's lines, centred in its pill as a block. */
  const stateLines = (id: string, cy: number) => {
    const w = wrapped.get(id) ?? { name: [], sub: [] };
    const start = cy - (w.name.length * nameLh + w.sub.length * subLh) / 2;
    // One word too long to wrap is drawn to the pill's width instead.
    const held = (text: string, chars: number) => (text.length > chars ? pillW - 12 : undefined);
    return {
      name: w.name.map((text, k) => ({ text, y: start + (w.sub.length ? 11.25 : 12.25) + k * nameLh, textLength: held(text, nameChars) })),
      sub: w.sub.map((text, k) => ({ text, y: start + w.name.length * nameLh + 11.75 + k * subLh, textLength: held(text, subChars) })),
    };
  };

  let place: (col: number, row: number) => Pt;
  let height: number;

  if (layout === "wide") {
    const margin = halfW + 8;
    const colGap = cols > 1 ? (L.width - 2 * margin) / (cols - 1) : 0;
    const top = halfH + LOOP_ROOM;
    place = (col, row) => [cols > 1 ? margin + col * colGap : L.width / 2, top + row * gapAlong];
    height = top + (rows - 1) * gapAlong + halfH + 14;
  } else {
    // Columns run down the page; rows step to the right.
    const left = halfW + 6;
    const top = halfH + 10;
    const gapAcross = rows > 1 ? Math.min(L.gapAcross, (L.width - 12 - pillW) / (rows - 1)) : 0;
    place = (col, row) => [left + row * gapAcross, top + col * gapAlong];
    height = top + (cols - 1) * gapAlong + halfH + 14;
  }

  const byId = new Map(spec.states.map((s) => [s.id, { ...s, at: place(s.col, s.row) }]));

  /** Where the line from a pill's centre towards `to` leaves the pill. */
  const exitPoint = (from: Pt, to: Pt, pad: number): Pt => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const tx = dx === 0 ? Infinity : (halfW + pad) / Math.abs(dx);
    const ty = dy === 0 ? Infinity : (halfH + pad) / Math.abs(dy);
    const t = Math.min(tx, ty);
    return [from[0] + dx * t, from[1] + dy * t];
  };

  const hasReverse = (e: MachineEdge) => spec.edges.some((o) => o.from === e.to && o.to === e.from && o.from !== o.to);

  function edge(e: MachineEdge): EdgeShape | null {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return null;
    const [ax, ay] = a.at;

    if (e.from === e.to) {
      if (layout === "wide") {
        // A loop over the top of the pill.
        const y = ay - halfH;
        return {
          d: `M ${ax - 30} ${y} C ${ax - 48} ${y - 62}, ${ax + 48} ${y - 62}, ${ax + 30} ${y - 3}`,
          mid: [ax, y - 46],
          labelAnchor: "middle",
        };
      }
      // A loop off the right side of the pill, with the label beyond it.
      const x = ax + halfW;
      return {
        d: `M ${x} ${ay - 12} C ${x + 46} ${ay - 26}, ${x + 46} ${ay + 26}, ${x + 3} ${ay + 12}`,
        mid: [x + 40, ay],
        labelAnchor: "start",
      };
    }

    let start = exitPoint(a.at, b.at, 0);
    let end = exitPoint(b.at, a.at, 3);
    if (hasReverse(e)) {
      // Two edges between the same pair: nudge each to its own side.
      const dx = b.at[0] - ax;
      const dy = b.at[1] - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 7;
      const ny = (dx / len) * 7;
      start = [start[0] + nx, start[1] + ny];
      end = [end[0] + nx, end[1] + ny];
    }
    const mid: Pt = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const vertical = Math.abs(end[0] - start[0]) < 1;
    return {
      d: `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`,
      mid,
      labelAnchor: layout === "narrow" && vertical ? "start" : "middle",
    };
  }

  /** Label box for an edge, kept inside the picture. */
  function labelBox(e: MachineEdge, shape: EdgeShape) {
    const w = e.label.length * L.charW + 14;
    const h = 20;
    if (shape.labelAnchor === "start") {
      // Beside a vertical edge or a side loop, never on top of the line.
      const x = Math.min(shape.mid[0] + 10, L.width - w - 2);
      return { x, y: shape.mid[1] - h / 2, w, h };
    }
    const x = Math.max(2, Math.min(L.width - w - 2, shape.mid[0] - w / 2));
    return { x, y: shape.mid[1] - h / 2, w, h };
  }

  return { ...L, pillW, pillH, height, byId, edge, labelBox, halfW, halfH, stateLines };
}
