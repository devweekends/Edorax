import { useId } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/utils";
import { wrapBalanced } from "../renderers/scene/geometry";
import { TONES, type Tone } from "./tones";

// Small SVG pieces every beat picture shares, so all of them read as one family.

/** A soft dotted canvas behind the picture. Draw it first. */
export function DotGrid({ width, height }: { width: number; height: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <defs>
        <pattern id={id} width={16} height={16} patternUnits="userSpaceOnUse">
          <circle cx={1.5} cy={1.5} r={1} className="fill-muted-foreground/20" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </>
  );
}

const VERDICT_ICON: Record<Tone, typeof CircleCheck> = { good: CircleCheck, bad: CircleX, warn: TriangleAlert, accent: Info };

const BANNER_PX = 14.5;
const BANNER_MIN_PX = 12;
/** Advance per character of the banner's bold text, per pixel of font size. */
const BANNER_CHAR_EM = 8.3 / BANNER_PX;

/**
 * How a banner's words fit a picture this wide: full size on one line when
 * they fit, then a smaller size, then two or more lines at the smallest size.
 * The words are never cut and never run past the picture's edge.
 */
export function bannerFit(width: number, text: string): { size: number; lines: string[]; w: number; h: number } {
  const room = width - 16 - 46;
  const widthAt = (chars: number, size: number) => chars * BANNER_CHAR_EM * size;
  let size = BANNER_PX;
  let lines = [text];
  if (widthAt(text.length, size) > room) {
    size = Math.max(BANNER_MIN_PX, (BANNER_PX * room) / widthAt(text.length, BANNER_PX));
    if (widthAt(text.length, size) > room + 0.5) {
      size = BANNER_MIN_PX;
      lines = wrapBalanced(text, Math.floor(room / widthAt(1, size)));
    }
  }
  const longest = Math.max(0, ...lines.map((line) => line.length));
  return { size, lines, w: Math.min(width - 16, widthAt(longest, size) + 46), h: lines.length > 1 ? 10 + lines.length * 14 : 30 };
}

/** The result of the picture, as a banner across the top with an icon and words. */
export function VerdictBanner({ width, text, tone, opacity = 1, y = 8 }: { width: number; text: string; tone: Tone; opacity?: number; y?: number }) {
  const fit = bannerFit(width, text);
  const w = fit.w;
  const left = (width - w) / 2;
  // A taller banner grows upward a little, so it stays clear of the picture under it.
  const top = fit.lines.length > 1 ? Math.max(2, y - 2) : y;
  const t = TONES[tone];
  const IconCmp = VERDICT_ICON[tone];
  return (
    <g opacity={opacity} transform={`translate(0 ${-4 * (1 - opacity)})`}>
      {/* An opaque card under the tint, so the banner never reads faint over the dots. */}
      <rect x={left} y={top} width={w} height={fit.h} rx={15} className="fill-card" />
      <rect x={left} y={top} width={w} height={fit.h} rx={15} className={cn(t.softFill, t.stroke)} strokeWidth={2} />
      <IconCmp x={left + 10} y={top + fit.h / 2 - 8} width={16} height={16} strokeWidth={2.25} className={cn(t.stroke, "fill-none")} aria-hidden />
      {fit.lines.map((line, i) => (
        <text key={i} x={left + 32} y={fit.lines.length > 1 ? top + 16.5 + i * 14 : top + 15 + fit.size * 0.345} fontSize={fit.size} className={cn(t.text, "font-bold")}>{line}</text>
      ))}
    </g>
  );
}
