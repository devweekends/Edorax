"use client";

import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { BeatFrame } from "./beat-frame";
import { BeatActionButton } from "./beat-choice";
import { BANNER_CHARS, Pill, WrapBanner, pillWidth, wrapBannerHeight } from "./beat-parts";
import { SvgButton } from "./svg-button";
import { DotGrid } from "./svg-parts";
import { NEUTRAL, TONES } from "./tones";
import { resolveContext, startContext, type ContextPickerConfig } from "../models/context-picker";
import { wrapWords } from "../models/sorter";

// A playable "same question, different answer" picture. The question sits on
// top, then one row of tappable pills per fact about the situation, then the
// options as compact cards. Changing a pill moves a ring to the option that
// fits that context, and a note under the cards says why. Any course can use
// it with its own factors, options and rules.

const W = 420;
const SIDE = 12;
const INNER = W - 2 * SIDE;
const PILL_H = 40;
const HIT_H = 52;
const PITCH = 70;
/** Line height of a wrapped question or choice. */
const CHOICE_LINE = 16;
const FACTORS_TOP = 58;
const OPTION_GAP = 10;
const ROW_GAP = 20;

function optionColumns(n: number) {
  return n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
}

export function ContextPicker({ title, limits, question, factors, options, rules, fallback, start, hint }: ContextPickerConfig & { title: string; limits: string }) {
  const config: ContextPickerConfig = useMemo(() => ({ question, factors, options, rules, fallback, start, hint }), [question, factors, options, rules, fallback, start, hint]);
  const initial = useMemo(() => startContext(config), [config]);
  const [context, setContext] = useState<Record<string, string>>(initial);
  const result = resolveContext(config, context);
  const pickIndex = options.findIndex((o) => o.id === result.pick);
  const pickLabel = options[pickIndex]?.label ?? "";

  // Option cards: a grid under the factor rows. Text wraps to the card width, and every card gets the tallest card's height.
  const cols = optionColumns(options.length);
  const cardW = (INNER - OPTION_GAP * (cols - 1)) / cols;
  const labelChars = Math.max(6, Math.floor((cardW - 16) / 7.9));
  const subChars = Math.max(6, Math.floor((cardW - 16) / 6.9));
  const texts = options.map((o) => ({ label: wrapWords(o.label, labelChars), sub: o.sub ? wrapWords(o.sub, subChars) : [] }));
  const cardH = Math.max(52, ...texts.map((t) => 26 + (t.label.length - 1) * 17 + (t.sub.length ? 4 + t.sub.length * 16 : 0) + 12));
  // The question and each choice wrap to their width: a long question makes its chip taller, and a row of
  // choices is as tall as its longest choice. Nothing is cut and no choice writes over the next one.
  const questionLines = wrapWords(question, Math.floor((INNER - 36) / 8.4));
  const questionExtra = (questionLines.length - 1) * CHOICE_LINE;
  const rowsOf = factors.map((f) => {
    const n = Math.max(1, f.choices.length);
    const pw = (INNER - 8 * (n - 1)) / n;
    const labels = f.choices.map((choice) => wrapWords(choice.label, Math.max(4, Math.floor((pw - 14) / 7.2))));
    return { pw, labels, pillH: PILL_H + (Math.max(1, ...labels.map((l) => l.length)) - 1) * CHOICE_LINE };
  });
  const rowTop = rowsOf.map((_, i) => FACTORS_TOP + questionExtra + rowsOf.slice(0, i).reduce((sum, row) => sum + PITCH + row.pillH - PILL_H, 0));
  const optionsTop = FACTORS_TOP + questionExtra + rowsOf.reduce((sum, row) => sum + PITCH + row.pillH - PILL_H, 0) + 8;
  const cards = options.map((_, i) => ({ x: SIDE + (i % cols) * (cardW + OPTION_GAP), y: optionsTop + Math.floor(i / cols) * (cardH + ROW_GAP) }));
  const rows = Math.ceil(options.length / cols);
  const bannerY = optionsTop + rows * cardH + (rows - 1) * ROW_GAP + 18;
  const whyLines = wrapWords(result.why, BANNER_CHARS);
  const H = bannerY + wrapBannerHeight(whyLines.length) + 12;

  const qW = Math.min(INNER, Math.max(...questionLines.map((line) => line.length)) * 8.4 + 36);
  const summary = factors.map((f) => `${f.label}: ${f.choices.find((c) => c.id === context[f.id])?.label ?? "none"}`).join(", ");
  const atStart = factors.every((f) => context[f.id] === initial[f.id]);
  const move = "transition-transform duration-300 ease-out motion-reduce:transition-none";

  return (
    <BeatFrame label={title} limits={limits} hint={hint} controls={<BeatActionButton onClick={() => setContext(initial)} disabled={atStart}>Reset</BeatActionButton>}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${question} ${summary}. Best fit: ${pickLabel}. ${result.why}`} className="block h-auto w-full select-none">
        <DotGrid width={W} height={H} />

        {/* The question, as a chip. */}
        <rect x={(W - qW) / 2} y={10} width={qW} height={32 + questionExtra} rx={16} className={cn(NEUTRAL.surface, NEUTRAL.line)} strokeWidth={1.5} />
        {questionLines.map((line, i) => (
          <text key={i} x={W / 2} y={31 + i * CHOICE_LINE} textAnchor="middle" className={cn(NEUTRAL.text, "text-[14px] font-bold")}>{line}</text>
        ))}

        {/* One row of pills per fact. */}
        {factors.map((f, fi) => {
          const y0 = rowTop[fi];
          const { pw, labels, pillH } = rowsOf[fi];
          return (
            <g key={f.id} role="group" aria-label={f.label}>
              <text x={SIDE + 2} y={y0 + 12} className={cn(NEUTRAL.mutedText, "text-[13px] font-semibold")}>{f.label}</text>
              {f.choices.map((c, ci) => {
                const x = SIDE + ci * (pw + 8);
                const on = context[f.id] === c.id;
                return (
                  <SvgButton key={c.id} x={x} y={y0 + 20 + pillH / 2 - (pillH + HIT_H - PILL_H) / 2} width={pw} height={pillH + HIT_H - PILL_H} rx={20} label={`${f.label}: ${c.label}`} pressed={on} onPress={() => setContext((cur) => ({ ...cur, [f.id]: c.id }))}>
                    <rect
                      x={x}
                      y={y0 + 20}
                      width={pw}
                      height={pillH}
                      rx={PILL_H / 2}
                      strokeWidth={1.5}
                      className={cn("transition-colors duration-200 motion-reduce:transition-none", on ? "fill-blue-600 stroke-blue-600 dark:fill-blue-400 dark:stroke-blue-400" : cn(NEUTRAL.surface, NEUTRAL.line, "group-hover:fill-muted"))}
                    />
                    {labels[ci].map((line, li) => (
                      <text key={li} x={x + pw / 2} y={y0 + 20 + pillH / 2 + 4.5 + (li - (labels[ci].length - 1) / 2) * CHOICE_LINE} textAnchor="middle" className={cn("text-[13px] font-semibold", on ? "fill-white dark:fill-blue-950" : NEUTRAL.text)}>
                        {line}
                      </text>
                    ))}
                  </SvgButton>
                );
              })}
            </g>
          );
        })}

        {/* The options. The one that fits the chosen context is tinted. */}
        {options.map((o, i) => {
          const { x, y } = cards[i];
          const t = texts[i];
          const lit = i === pickIndex;
          const labelTop = y + 25;
          return (
            <g key={o.id} aria-hidden>
              <rect x={x} y={y + 3} width={cardW} height={cardH} rx={14} className="fill-foreground/[0.06]" />
              <rect x={x} y={y} width={cardW} height={cardH} rx={14} strokeWidth={1.5} className={cn(lit ? TONES.accent.softFill : NEUTRAL.surface, NEUTRAL.line, "transition-colors duration-300 motion-reduce:transition-none")} />
              {t.label.map((line, li) => (
                <text key={`l${li}`} x={x + cardW / 2} y={labelTop + li * 17} textAnchor="middle" className={cn(lit ? TONES.accent.text : NEUTRAL.text, "text-[13px] font-bold transition-colors duration-300 motion-reduce:transition-none")}>{line}</text>
              ))}
              {t.sub.map((line, si) => (
                <text key={`s${si}`} x={x + cardW / 2} y={labelTop + (t.label.length - 1) * 17 + 20 + si * 16} textAnchor="middle" className={cn(NEUTRAL.mutedText, "text-[13px] font-medium")}>{line}</text>
              ))}
            </g>
          );
        })}

        {/* The ring and the "Fits" pill glide to the option that fits. */}
        {pickIndex >= 0 ? (
          <g aria-hidden className={move} style={{ transform: `translate(${cards[pickIndex].x}px, ${cards[pickIndex].y}px)` }}>
            <rect x={-4} y={-4} width={cardW + 8} height={cardH + 8} rx={18} className={cn("fill-none", TONES.accent.stroke)} strokeWidth={2.5} />
            <Pill x={cardW - pillWidth("Fits") - 10} y={0} text="Fits" solid />
          </g>
        ) : null}

        <WrapBanner width={W} y={bannerY} lines={whyLines} tone="accent" />
      </svg>
      <p className="sr-only" aria-live="polite">{`Best fit: ${pickLabel}. ${result.why}`}</p>
    </BeatFrame>
  );
}
