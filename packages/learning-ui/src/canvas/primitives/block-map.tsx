"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { Clock, Cpu, Database, FileText, Globe, ListOrdered, Router, Server, Smartphone, User, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import { BeatButton, BeatFrame } from "./beat-frame";
import { DotGrid, VerdictBanner } from "./svg-parts";
import { FOCUS_RING, NEUTRAL, TONES, type Tone } from "./tones";
import { useBeatClock } from "./use-beat-clock";
import { fitOneLine } from "../renderers/scene/geometry";
import type { ActorKind } from "../renderers/scene/types";
import {
  alongRoute,
  cutOff,
  edgeFraction,
  effectsOf,
  failedLinks,
  linkKey,
  mapLinks,
  pathLinks,
  stopIndex,
  type MapBlock,
  type MapLinkInput,
  type Point,
} from "../models/block-map";

// A playable architecture map. Tap a block: it lights up, so does the path a
// request takes to reach it, a request travels that path, and a panel under
// the picture says what the block does, how it fails and its cloud name.
// "Break it" breaks the selected block: it turns red, every path that needs
// it turns dashed red, and the banner says what users lose. Any course can
// use it with its own blocks.

export type BlockMapConfig = {
  blocks: MapBlock[];
  /** Links that are not a step on any block's path, for example workers to file storage. */
  links?: MapLinkInput[];
  /** viewBox height; the width is always 420. */
  height: number;
  /** The block selected when the picture first shows. */
  defaultSelected: string;
  /** The heading of the panel's third line, for example "In AWS". */
  cloudLabel: string;
};

const W = 420;
/** A compact SvgNode: the same look, smaller, so ten or more blocks fit on a phone. */
export const MAP_CARD_W = 120;
export const MAP_CARD_H = 50;
/** Tap targets reach past the card so they stay at least 44 px tall on a phone. */
const TAP_PAD_X = 4;
const TAP_PAD_Y = 7;
const HOP_S = 0.5;
const DWELL_S = 1.1;

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

// Same icons and tints as primitives/svg-node.tsx, so a block reads as the same kind of thing everywhere.
const ICONS: Record<ActorKind, Icon> = {
  user: User,
  phone: Smartphone,
  server: Server,
  database: Database,
  router: Router,
  cache: Zap,
  queue: ListOrdered,
  cdn: Globe,
  clock: Clock,
  worker: Cpu,
  note: FileText,
};
const BADGE: Record<ActorKind, string> = {
  user: "fill-violet-100 dark:fill-violet-500/20",
  phone: "fill-violet-100 dark:fill-violet-500/20",
  server: "fill-blue-100 dark:fill-blue-500/20",
  database: "fill-emerald-100 dark:fill-emerald-500/20",
  router: "fill-sky-100 dark:fill-sky-500/20",
  cache: "fill-amber-100 dark:fill-amber-500/20",
  queue: "fill-orange-100 dark:fill-orange-500/20",
  cdn: "fill-sky-100 dark:fill-sky-500/20",
  clock: "fill-slate-200 dark:fill-slate-500/25",
  worker: "fill-blue-100 dark:fill-blue-500/20",
  note: "fill-stone-200 dark:fill-stone-500/25",
};
const ICON_COLOUR: Record<ActorKind, string> = {
  user: "text-violet-700 dark:text-violet-300",
  phone: "text-violet-700 dark:text-violet-300",
  server: "text-blue-700 dark:text-blue-300",
  database: "text-emerald-700 dark:text-emerald-300",
  router: "text-sky-700 dark:text-sky-300",
  cache: "text-amber-700 dark:text-amber-300",
  queue: "text-orange-700 dark:text-orange-300",
  cdn: "text-sky-700 dark:text-sky-300",
  clock: "text-slate-700 dark:text-slate-300",
  worker: "text-blue-700 dark:text-blue-300",
  note: "text-stone-700 dark:text-stone-300",
};

type CardProps = {
  block: MapBlock;
  status: string;
  tone?: Tone;
  selected: boolean;
  broken: boolean;
  dim: boolean;
  arrival: number;
};

function MapCard({ block, status, tone, selected, broken, dim, arrival }: CardProps) {
  const left = block.x - MAP_CARD_W / 2;
  const top = block.y - MAP_CARD_H / 2;
  const IconCmp = ICONS[block.kind];
  // A name or note longer than the card is drawn smaller, so it stays inside the card.
  const name = fitOneLine(block.label, 12.5, MAP_CARD_W - 31 - 5);
  const note = fitOneLine(status, 11.5, MAP_CARD_W - 12 - 8);
  return (
    <g opacity={dim ? 0.6 : 1}>
      {selected ? (
        <rect x={left - 4} y={top - 4} width={MAP_CARD_W + 8} height={MAP_CARD_H + 8} rx={17} className={cn("fill-none", broken ? TONES.bad.stroke : TONES.accent.stroke)} strokeWidth={2.5} />
      ) : null}
      <rect x={left} y={top + 3} width={MAP_CARD_W} height={MAP_CARD_H} rx={13} className="fill-foreground/[0.06]" />
      <rect x={left} y={top} width={MAP_CARD_W} height={MAP_CARD_H} rx={13} className={cn(NEUTRAL.surface, broken ? TONES.bad.stroke : NEUTRAL.line)} strokeWidth={broken ? 2 : 1.5} />
      {broken ? <rect x={left} y={top} width={MAP_CARD_W} height={MAP_CARD_H} rx={13} className={TONES.bad.softFill} /> : null}
      {arrival > 0 && !broken ? <rect x={left} y={top} width={MAP_CARD_W} height={MAP_CARD_H} rx={13} opacity={arrival} className={cn(TONES.accent.softFill, TONES.accent.stroke)} strokeWidth={2} /> : null}
      <circle cx={left + 16} cy={top + 15} r={10.5} className={BADGE[block.kind]} />
      <IconCmp x={left + 8.5} y={top + 7.5} width={15} height={15} strokeWidth={2} className={ICON_COLOUR[block.kind]} aria-hidden />
      <text x={left + 31} y={top + 19.5} fontSize={name.size} textLength={name.textLength} lengthAdjust={name.textLength ? "spacingAndGlyphs" : undefined} className={cn(NEUTRAL.text, "font-semibold")}>{block.label}</text>
      <rect x={left + 6} y={top + 27} width={MAP_CARD_W - 12} height={18} rx={9} className={tone ? TONES[tone].softFill : "fill-muted"} />
      <text x={block.x} y={top + 40} textAnchor="middle" fontSize={note.size} textLength={note.textLength} lengthAdjust={note.textLength ? "spacingAndGlyphs" : undefined} className={cn(tone ? TONES[tone].text : NEUTRAL.mutedText, "font-semibold")}>{status}</text>
    </g>
  );
}

/** The banner across the top ends at 38; a card and its selection ring start no higher than this. */
const BANNER_CLEAR = 46;

/** How far to move every card down so the highest one is clear of the banner. */
export function mapLift(blocks: { y: number }[]): number {
  if (blocks.length === 0) return 0;
  return Math.max(0, Math.ceil(BANNER_CLEAR - Math.min(...blocks.map((b) => b.y - MAP_CARD_H / 2 - 5))));
}

export function BlockMap({ title, limits, blocks: placed, links: extra = [], height: givenHeight, defaultSelected, cloudLabel }: BlockMapConfig & { title: string; limits: string }) {
  // A map whose top card was placed under the banner is moved down as a whole, and the picture grows by the same amount.
  const lift = mapLift(placed);
  const blocks = lift ? placed.map((b) => ({ ...b, y: b.y + lift })) : placed;
  const height = givenHeight + lift;
  const ref = useRef<HTMLDivElement>(null);
  const clock = useBeatClock(ref);
  const { restart } = clock;
  const [selected, setSelected] = useState(defaultSelected);
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => {
    restart();
  }, [selected, broken, restart]);

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const sel = byId.get(selected) ?? blocks[0];
  const links = mapLinks(blocks, extra);
  const off = cutOff(blocks, broken);
  const failed = failedLinks(blocks, links, broken);
  const brokenBlock = broken ? byId.get(broken) : undefined;
  const effects = effectsOf(brokenBlock?.failure);

  // The request's route: the selected block's path, cut short at the first block that is down.
  const stop = stopIndex(sel.path, off);
  const reach = stop === null ? sel.path : sel.path.slice(0, stop + 1);
  const points: Point[] = reach.map((id) => byId.get(id) ?? { x: 0, y: 0 });
  let travelHops = Math.max(0, points.length - 1);
  if (stop !== null && points.length >= 2) {
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    const f = edgeFraction(a, b, MAP_CARD_W / 2, MAP_CARD_H / 2);
    points[points.length - 1] = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    travelHops = points.length - 2 + f;
  }
  const travel = travelHops * HOP_S;
  const loop = travel + DWELL_S;
  const t = clock.reduced ? travel : clock.seconds % loop;
  const moving = points.length >= 2 && t < travel;
  const at = (s: number) => alongRoute(points, travel > 0 ? Math.max(0, s) / travel : 1);
  const packet = points.length >= 2 ? at(Math.min(t, travel)) : null;
  const stopped = stop !== null;

  const lit = new Set(pathLinks(reach).map((l) => linkKey(...l)));
  const arrivalOf = (id: string) => {
    if (stopped) return 0;
    const i = reach.indexOf(id);
    if (i < 1) return 0;
    const when = i * HOP_S;
    if (t < when - 0.05) return 0;
    if (i === reach.length - 1) return clock.reduced ? 1 : Math.max(0, 1 - (t - when) / (DWELL_S + 0.4));
    return Math.max(0, 1 - (t - when) / 0.5);
  };

  const verdict: { text: string; tone: Tone } = brokenBlock?.failure
    ? { text: brokenBlock.failure.verdict, tone: "bad" }
    : { text: `${sel.label}: ${sel.role}`, tone: "accent" };

  const canBreak = Boolean(sel.failure);
  const toggleBreak = () => setBroken((b) => (b === sel.id ? null : sel.id));
  const control = canBreak ? (
    <BeatButton pressed={broken === sel.id} onClick={toggleBreak}>
      Break it
    </BeatButton>
  ) : broken ? (
    <BeatButton onClick={() => setBroken(null)}>Fix it</BeatButton>
  ) : null;
  const hint = broken ? (canBreak && broken === sel.id ? "Tap Break it again to fix it." : "Tap other blocks to see what still works.") : "Tap any block, then Break it.";

  const statusOf = (b: MapBlock): { text: string; tone?: Tone } => {
    if (b.id === broken) return { text: "down", tone: "bad" };
    if (off.has(b.id)) return { text: "cut off", tone: "warn" };
    const effect = effects.find((e) => e.block === b.id);
    if (effect) return { text: effect.status, tone: "warn" };
    return { text: b.role };
  };

  const describe = [
    verdict.text,
    `Selected: ${sel.label}.`,
    stopped ? `A request to it stops at ${byId.get(reach[reach.length - 1])?.label}.` : sel.path.length > 1 ? `A request goes ${sel.path.map((id) => byId.get(id)?.label).join(", then ")}.` : "",
  ].join(" ");

  return (
    <BeatFrame label={title} limits={limits} hint={hint} controls={control}>
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={describe} className="block h-auto w-full select-none">
          <DotGrid width={W} height={height} />

          {links.map(([a, b]) => {
            const from = byId.get(a);
            const to = byId.get(b);
            if (!from || !to) return null;
            const key = linkKey(a, b);
            const bad = failed.has(key);
            const on = lit.has(key);
            return (
              <line
                key={key}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={bad || on ? 2.5 : 1.5}
                strokeDasharray={bad ? "6 5" : undefined}
                strokeLinecap="round"
                className={cn("transition-colors duration-200 motion-reduce:transition-none", bad ? TONES.bad.stroke : on ? TONES.accent.stroke : NEUTRAL.faintStroke)}
              />
            );
          })}

          {/* The request travels under the cards, so it leaves one block and vanishes into the next. */}
          {packet ? (
            <g>
              {moving
                ? [0.05, 0.1].map((dt, i) => {
                    const p = at(t - dt);
                    return <circle key={dt} cx={p.x} cy={p.y} r={5.5 - i * 1.5} opacity={0.35 - i * 0.12} className={TONES.accent.solidFill} />;
                  })
                : null}
              <g transform={`translate(${packet.x} ${packet.y})`} opacity={moving || stopped ? 1 : Math.max(0, 1 - (t - travel) / 0.3)}>
                <circle r={7.5} className={stopped && !moving ? TONES.bad.solidFill : TONES.accent.solidFill} />
                <circle r={2.8} className="fill-card" />
              </g>
            </g>
          ) : null}

          {blocks.map((b) => {
            const s = statusOf(b);
            return (
              <MapCard
                key={b.id}
                block={b}
                status={s.text}
                tone={s.tone}
                selected={b.id === sel.id}
                broken={b.id === broken}
                dim={off.has(b.id) && b.id !== broken}
                arrival={arrivalOf(b.id)}
              />
            );
          })}

          <VerdictBanner width={W} text={verdict.text} tone={verdict.tone} />
        </svg>

        {/* Real buttons over the cards: tap, Tab between blocks, Enter or Space selects. */}
        {blocks.map((b) => {
          const left = b.x - MAP_CARD_W / 2 - TAP_PAD_X;
          const top = b.y - MAP_CARD_H / 2 - TAP_PAD_Y;
          const state = b.id === broken ? ", down" : off.has(b.id) ? ", cut off" : effects.some((e) => e.block === b.id) ? `, ${statusOf(b).text}` : "";
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === sel.id}
              aria-label={`${b.label}: ${b.role}${state}`}
              onClick={() => setSelected(b.id)}
              className={cn("absolute cursor-pointer rounded-[17px]", FOCUS_RING)}
              style={{
                left: `${(left / W) * 100}%`,
                top: `${(top / height) * 100}%`,
                width: `${((MAP_CARD_W + 2 * TAP_PAD_X) / W) * 100}%`,
                height: `${((MAP_CARD_H + 2 * TAP_PAD_Y) / height) * 100}%`,
              }}
            />
          );
        })}
      </div>

      {/* The panel: three short lines about the selected block. */}
      <div aria-live="polite" className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm leading-snug text-foreground">
        <p className="font-semibold">{sel.label}</p>
        <p className="mt-1"><span className="font-semibold text-muted-foreground">What it does: </span>{sel.does}</p>
        <p className="mt-0.5"><span className="font-semibold text-muted-foreground">When it fails: </span>{sel.fails}</p>
        <p className="mt-0.5"><span className="font-semibold text-muted-foreground">{cloudLabel}: </span>{sel.cloud}</p>
      </div>
    </BeatFrame>
  );
}
