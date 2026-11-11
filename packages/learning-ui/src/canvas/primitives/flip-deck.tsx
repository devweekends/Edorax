"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { BeatButton, BeatFrame } from "./beat-frame";
import { useReducedMotion } from "./beat-parts";
import { DotGrid, VerdictBanner } from "./svg-parts";
import { NEUTRAL, TONES, type Tone } from "./tones";
import { chooseVerdict, isFlipDone, nextCard, startFlip, type FlipDeckConfig, type FlipState } from "../models/flip-deck";
import { wrapWords } from "../models/sorter";

// A playable predict-then-reveal deck: one claim at a time. The learner picks
// a verdict with the buttons under the picture, then the card flips to what the
// evidence says and where it comes from. A guess that differs from the evidence
// is amber, never red: wrong guesses are welcome here. At the end the picture
// shows how many matched on the first try.

const W = 420;
const CARD_BOX = { x: 24, y: 52, w: 372, h: 246 };
const CX = CARD_BOX.x + CARD_BOX.w / 2;
const FLIP_MS = 200;
const BACK_CHARS = 46;
/** Sizes for the words on a card's front, largest first: a longer text steps down until it fits. */
const FRONT_FITS = [
  { size: 17, chars: 34, lh: 25 },
  { size: 15, chars: 40, lh: 21 },
  { size: 13.5, chars: 46, lh: 19 },
  { size: 12.5, chars: 50, lh: 17 },
] as const;
/** Room on the card that is not for its main text: the header above and the line under it. */
const FRONT_CHROME = 84;

/** The front of a card: the largest size whose lines fit a card this tall, else the smallest. */
export function frontFit(text: string, cardH: number) {
  for (const fit of FRONT_FITS) {
    const lines = wrapWords(text, fit.chars);
    if (lines.length * fit.lh <= cardH - FRONT_CHROME) return { ...fit, lines };
  }
  const last = FRONT_FITS[FRONT_FITS.length - 1];
  return { ...last, lines: wrapWords(text, last.chars) };
}

/** A deck's card height: the standard card, or taller when a front, a back or the end note needs the room. No text is cut. */
export function deckCardHeight(cards: { front: string; back: string }[], endNote: string): number {
  const last = FRONT_FITS[FRONT_FITS.length - 1];
  const fronts = cards.map((card) => wrapWords(card.front, last.chars).length * last.lh + FRONT_CHROME);
  const backs = cards.map((card) => 140 + wrapWords(card.back, BACK_CHARS).length * 19 + 34);
  const end = 66 + 2 * 28 + 22 + wrapWords(endNote, BACK_CHARS).length * 20;
  return Math.max(CARD_BOX.h, end, ...fronts, ...backs);
}

export function FlipDeck({ title, limits, verdicts, cards, deckLabel, prompt, hint, endNote }: FlipDeckConfig & { title: string; limits: string }) {
  // One height for the whole deck, from its longest text, so the card does not jump between cards.
  const CARD = { ...CARD_BOX, h: deckCardHeight(cards, endNote) };
  const H = CARD.y + CARD.h + 16;
  const [state, setState] = useState<FlipState>(startFlip);
  // What the picture shows. It follows `state` after the card has narrowed to an edge, so the face swaps while the card is thin.
  const [shown, setShown] = useState<FlipState>(state);
  const [thin, setThin] = useState(false);
  const reduced = useReducedMotion();
  const controls = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (shown === state) return;
    if (reduced) {
      setShown(state);
      return;
    }
    setThin(true);
    const t = setTimeout(() => {
      setShown(state);
      setThin(false);
    }, FLIP_MS);
    return () => clearTimeout(t);
  }, [state, shown, reduced]);

  // After a button press the pressed button goes away; keep keyboard focus on the next action.
  useEffect(() => {
    if (touched.current) controls.current?.querySelector("button")?.focus();
  }, [state]);

  const act = (next: FlipState) => {
    touched.current = true;
    setState(next);
  };

  const n = cards.length;
  const done = isFlipDone(state, cards);
  const label = (id: string | null) => verdicts.find((v) => v.id === id)?.label ?? "";

  const sDone = isFlipDone(shown, cards);
  const card = sDone ? null : cards[shown.index];
  const flipped = !!card && shown.chosen !== null;
  const hit = !!card && shown.chosen === card.answer;
  const total = shown.matched.length;

  let banner: { text: string; tone: Tone } = { text: prompt, tone: "accent" };
  if (sDone) banner = { text: "Deck finished", tone: total === n ? "good" : "accent" };
  else if (flipped && card) banner = hit ? { text: "You matched the evidence", tone: "good" } : { text: `The evidence says: ${label(card.answer)}`, tone: "warn" };

  const cardTone: Tone | null = flipped ? (hit ? "good" : "warn") : sDone && total === n ? "good" : null;

  const live = done
    ? `Deck finished. ${state.matched.length} of ${n} matched the evidence on the first try. ${endNote}`
    : state.chosen !== null
      ? `You said ${label(state.chosen)}. ${state.chosen === cards[state.index].answer ? "That matches the evidence." : `The evidence says ${label(cards[state.index].answer)}.`} ${cards[state.index].back} Source: ${cards[state.index].source}`
      : `Card ${state.index + 1} of ${n}: ${cards[state.index].front}`;

  const header = (text: string, right?: string) => (
    <>
      <text x={CARD.x + 16} y={CARD.y + 25} className={cn(NEUTRAL.mutedText, "text-[13px] font-semibold uppercase tracking-wide")}>{text}</text>
      {right ? <text x={CARD.x + CARD.w - 16} y={CARD.y + 25} textAnchor="end" className={cn(NEUTRAL.mutedText, "text-[13px] font-semibold tabular-nums")}>{right}</text> : null}
    </>
  );

  let face;
  if (card && !flipped) {
    const fit = frontFit(card.front, CARD.h);
    const lines = fit.lines;
    const mid = CARD.y + CARD.h / 2 - 6;
    face = (
      <>
        {header(deckLabel, `Card ${shown.index + 1} of ${n}`)}
        {lines.map((line, i) => (
          <text key={i} x={CX} y={mid + 6 + (i - (lines.length - 1) / 2) * fit.lh} textAnchor="middle" fontSize={fit.size} className={cn(NEUTRAL.text, "font-bold")}>{line}</text>
        ))}
        <text x={CX} y={CARD.y + CARD.h - 20} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[13px] font-medium")}>What does the evidence say?</text>
      </>
    );
  } else if (card) {
    const lines = wrapWords(card.back, BACK_CHARS);
    const match = hit ? "Matches the evidence" : `Evidence says: ${label(card.answer)}`;
    const matchW = Math.min(340, Math.ceil(match.length * 7 + 22));
    const srcW = Math.min(340, Math.ceil(card.source.length * 7.1 + 22));
    face = (
      <>
        {header(deckLabel, `Card ${shown.index + 1} of ${n}`)}
        <text x={CARD.x + 16} y={CARD.y + 56} className={cn(NEUTRAL.text, "text-[15px] font-bold")}>{`You said: ${label(shown.chosen)}`}</text>
        <rect x={CARD.x + 16} y={CARD.y + 67} width={matchW} height={24} rx={12} strokeWidth={1.25} className={cn(TONES[hit ? "good" : "warn"].softFill, TONES[hit ? "good" : "warn"].stroke)} />
        <text x={CARD.x + 16 + matchW / 2} y={CARD.y + 83.5} textAnchor="middle" className={cn(TONES[hit ? "good" : "warn"].text, "text-[13px] font-semibold")}>{match}</text>
        <text x={CARD.x + 16} y={CARD.y + 118} className={cn(NEUTRAL.mutedText, "text-[13px] font-semibold uppercase tracking-wide")}>The evidence</text>
        {lines.map((line, i) => (
          <text key={i} x={CARD.x + 16} y={CARD.y + 140 + i * 19} className={cn(NEUTRAL.text, "text-[13.5px] font-medium")}>{line}</text>
        ))}
        <rect x={CARD.x + 16} y={CARD.y + CARD.h - 36} width={srcW} height={24} rx={12} strokeWidth={1.25} className={cn("fill-muted", NEUTRAL.line)} />
        <text x={CARD.x + 16 + srcW / 2} y={CARD.y + CARD.h - 19.5} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[13px] font-semibold")}>{card.source}</text>
      </>
    );
  } else {
    const tally = `${total} of ${n} matched the evidence on the first try`;
    const tl = wrapWords(tally, 26);
    const nl = wrapWords(endNote, BACK_CHARS);
    face = (
      <>
        {header("Deck finished")}
        {tl.map((line, i) => (
          <text key={i} x={CX} y={CARD.y + 66 + i * 28} textAnchor="middle" className={cn(total === n ? TONES.good.text : NEUTRAL.text, "text-[21px] font-bold")}>{line}</text>
        ))}
        {nl.map((line, i) => (
          <text key={`n${i}`} x={CX} y={CARD.y + 66 + tl.length * 28 + 22 + i * 20} textAnchor="middle" className={cn(NEUTRAL.text, "text-[13.5px] font-medium")}>{line}</text>
        ))}
      </>
    );
  }

  const scale = thin ? 0.04 : 1;
  return (
    <BeatFrame
      label={title}
      limits={limits}
      hint={done ? "Again deals the same cards." : hint}
      controls={
        <div ref={controls} className="contents">
          {done ? (
            <BeatButton onClick={() => act(startFlip())}>Again</BeatButton>
          ) : state.chosen === null ? (
            verdicts.map((v) => (
              <BeatButton key={v.id} onClick={() => act(chooseVerdict(state, cards, v.id))}>{v.label}</BeatButton>
            ))
          ) : (
            <BeatButton onClick={() => act(nextCard(state, cards))}>{state.index === n - 1 ? "See the tally" : "Next card"}</BeatButton>
          )}
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={done ? "Deck finished" : `Card ${state.index + 1} of ${n}: ${cards[state.index].front}`} className="block h-auto w-full select-none">
        <DotGrid width={W} height={H} />
        <VerdictBanner width={W} text={banner.text} tone={banner.tone} />
        <g
          className="transition-transform duration-200 ease-in-out motion-reduce:transition-none"
          style={{ transform: `translate(${CX}px, 0px) scale(${scale}, 1) translate(${-CX}px, 0px)` }}
        >
          <rect x={CARD.x} y={CARD.y + 3} width={CARD.w} height={CARD.h} rx={16} className="fill-foreground/[0.06]" />
          <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={16} strokeWidth={cardTone ? 2 : 1.5} className={cn(NEUTRAL.surface, cardTone ? TONES[cardTone].stroke : NEUTRAL.line)} />
          {face}
        </g>
      </svg>
      <p className="sr-only" aria-live="polite">{live}</p>
    </BeatFrame>
  );
}
