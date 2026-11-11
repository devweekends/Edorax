"use client";

import { useId } from "react";
import { cn } from "../../../lib/utils";
import { CanvasFrame, CanvasNotes } from "../../primitives/canvas-frame";
import { FlowPulse } from "../../primitives/flow-pulse";
import { StepControls } from "../../primitives/step-controls";
import { KeyboardTip, StepBadge, StepNote, type StepState } from "../../primitives/step-parts";
import { FOCUS_RING, NEUTRAL, SHAPE_TRANSITION, TONES } from "../../primitives/tones";
import { useStepper } from "../../primitives/use-stepper";
import { sequenceGeometry, type SequenceLayout } from "./geometry";
import type { SequenceSpec } from "./types";

/**
 * A step-through sequence diagram: one lane per actor, one numbered arrow per
 * step, and a note under the picture saying what happens at the current step.
 * HTML owns the controls and the text; the SVG only draws.
 */
export function SequenceCanvas({ spec }: { spec: SequenceSpec }) {
  const stepper = useStepper(spec.steps.length);
  const step = spec.steps[stepper.active];
  if (!step) return null;

  return (
    <CanvasFrame eyebrow="Walkthrough" title={spec.title} purpose={spec.purpose}>
      <div
        role="group"
        aria-roledescription="step-through"
        aria-label={spec.title}
        tabIndex={0}
        onKeyDown={stepper.onKeyDown}
        className={cn("space-y-4 rounded-xl", FOCUS_RING)}
      >
        <div className="rounded-xl border border-border bg-background/60 px-1 py-2">
          <SequenceSvg spec={spec} active={stepper.active} layout="narrow" className="block sm:hidden" />
          <SequenceSvg spec={spec} active={stepper.active} layout="wide" className="hidden sm:block" />
        </div>

        <StepNote
          index={stepper.active}
          count={spec.steps.length}
          title={step.title}
          note={step.note}
          chips={step.chips}
          outcome={step.outcome}
          tone={step.tone}
        />

        <StepControls stepper={stepper} titles={spec.steps.map((s) => s.title)} />
        <KeyboardTip />
      </div>
      <div className="mt-4">
        <CanvasNotes tryThis={spec.tryThis} limits={spec.limits} />
      </div>
    </CanvasFrame>
  );
}

function SequenceSvg({
  spec,
  active,
  layout,
  className,
}: {
  spec: SequenceSpec;
  active: number;
  layout: SequenceLayout;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "") + layout;
  const g = sequenceGeometry(spec, layout);
  const stateOf = (i: number): StepState => (i === active ? "active" : i < active ? "done" : "todo");
  const current = spec.steps[active];
  const focus = new Set(current ? [current.from, current.to] : []);
  const activeTone = TONES[current?.tone ?? "accent"];

  const markerClass: Record<StepState, string> = {
    active: activeTone.solidFill,
    done: NEUTRAL.doneFill,
    todo: NEUTRAL.faintFill,
  };

  return (
    <svg
      viewBox={`0 0 ${g.width} ${g.height}`}
      preserveAspectRatio="xMidYMin meet"
      className={cn("h-auto w-full", className)}
      role="img"
      aria-labelledby={`${uid}-title ${uid}-desc`}
    >
      <title id={`${uid}-title`}>{spec.title}</title>
      <desc id={`${uid}-desc`}>{spec.summary}</desc>
      <defs>
        {(["active", "done", "todo"] as const).map((k) => (
          <marker
            key={k}
            id={`${uid}-${k}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 Z" className={markerClass[k]} />
          </marker>
        ))}
      </defs>

      {spec.actors.map((_, i) => (
        <line
          key={`life-${i}`}
          x1={g.laneX(i)}
          x2={g.laneX(i)}
          y1={g.headerY + g.pillH}
          y2={g.height - 4}
          strokeWidth={1.25}
          strokeDasharray="4 5"
          vectorEffect="non-scaling-stroke"
          className={NEUTRAL.line}
        />
      ))}

      {spec.actors.map((_actor, i) => {
        const on = focus.has(i);
        return (
          <g key={`actor-${i}`}>
            <rect
              x={g.laneX(i) - g.pillW / 2}
              y={g.headerY}
              width={g.pillW}
              height={g.pillH}
              rx={12}
              strokeWidth={on ? 2.25 : 1.25}
              className={cn(
                SHAPE_TRANSITION,
                on ? [activeTone.softFill, activeTone.stroke] : [NEUTRAL.surface, NEUTRAL.line]
              )}
            />
            {g.headerLines(i).name.map((line, k) => (
              <text key={`n${k}`} x={g.laneX(i)} y={line.y} textAnchor="middle" fontSize={g.nameSize} fontWeight={600} textLength={line.textLength} lengthAdjust={line.textLength ? "spacingAndGlyphs" : undefined} className={NEUTRAL.text}>
                {line.text}
              </text>
            ))}
            {g.headerLines(i).sub.map((line, k) => (
              <text key={`s${k}`} x={g.laneX(i)} y={line.y} textAnchor="middle" fontSize={g.subSize} textLength={line.textLength} lengthAdjust={line.textLength ? "spacingAndGlyphs" : undefined} className={cn("font-mono", on ? activeTone.text : NEUTRAL.mutedText)}>
                {line.text}
              </text>
            ))}
          </g>
        );
      })}

      {spec.steps.map((step, i) => {
        const k = stateOf(i);
        const shape = g.arrow(step, i);
        const stepTone = TONES[step.tone ?? "accent"];
        const strokeClass =
          k === "active" ? stepTone.stroke : k === "done" ? NEUTRAL.doneStroke : NEUTRAL.faintStroke;
        return (
          <g key={`step-${i}`}>
            <path
              d={shape.d}
              fill="none"
              strokeWidth={k === "active" ? 2.25 : 1.5}
              strokeDasharray={k === "todo" ? "4 4" : undefined}
              markerEnd={`url(#${uid}-${k})`}
              className={cn(SHAPE_TRANSITION, strokeClass)}
            />
            {k === "active" ? (
              <FlowPulse d={shape.d} mid={shape.mid} stroke={stepTone.stroke} fill={stepTone.solidFill} />
            ) : null}
            <StepBadge x={shape.badge[0]} y={shape.badge[1]} n={i + 1} state={k} tone={step.tone} />
            <text
              x={shape.label.x}
              y={shape.label.y}
              textAnchor={shape.label.anchor}
              fontSize={g.labelSize}
              fontWeight={k === "active" ? 700 : 500}
              className={k === "active" ? NEUTRAL.text : cn(NEUTRAL.mutedText, k === "todo" && "opacity-70")}
            >
              {step.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
