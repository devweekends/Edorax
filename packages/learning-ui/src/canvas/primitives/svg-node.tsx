import type { ComponentType, SVGProps } from "react";
import { Clock, Cpu, Database, FileText, Globe, ListOrdered, Router, Server, Smartphone, User, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import { BOX_H, BOX_W, SUB_LINE_H, nodeSize, subCharsAt, wrapLines } from "../renderers/scene/geometry";
import type { ActorKind } from "../renderers/scene/types";
import { NEUTRAL, TONES, type Tone } from "./tones";

// One actor in a beat picture: an icon card with a name and a status pill.
// Shared by the scene renderer and the custom beat canvases, so a server,
// a phone or a database looks the same in every course. The card keeps its
// standard size while the text fits; a longer name or status makes it grow
// (the status wraps), so text never spills out of the card.

export const NODE_W = BOX_W;
export const NODE_H = BOX_H;

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

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
  // Not a machine: a feature list, a plan, a limit the design must meet.
  note: FileText,
};

/** Icon badge colour per kind: one quiet tint each, so kinds are easy to tell apart. */
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

type SvgNodeProps = {
  x: number;
  y: number;
  label: string;
  kind?: ActorKind;
  status?: string;
  statusTone?: Tone;
  /** 0 to 1: a soft accent wash when a message has just arrived. */
  arrival?: number;
  /** A ring around the card for "this is the one that matters". */
  mark?: Tone;
  markOpacity?: number;
  /** Cross-fade from the previous status. */
  statusOpacity?: number;
  previousStatus?: string;
  previousTone?: Tone;
  /** Opacity for the status text, so it can fade at a loop boundary. */
  layerOpacity?: number;
  /** The card's size when the caller has worked it out (see nodeSize); otherwise it comes from the text shown now. */
  width?: number;
  height?: number;
  /** The card's top-left corner when the caller has placed it; otherwise the card is centred on x and hangs from the standard top edge. */
  left?: number;
  top?: number;
};

export function SvgNode({
  x,
  y,
  label,
  kind = "server",
  status,
  statusTone,
  arrival = 0,
  mark,
  markOpacity = 1,
  statusOpacity = 1,
  previousStatus,
  previousTone,
  layerOpacity = 1,
  width,
  height,
  left: placedLeft,
  top: placedTop,
}: SvgNodeProps) {
  const fit = nodeSize(label, [status, previousStatus]);
  const w = width ?? fit.w;
  const h = height ?? fit.h;
  const left = placedLeft ?? x - w / 2;
  const top = placedTop ?? y - NODE_H / 2;
  const cx = left + w / 2;
  const IconCmp = ICONS[kind];
  const pill = (text: string, tone: Tone | undefined, opacity: number) => {
    const lines = wrapLines(text, subCharsAt(w));
    return (
      <g opacity={opacity}>
        <rect x={left + 7} y={top + 33} width={w - 14} height={20 + (lines.length - 1) * SUB_LINE_H} rx={10} className={tone ? TONES[tone].softFill : "fill-muted"} />
        {lines.map((line, i) => (
          <text key={i} x={cx} y={top + 47 + i * SUB_LINE_H} textAnchor="middle" className={cn(tone ? TONES[tone].text : NEUTRAL.mutedText, "text-[11.5px] font-semibold")}>
            {line}
          </text>
        ))}
      </g>
    );
  };
  return (
    <g>
      {mark ? (
        <rect x={left - 5} y={top - 5} width={w + 10} height={h + 10} rx={19} opacity={markOpacity} className={cn("fill-none", TONES[mark].stroke)} strokeWidth={2.5} />
      ) : null}
      {/* A soft drop shadow drawn as an offset shape, without filters. */}
      <rect x={left} y={top + 3} width={w} height={h} rx={14} className="fill-foreground/[0.06]" />
      <rect x={left} y={top} width={w} height={h} rx={14} className={cn(NEUTRAL.surface, NEUTRAL.line)} strokeWidth={1.5} />
      {arrival > 0 ? <rect x={left} y={top} width={w} height={h} rx={14} opacity={arrival} className={cn(TONES.accent.softFill, TONES.accent.stroke)} strokeWidth={2} /> : null}
      <circle cx={left + 17} cy={top + 16} r={11} className={BADGE[kind]} />
      <IconCmp x={left + 9} y={top + 8} width={16} height={16} strokeWidth={2} className={ICON_COLOUR[kind]} aria-hidden />
      <text x={left + 33} y={top + 21} className={cn(NEUTRAL.text, "text-[13px] font-semibold")}>
        {label}
      </text>
      <g opacity={layerOpacity}>
        {previousStatus && statusOpacity < 1 ? pill(previousStatus, previousTone, 1 - statusOpacity) : null}
        {status ? pill(status, statusTone, statusOpacity) : null}
      </g>
    </g>
  );
}
