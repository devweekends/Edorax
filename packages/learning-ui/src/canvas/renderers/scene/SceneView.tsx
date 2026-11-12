import { useId } from "react";
import { cn } from "../../../lib/utils";
import { DotGrid, VerdictBanner } from "../../primitives/svg-parts";
import { SvgNode } from "../../primitives/svg-node";
import { LABEL_HALO, NEUTRAL, TONES } from "../../primitives/tones";
import type { SceneFrame } from "./frame";
import { actorBox, sceneLift, CHIP_H, chipFade, chipTops, chipWidth, stripX, tagBox, tagRowY, TAG_H, longestWaitLabel, waitPillBox } from "./geometry";
import type { Scene } from "./types";

// Draws one frame of a scene on a dotted canvas: links between the actors
// that talk, messages travelling along them with a short trail and a label
// chip, actors as icon cards with a status pill, a timestamp strip, waits,
// and the verdict as a banner. Story motion uses transforms and opacity.

export function SceneView({ scene, frame, title }: { scene: Scene; frame: SceneFrame; title: string }) {
  const titleId = useId();
  const descId = useId();
  const strip = scene.strip;
  const { x0, x1, X } = stripX(scene);
  const visible = frame.opacity;
  const links = linksOf(scene);
  const tops = chipTops(scene, frame);
  const active = new Set(frame.packets.map((p) => linkKey(p.from, p.to)));
  // A scene whose top box was placed under the verdict banner is drawn lower, in a taller picture.
  const lift = sceneLift(scene);

  return (
    <svg viewBox={`0 0 ${scene.width} ${scene.height + lift}`} role="img" aria-labelledby={`${titleId} ${descId}`} className="block h-auto w-full select-none">
      <title id={titleId}>{title}</title>
      <desc id={descId}>{describe(frame)}</desc>
      <DotGrid width={scene.width} height={scene.height + lift} />
      <g transform={lift ? `translate(0 ${lift})` : undefined}>

      {/* The network: a quiet line for every pair of actors that exchange a message. */}
      {links.map(([a, b]) => {
        const from = scene.actors.find((x) => x.id === a);
        const to = scene.actors.find((x) => x.id === b);
        if (!from || !to) return null;
        const on = active.has(linkKey(a, b));
        return (
          <line
            key={linkKey(a, b)}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            strokeWidth={on ? 2.5 : 1.5}
            strokeDasharray={on ? undefined : "4 5"}
            strokeLinecap="round"
            className={cn("transition-[stroke-width] duration-200 motion-reduce:transition-none", on ? TONES.accent.stroke : NEUTRAL.faintStroke)}
          />
        );
      })}

      {strip ? (
        <g>
          <text x={x0} y={strip.y - 72} className={cn(NEUTRAL.mutedText, LABEL_HALO, "text-[12px] font-medium")}>{strip.caption}</text>
          <line x1={x0} x2={x1} y1={strip.y} y2={strip.y} className={NEUTRAL.line} strokeWidth={1.5} />
          {ticks(strip.from, strip.to, strip.every).map((v) => (
            <g key={v}>
              <line x1={X(v)} x2={X(v)} y1={strip.y} y2={strip.y + 5} className={NEUTRAL.faintStroke} />
              <text x={X(v)} y={strip.y + 21} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[12px] tabular-nums")}>{v} {strip.unit}</text>
            </g>
          ))}
          {frame.lines.map((line) => (
            <g key={`l-${line.label}`} opacity={line.opacity * visible}>
              <line x1={X(line.value)} x2={X(line.value)} y1={strip.y - 80} y2={strip.y} className={NEUTRAL.doneStroke} strokeWidth={1.5} strokeDasharray="3 4" />
              <text x={X(line.value)} y={strip.y - 86} textAnchor="middle" className={cn(NEUTRAL.text, LABEL_HALO, "text-[12px] font-medium")}>{line.label}</text>
            </g>
          ))}
          {/* Stems first, so no stem cuts through a neighbouring tag. */}
          {frame.tags.map((tag) => (
            <line key={`stem-${tag.label}`} x1={X(tag.value)} x2={X(tag.value)} y1={tagRowY(scene, tag.row) + TAG_H} y2={strip.y} opacity={tag.opacity * visible} className={TONES[tag.tone].stroke} strokeWidth={1.5} />
          ))}
          {frame.tags.map((tag) => {
            const tone = TONES[tag.tone];
            const box = tagBox(scene, tag);
            const cx = (box.left + box.right) / 2;
            return (
              <g key={`t-${tag.label}`} opacity={tag.opacity * visible} transform={`translate(0 ${3 * (1 - tag.opacity)})`}>
                <rect x={box.left} y={box.top} width={box.right - box.left} height={TAG_H} rx={7} className={NEUTRAL.surface} />
                <rect x={box.left} y={box.top} width={box.right - box.left} height={TAG_H} rx={7} className={cn(tone.softFill, tone.stroke)} strokeWidth={1.5} />
                <text x={cx} y={box.top + 16.5} textAnchor="middle" className={cn(tone.text, "font-mono text-[13px] font-semibold tabular-nums")}>{tag.label}</text>
              </g>
            );
          })}
        </g>
      ) : null}

      {/* Messages travel under the cards, so they leave the sender and vanish into the receiver. */}
      {frame.packets.map((packet) => {
        const tone = TONES[packet.tone];
        return (
          <g key={packet.id} opacity={packet.opacity * visible}>
            {packet.trail.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={6 - i * 1.4} opacity={0.35 - i * 0.1} className={tone.solidFill} />
            ))}
            <g transform={`translate(${packet.x} ${packet.y})`}>
              <circle r={8} className={tone.solidFill} />
              <circle r={3} className="fill-card" />
            </g>
          </g>
        );
      })}

      {frame.actors.map((actor) => {
        const kind = scene.actors.find((a) => a.id === actor.id)?.kind;
        // Sized for every note the story gives this actor, so the box holds its text and never changes size mid-story.
        const box = actorBox(actor, scene);
        return (
          <SvgNode
            key={actor.id}
            x={actor.x}
            y={actor.y}
            left={box.left}
            top={box.top}
            width={box.right - box.left}
            height={box.bottom - box.top}
            label={actor.label}
            kind={kind}
            status={actor.sub}
            statusTone={actor.tone}
            previousStatus={actor.previousSub}
            previousTone={actor.previousTone}
            statusOpacity={actor.subOpacity}
            arrival={actor.arrival * visible}
            mark={actor.mark}
            markOpacity={actor.markOpacity * visible}
          />
        );
      })}

      {frame.waits.map((wait) => {
        const actor = frame.actors.find((a) => a.id === wait.actor);
        if (!actor) return null;
        const boxRight = actorBox(actor, scene).right;
        const cx = boxRight + 16;
        const cy = actor.y;
        const circumference = 2 * Math.PI * 12;
        const pill = waitPillBox(actor, longestWaitLabel(scene, wait.actor, wait.label), boxRight);
        const shown = wait.opacity * visible;
        // The ring and pill come in twice as fast as the text, so the text never shows before the pill that keeps lines off it.
        const solid = Math.min(1, shown * 2);
        return (
          <g key={`w-${wait.actor}`}>
            <g opacity={solid}>
              <circle cx={cx} cy={cy} r={12} className={cn("fill-card", NEUTRAL.line)} strokeWidth={3} />
              {/* The ring fills as the wait runs, so the learner sees how much of it has passed. */}
              <circle
                cx={cx}
                cy={cy}
                r={12}
                className={cn("fill-none", TONES.warn.stroke)}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={`${wait.progress * circumference} ${circumference}`}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
              {/* An opaque pill, so a link line never runs through the wait text. */}
              <rect x={pill.left} y={pill.top} width={pill.right - pill.left} height={pill.bottom - pill.top} rx={11} className={cn(NEUTRAL.surface, NEUTRAL.line)} strokeWidth={1.5} />
            </g>
            <text x={cx + 18} y={cy + 5} textAnchor="start" opacity={shown} className={cn(TONES.warn.text, "text-[12px] font-semibold tabular-nums")}>{wait.label}</text>
          </g>
        );
      })}

      {/* Message labels sit above the cards, and only where they are clear of every card, tag and wait: above the message if there is room, else below it. */}
      {frame.packets.map((packet, index) => {
        const top = tops[index];
        const chip = chipFade(packet);
        if (top === null || chip <= 0) return null;
        const tone = TONES[packet.tone];
        const chipW = chipWidth(packet.label);
        return (
          <g key={`c-${packet.id}`} aria-hidden opacity={chip * packet.opacity * visible} transform={`translate(${packet.x} ${packet.y})`}>
            <rect x={-chipW / 2} y={top} width={chipW} height={CHIP_H} rx={CHIP_H / 2} className={cn(NEUTRAL.surface, tone.stroke)} strokeWidth={1.5} />
            <text y={top + 14} textAnchor="middle" className={cn(tone.text, "text-[11.5px] font-semibold")}>{packet.label}</text>
          </g>
        );
      })}

      </g>

      {frame.verdict ? <VerdictBanner width={scene.width} text={frame.verdict.text} tone={frame.verdict.tone} opacity={frame.verdictOpacity * visible} /> : null}
    </svg>
  );
}

const linkKey = (a: string, b: string) => [a, b].sort().join("~");

/** Every pair of actors that exchange a message somewhere in the story. */
function linksOf(scene: Scene): [string, string][] {
  const seen = new Map<string, [string, string]>();
  for (const e of scene.events) if (e.kind === "fly") seen.set(linkKey(e.from, e.to), [e.from, e.to]);
  return [...seen.values()];
}

function ticks(from: number, to: number, every: number): number[] {
  const out: number[] = [];
  const step = every > 0 ? every : to - from || 1;
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** The current frame in words, for screen readers. */
function describe(frame: SceneFrame): string {
  const parts: string[] = [];
  for (const a of frame.actors) parts.push(a.sub ? `${a.label}: ${a.sub}` : a.label);
  for (const p of frame.packets) parts.push(`message on its way: ${p.label}`);
  for (const t of frame.tags) parts.push(`timestamp ${t.label}`);
  for (const w of frame.waits) parts.push(w.label);
  if (frame.verdict) parts.push(frame.verdict.text);
  return parts.join(". ") + ".";
}
