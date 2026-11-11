"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "../../lib/utils";
import { BeatButton, BeatFrame } from "./beat-frame";
import { DotGrid, VerdictBanner } from "./svg-parts";
import { FOCUS_RING, LABEL_HALO, NEUTRAL, TONES, type Tone } from "./tones";
import {
  bucketCount,
  currentCard,
  fitsOneLine,
  isDone,
  placeCard,
  sortVerdict,
  startSort,
  trayLines,
  wrapWords,
  type SortBucket,
  type SortCard,
  type SortState,
  type SortVerdicts,
} from "../models/sorter";

// A playable sorter: one card at a time, two to four buckets under it. Tap a
// bucket (or drag the card onto it). A right answer flies into its bucket and
// the bucket's count ticks up; a wrong one shakes and says why, and the card
// stays for another try. Any course can use it with its own buckets and cards.

export type SorterConfig = {
  buckets: SortBucket[];
  cards: SortCard[];
  /** Small label on the card, for example "Daftar requirement". */
  deckLabel: string;
  /** The banner before the first answer, at most 38 characters. */
  prompt: string;
  /** The one line under the picture telling the learner what to do. */
  hint: string;
  /** The lesson shown on the card once every card is sorted. */
  endNote: string;
  /** Own wording for the end-of-round banner; each line at most 38 characters. */
  verdicts?: SortVerdicts;
};

const W = 420;
const H = 300;
const CARD = { x: 24, y: 48, w: 372, h: 104 };
const CARD_CX = CARD.x + CARD.w / 2;
const CARD_CY = CARD.y + CARD.h / 2;
const TRAY_TOP = 188;
const TRAY_H = 104;
const TRAY_GAP = 10;
const TEXT_CHARS = 40;
const LINE_H = 21;
const FLY_MS = 450;
const SHAKE_MS = 420;
/** A wrong-answer reason wraps to at most two lines of this many characters between the card and the trays. */
const REASON_CHARS = 60;

type Feedback = { kind: "right" | "wrong"; bucket: string; reason?: string; card: SortCard; at: number };

function trays(n: number) {
  const w = (W - 2 * TRAY_GAP - (n - 1) * TRAY_GAP) / n;
  return Array.from({ length: n }, (_, i) => ({ x: TRAY_GAP + i * (w + TRAY_GAP), y: TRAY_TOP, w, h: TRAY_H }));
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/** Ticks once a frame while `until` is in the future, so a short tween can draw itself. */
function useTween(until: number, reduced: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (reduced || until <= 0) return;
    let raf = 0;
    const loop = (t: number) => {
      setNow(t);
      if (t < until) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [until, reduced]);
  return now;
}

/** Four buckets share the row, so each tray is narrow: names and glosses wrap and the count moves to the corner. */
const DENSE_FROM = 4;

export function Sorter({ title, limits, buckets, cards, deckLabel, prompt, hint, endNote, verdicts }: SorterConfig & { title: string; limits: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<SortState>(() => startSort(cards, buckets, 0));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; dx: number; dy: number } | null>(null);
  const reduced = useReducedMotion();
  const until = feedback ? feedback.at + Math.max(FLY_MS, SHAKE_MS) + 50 : 0;
  const now = useTween(until, reduced);
  const p = feedback && !reduced ? clamp01((now - feedback.at) / (feedback.kind === "right" ? FLY_MS : SHAKE_MS)) : 1;

  const boxes = trays(buckets.length);
  const dense = buckets.length >= DENSE_FROM;
  const card = currentCard(state, cards);
  const done = isDone(state);

  const answer = (bucket: string) => {
    if (done) return;
    const { state: next, outcome } = placeCard(state, cards, bucket);
    if (outcome.kind === "ignored") return;
    setState(next);
    setFeedback({ kind: outcome.kind, bucket, reason: outcome.kind === "wrong" ? outcome.reason : undefined, card: outcome.card, at: performance.now() });
  };

  const again = () => {
    const r = round + 1;
    setRound(r);
    setState(startSort(cards, buckets, r));
    setFeedback(null);
    setDrag(null);
  };

  const toSvg = (e: PointerEvent) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  const trayAt = (x: number, y: number) => boxes.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y - 12 && y <= b.y + b.h);
  const dropTarget = drag ? trayAt(CARD_CX + drag.dx, CARD_CY + drag.dy + CARD.h / 2) : -1;

  // The banner: the prompt, then the last answer, then the round's result.
  let banner: { text: string; tone: Tone } = { text: prompt, tone: "accent" };
  if (done) banner = { text: sortVerdict(state, verdicts), tone: state.missed.length === 0 ? "good" : "accent" };
  else if (feedback?.kind === "wrong") banner = { text: "Not quite. Try again", tone: "warn" };
  else if (feedback?.kind === "right") banner = { text: `Right: ${buckets.find((b) => b.id === feedback.bucket)?.label ?? ""}`, tone: "good" };

  const live = done
    ? `${sortVerdict(state, verdicts)}. ${endNote}`
    : feedback?.kind === "wrong"
      ? `Not quite. ${feedback.reason}`
      : feedback?.kind === "right"
        ? `Right: ${buckets.find((b) => b.id === feedback.bucket)?.label}. Next card: ${card?.text ?? ""}`
        : "";

  const shakeX = feedback?.kind === "wrong" && p < 1 ? 9 * Math.sin(p * Math.PI * 6) * (1 - p) : 0;
  const enter = feedback?.kind === "right" ? clamp01(p * 1.4) : 1;

  const cardFace = (c: SortCard | null, tone: Tone | null) => {
    const lines = c ? wrapWords(c.text, TEXT_CHARS) : wrapWords(endNote, TEXT_CHARS + 6);
    const top = CARD_CY + 10 - ((lines.length - 1) * LINE_H) / 2;
    return (
      <g>
        <rect x={CARD.x} y={CARD.y + 3} width={CARD.w} height={CARD.h} rx={16} className="fill-foreground/[0.06]" />
        <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={16} className={cn(NEUTRAL.surface, tone ? TONES[tone].stroke : NEUTRAL.line)} strokeWidth={tone ? 2 : 1.5} />
        <text x={CARD.x + 16} y={CARD.y + 22} className={cn(NEUTRAL.mutedText, "text-[11.5px] font-semibold uppercase tracking-wide")}>
          {c ? deckLabel : "Every card sorted"}
        </text>
        {lines.map((line, i) => (
          <text key={i} x={CARD_CX} y={top + i * LINE_H} textAnchor="middle" className={cn(NEUTRAL.text, c ? "text-[15px] font-semibold" : "text-[13.5px] font-medium")}>
            {line}
          </text>
        ))}
      </g>
    );
  };

  // Progress dots in the card's top right: filled for sorted, ringed for the current card.
  const dots = (
    <g aria-hidden>
      {state.order.map((id, i) => {
        const cx = CARD.x + CARD.w - 18 - (state.order.length - 1 - i) * 13;
        const sorted = i < state.index;
        const current = i === state.index;
        return <circle key={id} cx={cx} cy={CARD.y + 18} r={4} strokeWidth={1.5} className={sorted ? TONES.accent.solidFill : current ? cn("fill-none", TONES.accent.stroke) : NEUTRAL.faintFill} />;
      })}
    </g>
  );

  const flying = feedback?.kind === "right" && p < 1 ? feedback : null;
  const flyBox = flying ? boxes[buckets.findIndex((b) => b.id === flying.bucket)] : null;

  return (
    <BeatFrame label={title} limits={limits} hint={done ? "Sort again deals the same cards in a new order." : hint} controls={done ? <BeatButton onClick={again}>Sort again</BeatButton> : null}>
      <div className="relative">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={done ? `${sortVerdict(state, verdicts)}. ${endNote}` : `Card: ${card?.text ?? ""}. Pick a bucket below.`} className="block h-auto w-full select-none">
          <DotGrid width={W} height={H} />
          <VerdictBanner width={W} text={banner.text} tone={banner.tone} />

          {/* The buckets, with their names and counts. */}
          {buckets.map((b, i) => {
            const box = boxes[i];
            const arriving = feedback?.kind === "right" && feedback.bucket === b.id;
            const arrived = arriving && p >= 1;
            const shown = bucketCount(state, b.id) - (arriving && !arrived ? 1 : 0);
            const wrong = feedback?.kind === "wrong" && feedback.bucket === b.id;
            const target = dropTarget === i;
            const pop = arriving && arrived ? 1 : 0;
            const tone: Tone | null = target ? "accent" : wrong ? "bad" : arriving ? "good" : null;
            return (
              <g key={b.id}>
                <rect x={box.x} y={box.y + 3} width={box.w} height={box.h} rx={16} className="fill-foreground/[0.06]" />
                <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={16} className={cn(NEUTRAL.surface, tone ? TONES[tone].stroke : NEUTRAL.line, "transition-colors duration-200 motion-reduce:transition-none")} strokeWidth={tone ? 2.5 : 1.5} />
                {tone ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={16} className={TONES[tone].softFill} opacity={0.7} /> : null}
                {/* The tray's mouth: where cards drop in. */}
                <rect x={box.x + 18} y={box.y + 8} width={box.w - 36} height={5} rx={2.5} className={NEUTRAL.faintFill} />
                {dense || !fitsOneLine(box.w, b.label, b.sub) ? (
                  <TrayTextDense box={box} label={b.label} sub={b.sub} shown={shown} pop={pop === 1} />
                ) : (
                  <>
                    <text x={box.x + box.w / 2} y={box.y + 34} textAnchor="middle" className={cn(NEUTRAL.text, "text-[13.5px] font-bold")}>{b.label}</text>
                    <text x={box.x + box.w / 2} y={box.y + 52} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[11.5px] font-medium")}>{b.sub}</text>
                    <text x={box.x + box.w / 2} y={box.y + 88} textAnchor="middle" className={cn(pop ? TONES.good.text : NEUTRAL.text, "text-[24px] font-bold tabular-nums")}>{shown}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* The card that just went right, flying into its bucket. */}
          {flying && flyBox ? (
            <g
              opacity={1 - 0.7 * ease(p)}
              transform={`translate(${CARD_CX + (flyBox.x + flyBox.w / 2 - CARD_CX) * ease(p)} ${CARD_CY + (flyBox.y + 40 - CARD_CY) * ease(p)}) scale(${1 - 0.78 * ease(p)}) translate(${-CARD_CX} ${-CARD_CY})`}
            >
              {cardFace(flying.card, "good")}
            </g>
          ) : null}

          {/* The card on top: drag it onto a bucket, or tap a bucket. */}
          <g
            opacity={enter}
            transform={`translate(${shakeX + (drag?.dx ?? 0)} ${(drag?.dy ?? 0) + 8 * (1 - enter)})`}
            className={cn(done ? "" : "cursor-grab touch-none", drag && "cursor-grabbing")}
            onPointerDown={(e) => {
              if (done) return;
              const pt = toSvg(e);
              if (!pt) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ x0: pt.x, y0: pt.y, dx: 0, dy: 0 });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              const pt = toSvg(e);
              if (pt) setDrag({ ...drag, dx: pt.x - drag.x0, dy: pt.y - drag.y0 });
            }}
            onPointerUp={() => {
              if (!drag) return;
              const moved = Math.hypot(drag.dx, drag.dy) > 8;
              setDrag(null);
              if (moved && dropTarget >= 0) answer(buckets[dropTarget].id);
            }}
            onPointerCancel={() => setDrag(null)}
          >
            {cardFace(done ? null : card, feedback?.kind === "wrong" ? "warn" : null)}
            {dots}
          </g>

          {/* The reason for a wrong answer, between the card and the buckets. */}
          {feedback?.kind === "wrong" && !done
            ? (() => {
                const lines = wrapWords(feedback.reason ?? "", REASON_CHARS).slice(0, 2);
                return lines.map((line, i) => (
                  <text key={i} x={W / 2} y={(lines.length === 1 ? 175 : 167) + i * 15} textAnchor="middle" className={cn(TONES.bad.text, LABEL_HALO, "text-[12.5px] font-semibold")}>
                    {line}
                  </text>
                ));
              })()
            : null}
        </svg>

        {/* Real buttons over the buckets, so tap, Tab and Enter all work. */}
        {buckets.map((b, i) => {
          const box = boxes[i];
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => answer(b.id)}
              aria-disabled={done}
              aria-label={`${b.label}: ${b.sub}. ${bucketCount(state, b.id)} cards so far.`}
              className={cn("absolute cursor-pointer rounded-2xl", FOCUS_RING, done && "cursor-default")}
              style={{ left: `${(box.x / W) * 100}%`, top: `${(box.y / H) * 100}%`, width: `${(box.w / W) * 100}%`, height: `${(box.h / H) * 100}%` }}
            />
          );
        })}
        <p className="sr-only" aria-live="polite">{live}</p>
      </div>
    </BeatFrame>
  );
}

/** Text of a tray whose words do not fit on one line: the name and gloss wrap to the tray width, and the count sits in the bottom corner. */
function TrayTextDense({ box, label, sub, shown, pop }: { box: { x: number; y: number; w: number; h: number }; label: string; sub: string; shown: number; pop: boolean }) {
  const { label: labelLines, sub: subLines } = trayLines(box.w, label, sub);
  const cx = box.x + box.w / 2;
  const y0 = box.y + 31;
  const subTop = y0 + (labelLines.length - 1) * 14.5 + 15;
  return (
    <>
      {labelLines.map((line, i) => (
        <text key={`l${i}`} x={cx} y={y0 + i * 14.5} textAnchor="middle" className={cn(NEUTRAL.text, "text-[12.5px] font-bold")}>{line}</text>
      ))}
      {subLines.map((line, i) => (
        <text key={`s${i}`} x={cx} y={subTop + i * 13} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[11.5px] font-medium")}>{line}</text>
      ))}
      <text x={box.x + box.w - 9} y={box.y + box.h - 9} textAnchor="end" className={cn(pop ? TONES.good.text : NEUTRAL.text, "text-[15px] font-bold tabular-nums")}>{shown}</text>
    </>
  );
}
