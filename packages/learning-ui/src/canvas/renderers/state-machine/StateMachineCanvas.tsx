"use client";

import { useId } from "react";
import { cn } from "../../../lib/utils";
import { CanvasFrame, CanvasNotes } from "../../primitives/canvas-frame";
import { FlowPulse } from "../../primitives/flow-pulse";
import { StepControls } from "../../primitives/step-controls";
import { KeyboardTip, StepNote } from "../../primitives/step-parts";
import { FOCUS_RING, NEUTRAL, SHAPE_TRANSITION, TONES } from "../../primitives/tones";
import { useStepper } from "../../primitives/use-stepper";
import { machineGeometry, type MachineLayout } from "./geometry";
import type { StateMachineSpec } from "./types";

/**
 * A lifecycle drawn as states and transitions. Each step lights one state and
 * the transition it is about, with a note underneath. Refused requests are
 * drawn as dashed loops, so the learner sees what the machine says no to.
 */
export function StateMachineCanvas({ spec }: { spec: StateMachineSpec }) {
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
          <MachineSvg spec={spec} active={stepper.active} layout="narrow" className="block sm:hidden" />
          <MachineSvg spec={spec} active={stepper.active} layout="wide" className="hidden sm:block" />
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

function MachineSvg({
  spec,
  active,
  layout,
  className,
}: {
  spec: StateMachineSpec;
  active: number;
  layout: MachineLayout;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "") + layout;
  const g = machineGeometry(spec, layout);
  const step = spec.steps[active];
  const tone = TONES[step?.tone ?? "accent"];
  const shapes = spec.edges.map((e) => g.edge(e));

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
        {(["on", "off"] as const).map((k) => (
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
            <path d="M0 0 L10 5 L0 10 Z" className={k === "on" ? tone.solidFill : NEUTRAL.faintFill} />
          </marker>
        ))}
      </defs>

      {/* Edges first, so states and labels sit on top of them. */}
      {spec.edges.map((e, i) => {
        const shape = shapes[i];
        if (!shape) return null;
        const on = i === step?.edge;
        const rejected = e.kind === "rejected";
        return (
          <g key={`edge-${i}`}>
            <path
              d={shape.d}
              fill="none"
              strokeWidth={on ? 2.25 : 1.5}
              strokeDasharray={rejected ? "5 4" : on ? undefined : "2 4"}
              strokeLinecap="round"
              markerEnd={`url(#${uid}-${on ? "on" : "off"})`}
              className={cn(SHAPE_TRANSITION, on ? tone.stroke : NEUTRAL.faintStroke)}
            />
            {on ? <FlowPulse d={shape.d} mid={shape.mid} stroke={tone.stroke} fill={tone.solidFill} /> : null}
          </g>
        );
      })}

      {spec.states.map((s) => {
        const placed = g.byId.get(s.id);
        if (!placed) return null;
        const [x, y] = placed.at;
        const on = s.id === step?.state;
        return (
          <g key={s.id}>
            <rect
              x={x - g.halfW}
              y={y - g.halfH}
              width={g.pillW}
              height={g.pillH}
              rx={g.halfH}
              strokeWidth={on ? 2.5 : 1.25}
              className={cn(SHAPE_TRANSITION, on ? [tone.softFill, tone.stroke] : [NEUTRAL.surface, NEUTRAL.faintStroke])}
            />
            {g.stateLines(s.id, y).name.map((line, k) => (
              <text key={`n${k}`} x={x} y={line.y} textAnchor="middle" fontSize={g.nameSize} fontWeight={600} textLength={line.textLength} lengthAdjust={line.textLength ? "spacingAndGlyphs" : undefined} className={NEUTRAL.text}>
                {line.text}
              </text>
            ))}
            {g.stateLines(s.id, y).sub.map((line, k) => (
              <text key={`s${k}`} x={x} y={line.y} textAnchor="middle" fontSize={g.subSize} textLength={line.textLength} lengthAdjust={line.textLength ? "spacingAndGlyphs" : undefined} className={cn("font-mono", on ? tone.text : NEUTRAL.mutedText)}>
                {line.text}
              </text>
            ))}
          </g>
        );
      })}

      {spec.edges.map((e, i) => {
        const shape = shapes[i];
        if (!shape) return null;
        const on = i === step?.edge;
        const box = g.labelBox(e, shape);
        return (
          <g key={`label-${i}`}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={box.h / 2}
              strokeWidth={1}
              className={cn(SHAPE_TRANSITION, on ? [tone.softFill, tone.stroke] : [NEUTRAL.surface, NEUTRAL.line])}
            />
            <text
              x={box.x + box.w / 2}
              y={box.y + box.h / 2 + 4}
              textAnchor="middle"
              fontSize={g.labelSize}
              fontWeight={on ? 700 : 500}
              className={cn("font-mono", on ? tone.text : NEUTRAL.mutedText)}
            >
              {e.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
