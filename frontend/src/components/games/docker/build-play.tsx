"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameSounds } from "@/lib/games/audio";
import { checkBuildGoal, simulateBuild, type BuildGoal, type BuildLayer, type BuildReport } from "@/shared/games/docker/builder";
import type { BuildRound, BuildSubmission } from "@/shared/games/docker/engine";
import { GameFrame, type FrameCheck } from "../game-frame";
import { HeaderActions, levelOf, MissionPanel, MobileBar, SectionLabel, Strip, type Primary } from "./mission-panel";
import { useReducedMotion } from "./docker-styles";

type Props = {
  round: BuildRound;
  roundIndex: number;
  attempt: number;
  locked: boolean;
  sounds: GameSounds;
  onFinish: (submission: BuildSubmission) => void;
};

type Phase = "edit" | "cold" | "rebuild" | "built" | "running" | "ran";

const RUN_GOALS = new Set<BuildGoal["kind"]>(["runs", "reachable"]);

const STEPS = [
  "Read the brief and the checks",
  "Tap a piece to add it, or drag it. Drag to reorder",
  "Press Build image, then Run",
];
const COMPOSE_STEPS = [
  "Read the brief and the checks",
  "Tap a choice for each blank, or drag it onto the blank",
  "Press Build stack, then Run",
];

const seconds = (n: number) => `${n.toFixed(1)} s`;

type LiveNote = { tone: "good" | "bad"; tag: string; text: string; line: number | null };

/** Instant feedback while the player orders a Dockerfile, in plain words. It reads the same simulation the Build button uses. */
function liveNote(round: BuildRound, texts: string[], steps: string[]): LiveNote | null {
  if (round.kind !== "dockerfile" || texts.length === 0) return null;
  const op = (t: string) => t.split(/\s+/)[0]?.toUpperCase() ?? "";
  if (op(texts[0]!) !== "FROM") return { tone: "bad", tag: "Fix this", text: "A Dockerfile starts with FROM. Move FROM to line 1.", line: 0 };
  const report = simulateBuild(round, steps);
  if (report.error) return { tone: "bad", tag: "Fix this", text: report.error, line: Math.max(0, report.layers.length - 1) };
  const isInstall = (t: string) => /^RUN\s+(npm (ci|install)|pip install)/i.test(t);
  const copyAll = texts.findIndex((t) => /^COPY\s+\.\s+\S+/i.test(t));
  const install = texts.findIndex(isInstall);
  if (copyAll !== -1 && install !== -1 && copyAll < install) {
    return { tone: "bad", tag: "Fix this", text: "COPY . . before the install breaks the cache. Every code change would reinstall all packages. Move COPY . . below the install.", line: copyAll };
  }
  const cmd = texts.findIndex((t) => op(t) === "CMD");
  if (cmd !== -1 && cmd < texts.length - 1 && texts.slice(cmd + 1).some((t) => ["COPY", "RUN"].includes(op(t)))) {
    return { tone: "bad", tag: "Fix this", text: "CMD should be the last line. It runs after the image is built.", line: cmd };
  }
  if (report.cacheFriendly) return { tone: "good", tag: "Good", text: "This order keeps the cache: a code change only rebuilds the last layers.", line: null };
  return null;
}

function LayerList({ layers, mode, compose }: { layers: BuildLayer[]; mode: "cold" | "rebuild"; compose: boolean }) {
  return (
    <ol className="divide-y divide-border border border-border bg-card" aria-label={mode === "cold" ? "Build layers" : "Rebuild layers"}>
      {layers.map((layer, i) => {
        const cached = mode === "rebuild" && layer.cached;
        const tag = layer.failed ? "Failed" : cached ? "Cached" : compose ? "Started" : "Built";
        return (
          <li key={`${mode}-${i}`} className="flex items-center gap-3 px-3 py-2 font-mono text-[13px]">
            <span className="w-4 shrink-0 text-right text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 break-all">{layer.label}</span>
            <span
              className={cn(
                "shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                layer.failed ? "bg-red-600 text-white" : cached ? "bg-emerald-600 text-white" : "bg-secondary text-foreground",
              )}
            >
              {tag}
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{cached ? "0.1 s" : seconds(layer.seconds)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function failDetail(report: BuildReport, goal: BuildGoal): string | undefined {
  if (goal.kind === "rebuild") return `A rebuild takes ${seconds(report.rebuildSec)} now.`;
  if (goal.kind === "size") return `The image is ${report.sizeMb} MB now.`;
  if (goal.kind === "builds") return report.error ?? undefined;
  return undefined;
}

/** Build mode: put a Dockerfile or a compose file together from pieces, build it, then run it. */
export function BuildPlay({ round, roundIndex, attempt, locked, sounds, onFinish }: Props) {
  const compose = round.kind === "compose";
  const reduced = useReducedMotion();
  const [steps, setSteps] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<string>(round.slots?.[0]?.id ?? "");
  const [hintsUsed, setHintsUsed] = useState(0);
  const [phase, setPhase] = useState<Phase>("edit");
  const [report, setReport] = useState<BuildReport | null>(null);
  const [coldShown, setColdShown] = useState(0);
  const [rebuildShown, setRebuildShown] = useState(0);
  const [runShown, setRunShown] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const timers = useRef<number[]>([]);
  const firstAttempt = useRef(attempt);

  const byId = useMemo(() => new Map(round.pieces.map((p) => [p.id, p])), [round.pieces]);
  const slots = useMemo(() => round.slots ?? [], [round.slots]);
  const submissionSteps = useMemo(
    () => (compose ? slots.filter((s) => picks[s.id]).map((s) => `${s.id}:${picks[s.id]}`) : steps),
    [compose, slots, picks, steps],
  );
  const placed = compose ? Object.keys(picks).length : steps.length;
  const live = useMemo(
    () => liveNote(round, steps.map((id) => byId.get(id)?.text ?? ""), steps),
    [round, steps, byId],
  );

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  /** Any change to the pieces throws away the last build, like editing a file does. */
  const invalidate = useCallback(() => {
    clearTimers();
    setPhase("edit");
    setReport(null);
    setColdShown(0);
    setRebuildShown(0);
    setRunShown(0);
    setNote(null);
  }, [clearTimers]);

  const resetAll = useCallback(() => {
    invalidate();
    setSteps([]);
    setPicks({});
    setActiveSlot(round.slots?.[0]?.id ?? "");
  }, [invalidate, round.slots]);

  useEffect(() => {
    if (attempt !== firstAttempt.current) {
      firstAttempt.current = attempt;
      resetAll();
      setHintsUsed(0);
    }
  }, [attempt, resetAll]);

  // ---- Dockerfile editing -------------------------------------------------------------------
  function addPiece(id: string, at?: number) {
    if (locked || steps.includes(id)) return;
    invalidate();
    setSteps((s) => {
      if (s.includes(id)) return s;
      const next = [...s];
      next.splice(at === undefined ? next.length : Math.min(at, next.length), 0, id);
      return next;
    });
    sounds.snap();
  }
  function movePiece(from: number, to: number) {
    if (locked || to < 0 || to >= steps.length || from === to) return;
    invalidate();
    setSteps((s) => {
      const next = [...s];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
    sounds.snap();
  }
  function removePiece(index: number) {
    if (locked) return;
    invalidate();
    setSteps((s) => s.filter((_, i) => i !== index));
    sounds.whoosh();
  }

  function onDragStart(event: DragEvent, payload: string) {
    event.dataTransfer.setData("text/plain", payload);
    event.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }
  function onDragEnd() {
    setDragging(false);
    setDragOver(null);
  }
  function onDropAt(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    onDragEnd();
    const payload = event.dataTransfer.getData("text/plain");
    if (payload.startsWith("tray:")) addPiece(payload.slice(5), index);
    else if (payload.startsWith("row:")) {
      const from = Number(payload.slice(4));
      if (Number.isInteger(from)) movePiece(from, index > from ? index - 1 : index);
    }
  }
  function onDropTray(event: DragEvent) {
    event.preventDefault();
    onDragEnd();
    const payload = event.dataTransfer.getData("text/plain");
    if (payload.startsWith("row:")) removePiece(Number(payload.slice(4)));
  }

  // ---- Compose editing ----------------------------------------------------------------------
  function pickPiece(slot: string, id: string) {
    if (locked) return;
    invalidate();
    setPicks((p) => ({ ...p, [slot]: id }));
    sounds.snap();
    const next = slots.find((s) => s.id !== slot && !picks[s.id] && slots.indexOf(s) > slots.findIndex((x) => x.id === slot)) ?? slots.find((s) => s.id !== slot && !picks[s.id]);
    if (next) setActiveSlot(next.id);
  }
  function dropOnSlot(event: DragEvent, slot: string) {
    event.preventDefault();
    onDragEnd();
    const payload = event.dataTransfer.getData("text/plain");
    if (!payload.startsWith("tray:")) return;
    const piece = byId.get(payload.slice(5));
    if (piece?.slot === slot) pickPiece(slot, piece.id);
    else {
      sounds.error();
      setNote("That choice belongs to a different blank.");
    }
  }

  // ---- Build and run ------------------------------------------------------------------------
  function build() {
    if (locked || submissionSteps.length === 0) return;
    clearTimers();
    const result = simulateBuild(round, submissionSteps);
    setReport(result);
    setNote(null);
    setRunShown(0);
    setRebuildShown(0);
    const layers = result.layers;
    if (reduced) {
      setColdShown(layers.length);
      setRebuildShown(result.ok && !compose ? layers.length : 0);
      setPhase("built");
      if (result.ok) sounds.ok();
      else sounds.error();
      return;
    }
    setColdShown(0);
    setPhase("cold");
    sounds.whoosh();
    layers.forEach((_, i) => later(() => { setColdShown(i + 1); sounds.snap(); }, 250 * (i + 1)));
    const coldEnd = 250 * (layers.length + 1);
    if (!result.ok || compose) {
      later(() => {
        setPhase("built");
        if (result.ok) sounds.ok();
      else sounds.error();
      }, coldEnd);
      return;
    }
    later(() => { setPhase("rebuild"); setRebuildShown(0); sounds.whoosh(); }, coldEnd + 150);
    let at = coldEnd + 150;
    layers.forEach((layer, i) => {
      at += layer.cached ? 100 : 250;
      later(() => { setRebuildShown(i + 1); if (layer.cached) sounds.coin();
        else sounds.snap(); }, at);
    });
    later(() => { setPhase("built"); sounds.ok(); }, at + 200);
  }

  function run() {
    if (locked || !report || !report.ok) return;
    clearTimers();
    setRunShown(0);
    setPhase("running");
    sounds.boot();
    const total = report.runLog.length;
    const finish = () => {
      setPhase("ran");
      if (report.started && report.reachable) sounds.win(2);
      else sounds.error();
    };
    if (reduced || total === 0) {
      setRunShown(total);
      return finish();
    }
    report.runLog.forEach((_, i) => later(() => { setRunShown(i + 1); sounds.key(); }, 350 * (i + 1)));
    later(finish, 350 * (total + 1));
  }

  function revealHint() {
    if (hintsUsed >= round.hints.length) return;
    setHintsUsed(hintsUsed + 1);
    sounds.ok();
  }

  const ranOrBuilt = phase === "built" || phase === "running" || phase === "ran";
  const checks: FrameCheck[] = round.goals.map((g, i) => {
    const id = String(i);
    if (!report || (RUN_GOALS.has(g.kind) && phase !== "ran") || phase === "cold" || phase === "rebuild") return { id, label: g.label, state: "wait" };
    const met = checkBuildGoal(report, g);
    return { id, label: g.label, state: met ? "pass" : "fail", detail: met ? undefined : failDetail(report, g) };
  });
  const passed = checks.filter((c) => c.state === "pass").length;
  const allMet = phase === "ran" && passed === checks.length;
  const unplaced = round.pieces.filter((p) => !steps.includes(p.id));
  const slotPieces = round.pieces.filter((p) => p.slot === activeSlot);
  const activeLabel = slots.find((s) => s.id === activeSlot)?.label;

  let primary: Primary;
  if (phase === "cold" || phase === "rebuild") primary = { label: "Building...", onClick: () => {}, disabled: true };
  else if (phase === "running") primary = { label: "Running...", onClick: () => {}, disabled: true };
  else if (phase === "built" && report?.ok) primary = { label: "Run", onClick: run, pulse: true };
  else if (phase === "ran") primary = { label: "Finish", onClick: () => onFinish({ mode: "build", steps: submissionSteps, hints: hintsUsed }), disabled: !allMet, pulse: allMet };
  else primary = { label: compose ? "Build stack" : "Build image", onClick: build, disabled: placed === 0 };

  const coldLayers = report ? report.layers.slice(0, coldShown) : [];
  const coldDone = report !== null && coldShown >= report.layers.length;
  const rebuildLayers = report ? report.layers.slice(0, rebuildShown) : [];
  const rebuildActive = report?.ok && !compose && (phase === "rebuild" || ranOrBuilt);
  const noun = compose ? "blanks" : "pieces";

  const tray = (
    <section aria-label={compose ? "Choices" : "Pieces"} onDragOver={(e) => e.preventDefault()} onDrop={onDropTray}>
      <SectionLabel right={compose ? undefined : `${unplaced.length} left`}>
        {compose ? `Choices for: ${activeLabel ?? "pick a blank"}` : "Pieces"}
      </SectionLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {(compose ? slotPieces : unplaced).map((p) => {
          const selected = compose && picks[p.slot ?? ""] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              draggable={!locked}
              disabled={locked}
              onDragStart={(e) => onDragStart(e, `tray:${p.id}`)}
              onDragEnd={onDragEnd}
              onClick={() => (compose ? pickPiece(p.slot ?? "", p.id) : addPiece(p.id))}
              aria-pressed={compose ? selected : undefined}
              className={cn(
                "min-h-11 cursor-grab break-all border px-3 py-2 text-left font-mono text-[14px] transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:opacity-50",
                selected ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" : "border-border bg-card",
              )}
            >
              {p.text}
            </button>
          );
        })}
        {!compose && unplaced.length === 0 ? <p className="text-sm text-muted-foreground">Every piece is placed. Take one out to change the order.</p> : null}
      </div>
    </section>
  );

  const gutter = "w-8 shrink-0 select-none border-r border-[var(--code-border)] bg-black/[0.04] pr-2 text-right font-mono text-[12px] leading-[2.75rem] text-muted-foreground dark:bg-white/[0.04]";

  const surface = compose ? (
    <section aria-label="docker-compose.yml">
      <SectionLabel right={`${placed} of ${slots.length} blanks filled`}>docker-compose.yml</SectionLabel>
      <ol className="mt-2 border border-[var(--code-border)] bg-[var(--code-surface)] font-mono text-[14px] text-[var(--code-fg)]">
        {(round.skeleton ?? []).map((line, i) => {
          if ("text" in line) {
            return (
              <li key={i} className="flex min-h-8 border-b border-[var(--code-border)] last:border-b-0">
                <span className={cn(gutter, "leading-8")}>{i + 1}</span>
                <span className="min-w-0 flex-1 whitespace-pre px-3 leading-8 text-[var(--code-lang-fg)]">{line.text}</span>
              </li>
            );
          }
          const slot = slots.find((s) => s.id === line.slot)!;
          const chosen = picks[slot.id] ? byId.get(picks[slot.id]!) : undefined;
          const active = activeSlot === slot.id;
          return (
            <li key={i} className="flex border-b border-[var(--code-border)] last:border-b-0">
              <span className={gutter}>{i + 1}</span>
              <button
                type="button"
                disabled={locked}
                onClick={() => setActiveSlot(slot.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => dropOnSlot(e, slot.id)}
                aria-label={`Line ${i + 1}, ${slot.label}: ${chosen ? chosen.text : "empty"}`}
                aria-current={active}
                className={cn(
                  "min-h-11 min-w-0 flex-1 break-all py-1 pr-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  active && "outline outline-2 -outline-offset-2 outline-primary",
                  chosen ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-background/40",
                )}
                style={{ paddingLeft: `calc(${slot.indent}ch + 0.75rem)` }}
              >
                {chosen ? chosen.text : <span className="font-sans text-[13px] text-muted-foreground">Empty. Tap a choice for: {slot.label}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {note ? <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="status">{note}</p> : null}
    </section>
  ) : (
    <section aria-label="Dockerfile" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropAt(e, steps.length)}>
      <SectionLabel right={`${steps.length} ${steps.length === 1 ? "line" : "lines"}`}>Dockerfile</SectionLabel>
      <div className="mt-2 border border-[var(--code-border)] bg-[var(--code-surface)] font-mono text-[14px] text-[var(--code-fg)]">
        {steps.length === 0 ? (
          <p className="px-3 py-5 text-center font-sans text-[15px] font-medium text-muted-foreground">Tap a piece to add the first line</p>
        ) : (
          <ol aria-label="Dockerfile lines">
            {steps.map((id, i) => {
              const bad = live?.tone === "bad" && live.line === i;
              return (
                <li
                  key={id}
                  draggable={!locked}
                  onDragStart={(e) => onDragStart(e, `row:${i}`)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => onDropAt(e, i)}
                  className={cn(
                    "flex min-h-11 items-stretch border-b border-[var(--code-border)] last:border-b-0 sm:cursor-grab",
                    bad && "bg-red-50 dark:bg-red-950/40",
                    dragOver === i && "shadow-[inset_0_2px_0_0_var(--color-primary)]",
                  )}
                >
                  <span className={cn(gutter, bad && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300")}>{i + 1}</span>
                  <GripVertical className="m-auto hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
                  <span className="min-w-0 flex-1 px-1.5 py-2.5 text-[13px] leading-snug [overflow-wrap:anywhere] sm:px-2 sm:text-[14px]">{byId.get(id)?.text}</span>
                  <button type="button" disabled={locked || i === 0} onClick={() => movePiece(i, i - 1)} aria-label={`Move line ${i + 1} up`} className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:bg-secondary disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button type="button" disabled={locked || i === steps.length - 1} onClick={() => movePiece(i, i + 1)} aria-label={`Move line ${i + 1} down`} className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:bg-secondary disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button type="button" disabled={locked} onClick={() => removePiece(i)} aria-label={`Remove line ${i + 1}`} className="grid size-11 shrink-0 place-items-center text-muted-foreground hover:bg-red-100 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-red-950">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {dragging ? <p className="border-t border-dashed border-muted-foreground/50 px-3 py-3 text-center font-sans text-[13px] text-muted-foreground">Drop here to add at the end</p> : null}
      </div>
      <div className="mt-2" aria-live="polite">
        {live ? (
          <Strip tone={live.tone} tag={live.tag} role="status">{live.text}</Strip>
        ) : steps.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">No problem found so far. Press Build image when the lines are in order.</p>
        ) : null}
      </div>
    </section>
  );

  const buildPanel = (
    <section aria-label="Build" className="space-y-3">
      <SectionLabel right={report ? `${coldShown} of ${report.layers.length} ${compose ? "services" : "layers"}` : undefined}>
        {compose ? "Pull and start" : "Build"}
      </SectionLabel>

      {!report ? (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          {compose
            ? "Nothing started yet. Fill every blank, then press Build stack."
            : "Nothing built yet. Each line becomes a layer. Docker reuses a layer when nothing above it changed."}
        </p>
      ) : (
        <>
          <LayerList layers={coldLayers} mode="cold" compose={compose} />
          {coldDone && report.error ? <Strip tone="bad" tag="Failed" role="alert">{report.error}</Strip> : null}
          {coldDone && report.ok ? (
            <Strip tone="good" tag="Built" role="status">
              {compose
                ? `${report.layers.length} services ready in ${seconds(report.coldSec)}.`
                : `Built in ${seconds(report.coldSec)}. Image is ${report.sizeMb} MB. A rebuild takes ${seconds(report.rebuildSec)}.`}
            </Strip>
          ) : null}
          {coldDone && report.ok && phase !== "cold" ? report.warnings.map((w) => <Strip key={w} tone="info" tag="Note">{w}</Strip>) : null}

          {rebuildActive ? (
            <div className="space-y-2 pt-1">
              <SectionLabel right={`${rebuildShown} of ${report.layers.length}`}>Rebuild after a code change</SectionLabel>
              <LayerList layers={rebuildLayers} mode="rebuild" compose={false} />
            </div>
          ) : null}

          {(phase === "running" || phase === "ran") && report.ok ? (
            <div className="space-y-2 pt-1">
              <SectionLabel>{compose ? "Services" : "Container"}</SectionLabel>
              <div className="border border-[var(--code-border)] bg-[var(--code-surface)] p-3 font-mono text-[13px] text-[var(--code-fg)]" role="log" aria-live="polite">
                {report.runLog.slice(0, runShown).map((line, i) => (
                  <div key={i} className={cn("break-words", /started|answers|listening/.test(line) ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{line}</div>
                ))}
              </div>
              {phase === "ran" ? (
                report.started && report.reachable ? (
                  <Strip tone="good" tag="Running" role="status">{compose ? `Every service is up and localhost:${report.port} answers.` : `The container runs and localhost:${report.port} answers.`}</Strip>
                ) : (
                  <Strip tone="bad" tag="Failed" role="alert">{report.started ? "It runs, but nobody can reach it yet. Check the port." : "It did not start. Read the log above."}</Strip>
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );

  const { level, levelNumber } = levelOf(roundIndex);
  return (
    <>
      <GameFrame
        level={level}
        levelNumber={levelNumber}
        title={round.title}
        brief={round.brief}
        steps={compose ? COMPOSE_STEPS : STEPS}
        actions={<HeaderActions hints={round.hints} hintsUsed={hintsUsed} onHint={revealHint} onReset={() => { sounds.whoosh(); resetAll(); }} primary={primary} locked={locked} />}
      >
        {/* On a phone the order is pieces, Dockerfile, checks, build. On a desktop it is two columns: pieces and checks, then Dockerfile and build. */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="contents lg:block lg:min-w-0 lg:space-y-5">
            <div className="order-1 min-w-0 lg:order-none">{tray}</div>
            <div className="order-3 min-w-0 lg:order-none">
              <MissionPanel checks={checks} counter={{ noun, value: placed, par: compose ? slots.length : round.par, threeStarsAt: compose ? slots.length : round.par }} hints={round.hints} hintsUsed={hintsUsed} />
            </div>
          </div>
          <div className="contents lg:block lg:min-w-0 lg:space-y-5">
            <div className="order-2 min-w-0 lg:order-none">{surface}</div>
            <div className="order-4 min-w-0 lg:order-none">{buildPanel}</div>
          </div>
        </div>
      </GameFrame>
      <MobileBar primary={primary} passed={passed} total={checks.length} locked={locked} />
    </>
  );
}
