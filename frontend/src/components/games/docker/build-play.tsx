"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock, Hammer, GripVertical, HardDrive, Layers, Play, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameSounds } from "@/lib/games/audio";
import { checkBuildGoal, simulateBuild, type BuildGoal, type BuildLayer, type BuildReport } from "@/shared/games/docker/builder";
import type { BuildRound, BuildSubmission } from "@/shared/games/docker/engine";
import { MissionPanel } from "./mission-panel";
import { useReducedMotion } from "./docker-styles";

type Props = {
  round: BuildRound;
  attempt: number;
  locked: boolean;
  sounds: GameSounds;
  onFinish: (submission: BuildSubmission) => void;
};

type Phase = "edit" | "cold" | "rebuild" | "built" | "running" | "ran";

const RUN_GOALS = new Set<BuildGoal["kind"]>(["runs", "reachable"]);

function layerTone(label: string): string {
  const word = label.split(/[\s:]/)[0]?.toUpperCase() ?? "";
  if (word === "FROM") return "border-sky-500/60 bg-sky-500/10";
  if (word === "COPY") return "border-amber-500/60 bg-amber-500/10";
  if (word === "RUN") return "border-violet-500/60 bg-violet-500/10";
  return "border-border bg-secondary/60";
}

function seconds(n: number) {
  return `${n.toFixed(1)} s`;
}

function LayerStack({ layers, mode, total }: { layers: BuildLayer[]; mode: "cold" | "rebuild"; total: number }) {
  return (
    <ol className="space-y-1" aria-label={mode === "cold" ? "Build layers" : "Rebuild layers"}>
      {layers.map((layer, i) => (
        <li
          key={`${mode}-${i}`}
          className={cn(
            "dk-stack flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[12.5px]",
            layer.failed ? "border-red-500/70 bg-red-500/10" : layerTone(layer.label),
          )}
        >
          <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{layer.label}</span>
          {mode === "rebuild" ? (
            <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold", layer.cached ? "bg-emerald-500 text-white" : "bg-amber-500 text-black")}>{layer.cached ? "CACHED" : "REBUILT"}</span>
          ) : null}
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {mode === "rebuild" ? (layer.cached ? "0.1 s" : seconds(layer.seconds)) : `${layer.sizeMb > 0 ? `+${layer.sizeMb} MB, ` : ""}${seconds(layer.seconds)}`}
          </span>
          {layer.failed ? <AlertTriangle className="size-3.5 shrink-0 text-red-500" aria-label="failed" /> : null}
        </li>
      ))}
      {layers.length === 0 ? <li className="text-xs text-muted-foreground">Waiting for the first layer ({total} in all)...</li> : null}
    </ol>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={cn("rounded-md border p-2.5", tone === "good" ? "border-emerald-500/60 bg-emerald-500/10" : tone === "bad" ? "border-red-500/60 bg-red-500/10" : "border-border bg-secondary/50")}>
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{icon} {label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Build mode: put a Dockerfile or a compose file together from pieces, build it, then run it. */
export function BuildPlay({ round, attempt, locked, sounds, onFinish }: Props) {
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
  const timers = useRef<number[]>([]);
  const firstAttempt = useRef(attempt);

  const byId = useMemo(() => new Map(round.pieces.map((p) => [p.id, p])), [round.pieces]);
  const slots = round.slots ?? [];
  const submissionSteps = useMemo(
    () => (compose ? slots.filter((s) => picks[s.id]).map((s) => `${s.id}:${picks[s.id]}`) : steps),
    [compose, slots, picks, steps],
  );
  const placed = compose ? Object.keys(picks).length : steps.length;

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
  }
  function onDropAt(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const payload = event.dataTransfer.getData("text/plain");
    if (payload.startsWith("tray:")) addPiece(payload.slice(5), index);
    else if (payload.startsWith("row:")) {
      const from = Number(payload.slice(4));
      if (Number.isInteger(from)) movePiece(from, index > from ? index - 1 : index);
    }
  }
  function onDropTray(event: DragEvent) {
    event.preventDefault();
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
    const payload = event.dataTransfer.getData("text/plain");
    if (!payload.startsWith("tray:")) return;
    const piece = byId.get(payload.slice(5));
    if (piece?.slot === slot) pickPiece(slot, piece.id);
    else {
      sounds.error();
      setNote("That piece belongs to a different blank.");
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
      result.ok ? sounds.ok() : sounds.error();
      return;
    }
    setColdShown(0);
    setPhase("cold");
    sounds.whoosh();
    layers.forEach((_, i) => later(() => { setColdShown(i + 1); sounds.snap(); }, 420 * (i + 1)));
    const coldEnd = 420 * (layers.length + 1);
    if (!result.ok || compose) {
      later(() => {
        setPhase("built");
        result.ok ? sounds.ok() : sounds.error();
      }, coldEnd);
      return;
    }
    later(() => { setPhase("rebuild"); setRebuildShown(0); sounds.whoosh(); }, coldEnd + 200);
    let at = coldEnd + 200;
    layers.forEach((layer, i) => {
      at += layer.cached ? 160 : 420;
      later(() => { setRebuildShown(i + 1); layer.cached ? sounds.coin() : sounds.snap(); }, at);
    });
    later(() => { setPhase("built"); sounds.ok(); }, at + 250);
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
      report.started && report.reachable ? sounds.win(2) : sounds.error();
    };
    if (reduced || total === 0) {
      setRunShown(total);
      return finish();
    }
    report.runLog.forEach((_, i) => later(() => { setRunShown(i + 1); sounds.key(); }, 500 * (i + 1)));
    later(finish, 500 * (total + 1));
  }

  function revealHint() {
    if (hintsUsed >= round.hints.length) return;
    setHintsUsed(hintsUsed + 1);
    sounds.ok();
  }

  const ranOrBuilt = phase === "built" || phase === "running" || phase === "ran";
  const goals = round.goals.map((g) => {
    if (!report) return { label: g.label, met: null };
    if (RUN_GOALS.has(g.kind) && phase !== "ran") return { label: g.label, met: null };
    if (phase === "cold" || phase === "rebuild") return { label: g.label, met: null };
    return { label: g.label, met: checkBuildGoal(report, g) };
  });
  const allMet = phase === "ran" && goals.every((g) => g.met);
  const unplaced = round.pieces.filter((p) => !steps.includes(p.id));
  const slotPieces = round.pieces.filter((p) => p.slot === activeSlot);
  const busy = phase === "cold" || phase === "rebuild" || phase === "running";

  const coldLayers = report ? report.layers.slice(0, coldShown) : [];
  const coldDone = report !== null && coldShown >= report.layers.length;
  const pct = report && report.layers.length ? Math.round((coldShown / report.layers.length) * 100) : 0;
  const rebuildLayers = report ? report.layers.slice(0, rebuildShown) : [];
  const rebuildTime = rebuildLayers.reduce((sum, l) => sum + (l.cached ? 0.1 : l.seconds), 0);
  const coldTime = coldLayers.reduce((sum, l) => sum + l.seconds, 0);
  const rebuildActive = report?.ok && !compose && (phase === "rebuild" || ranOrBuilt);

  const tray = (
    <div
      className="rounded-md border border-border bg-card p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropTray}
    >
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {compose ? `Choices for: ${slots.find((s) => s.id === activeSlot)?.label ?? "pick a blank"}` : "Pieces"}
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">
        {compose ? "Tap a choice, or drag it onto its blank. Only one is right." : "Tap a piece to add it, or drag it into the Dockerfile. Drag a line back here to take it out."}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={compose ? "Choices" : "Pieces"}>
        {(compose ? slotPieces : unplaced).map((p) => {
          const selected = compose && picks[p.slot ?? ""] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              draggable={!locked}
              disabled={locked}
              onDragStart={(e) => onDragStart(e, `tray:${p.id}`)}
              onClick={() => (compose ? pickPiece(p.slot ?? "", p.id) : addPiece(p.id))}
              aria-pressed={compose ? selected : undefined}
              className={cn(
                "min-h-10 cursor-grab rounded-md border bg-secondary px-3 py-2 text-left font-mono text-[13px] shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:opacity-50",
                selected ? "border-emerald-500 bg-emerald-500/10" : "border-border",
              )}
            >
              {p.text}
            </button>
          );
        })}
        {!compose && unplaced.length === 0 ? <p className="text-sm text-muted-foreground">Every piece is placed. Take one out if you want to change it.</p> : null}
      </div>
    </div>
  );

  const surface = compose ? (
    <div className="rounded-md border border-[var(--code-border)] bg-[var(--code-surface)] p-3 font-mono text-[13px] text-[var(--code-fg)]">
      <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">docker-compose.yml</p>
      <div className="space-y-1">
        {(round.skeleton ?? []).map((line, i) => {
          if ("text" in line) return <div key={i} className="whitespace-pre border border-transparent px-2 text-[var(--code-lang-fg)]">{line.text}</div>;
          const slot = slots.find((s) => s.id === line.slot)!;
          const chosen = picks[slot.id] ? byId.get(picks[slot.id]!) : undefined;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => setActiveSlot(slot.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => dropOnSlot(e, slot.id)}
              aria-label={`${slot.label}: ${chosen ? chosen.text : "empty"}`}
              aria-current={activeSlot === slot.id}
              className={cn(
                "block w-full rounded-sm border px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                chosen ? "border-emerald-500/60 bg-emerald-500/10 motion-safe:animate-[bm-pop_0.3s_ease-out_both]" : "border-dashed border-muted-foreground/50",
                activeSlot === slot.id && "ring-2 ring-primary",
              )}
              style={{ paddingLeft: `calc(${slot.indent}ch + 0.5rem)` }}
            >
              {chosen ? chosen.text : <span className="font-sans text-xs text-muted-foreground">choose: {slot.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="rounded-md border border-[var(--code-border)] bg-[var(--code-surface)] p-3 font-mono text-[13px] text-[var(--code-fg)]" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropAt(e, steps.length)}>
      <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">Dockerfile</p>
      <ol className="space-y-1" aria-label="Dockerfile lines">
        {steps.map((id, i) => (
          <li
            key={id}
            draggable={!locked}
            onDragStart={(e) => onDragStart(e, `row:${i}`)}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDropAt(e, i)}
            className={cn(
              "flex items-center gap-1.5 rounded-sm border border-transparent bg-background/60 py-0.5 pl-1 pr-0.5 motion-safe:animate-[bm-pop_0.25s_ease-out_both]",
              dragOver === i && "border-primary",
            )}
          >
            <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
            <span className="w-4 shrink-0 select-none text-right text-[11px] text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 break-all py-1">{byId.get(id)?.text}</span>
            <button type="button" disabled={locked || i === 0} onClick={() => movePiece(i, i - 1)} aria-label={`Move line ${i + 1} up`} className="grid size-8 place-items-center rounded-sm hover:bg-secondary disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button type="button" disabled={locked || i === steps.length - 1} onClick={() => movePiece(i, i + 1)} aria-label={`Move line ${i + 1} down`} className="grid size-8 place-items-center rounded-sm hover:bg-secondary disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <ArrowDown className="size-4" aria-hidden />
            </button>
            <button type="button" disabled={locked} onClick={() => removePiece(i)} aria-label={`Remove line ${i + 1}`} className="grid size-8 place-items-center rounded-sm hover:bg-red-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      {steps.length === 0 ? <p className="rounded-sm border border-dashed border-muted-foreground/50 p-4 text-center font-sans text-sm text-muted-foreground">Empty. Add the first line (FROM).</p> : null}
      {steps.length > 0 && dragOver === null ? <div className="mt-1 h-6 rounded-sm border border-dashed border-muted-foreground/30" aria-hidden /> : null}
    </div>
  );

  const buildPanel = (
    <section aria-label="Build" className="rounded-md border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={build} disabled={locked || busy || placed === 0}>
          <Hammer className="mr-1.5 size-4" aria-hidden /> {compose ? "Build: docker compose up" : "Build the image"}
        </Button>
        <Button type="button" variant="outline" onClick={run} disabled={locked || !report?.ok || !(phase === "built" || phase === "ran")}>
          <Play className="mr-1.5 size-4" aria-hidden /> Run
        </Button>
        {note ? <span className="text-sm text-muted-foreground" role="status">{note}</span> : null}
      </div>

      {!report ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {compose ? "Fill every blank, then build. Docker pulls each image and starts the services in order." : "Put the lines in order, then build. Each line becomes a layer, and Docker reuses a layer when nothing above it changed."}
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <span>{compose ? "Pull and create" : "Build"}</span>
              <span className="tabular-nums">{coldShown}/{report.layers.length || 0} {compose ? "images" : "layers"}</span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Build progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-all duration-300", report.ok ? "bg-primary" : "bg-red-500")} style={{ width: `${report.layers.length ? pct : report.error ? 100 : 0}%` }} />
            </div>
            <LayerStack layers={coldLayers} mode="cold" total={report.layers.length} />
            {coldDone && report.error ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-500/60 bg-red-500/10 p-2.5 text-sm" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden /> {report.error}
              </p>
            ) : null}
            {coldDone && !report.error && report.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">{report.warnings.map((w) => <li key={w}>Warning: {w}</li>)}</ul>
            ) : null}
          </div>

          {rebuildActive ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <span>Change one line of code, build again</span>
                <span className="tabular-nums">{rebuildShown}/{report.layers.length}</span>
              </div>
              <LayerStack layers={rebuildLayers} mode="rebuild" total={report.layers.length} />
            </div>
          ) : null}

          {report.ok ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Build read-outs">
              <Tile icon={<Clock className="size-3" aria-hidden />} label={compose ? "Pull time" : "Build time"} value={seconds(phase === "cold" ? coldTime : report.coldSec)} />
              {compose ? (
                <Tile icon={<Layers className="size-3" aria-hidden />} label="Services" value={String(report.layers.length)} />
              ) : (
                <Tile icon={<Zap className="size-3" aria-hidden />} label="Rebuild" value={seconds(phase === "rebuild" ? rebuildTime : report.rebuildSec)} tone={ranOrBuilt ? (report.cacheFriendly ? "good" : "bad") : undefined} />
              )}
              <Tile icon={<HardDrive className="size-3" aria-hidden />} label="Image size" value={`${report.sizeMb} MB`} />
            </div>
          ) : null}

          {(phase === "running" || phase === "ran") && report.ok ? (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">{compose ? "Services" : "Container"}</p>
              <div className="rounded-md border border-[var(--code-border)] bg-[var(--code-surface)] p-2.5 font-mono text-xs text-[var(--code-fg)]" role="log" aria-live="polite">
                {report.runLog.slice(0, runShown).map((line, i) => (
                  <div key={i} className={cn("dk-stack", /started|answers|listening/.test(line) ? "text-emerald-500" : "text-red-500 dark:text-red-400")}>{line}</div>
                ))}
              </div>
              {phase === "ran" ? (
                <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-semibold", report.started && report.reachable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {report.started && report.reachable ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                  {report.started && report.reachable ? (compose ? `Everything is up and localhost:${report.port} answers.` : `The container is running and localhost:${report.port} answers.`) : report.started ? "It runs, but nobody can reach it yet." : "It did not start."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <MissionPanel
        title="Mission"
        goals={goals}
        counter={{ label: placed === 1 ? "piece" : "pieces", value: placed, par: compose ? slots.length : round.par, limit: 40, text: compose ? `${placed} of ${slots.length} blanks filled` : undefined }}
        hints={round.hints}
        hintsUsed={hintsUsed}
        onHint={revealHint}
        onReset={() => { sounds.whoosh(); resetAll(); }}
        onFinish={() => onFinish({ mode: "build", steps: submissionSteps, hints: hintsUsed })}
        finishLabel={allMet ? "Finish: all goals met" : "Finish and check"}
        canFinish={placed > 0}
        ready={allMet}
        locked={locked}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          {tray}
          {surface}
        </div>
        <div className="min-w-0">{buildPanel}</div>
      </div>
    </div>
  );
}
