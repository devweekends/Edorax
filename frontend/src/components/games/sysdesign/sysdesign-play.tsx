"use client";

// System Design Runner. A production incident on a small AWS system: pick a few changes, press Run,
// and watch 24 hours of traffic play out. The result comes from the shared engine, so the browser and
// the server always agree.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Lightbulb, Play, RotateCcw, SkipForward, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { costDelta, evaluateGoals, simulate, STEPS, type SimResult, type SysdesignRound, type SysdesignSubmission } from "@/shared/games/sysdesign/engine";
import type { GamePlayProps } from "../types";
import { SystemDiagram, utilTone } from "./diagram";

const STEP_MS = 520;
const STEP_MS_REDUCED = 160;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  // The reduced motion setting can only be read in the browser, after mount.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(query.matches);
    const on = () => setReduced(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return reduced;
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const toneText = (ok: boolean) => (ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400");

function Gauge({ label, text, fill, goal, ok, goalText }: { label: string; text: string; fill: number; goal: number; ok: boolean; goalText: string }) {
  const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/60 p-2">
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold leading-tight tabular-nums", toneText(ok))}>{text}</p>
      <div className="relative mt-1.5 h-2 rounded-full bg-secondary" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-300", ok ? "bg-emerald-500" : "bg-red-500")} style={{ width: pct(fill) }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70" style={{ left: pct(goal) }} />
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{goalText}</p>
    </div>
  );
}

function UtilBar({ label, value, note }: { label: string; value: number; note?: string }) {
  const tone = utilTone(value);
  const color = tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500";
  const percent = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", tone === "bad" ? "font-bold text-red-600 dark:text-red-400" : "text-muted-foreground")}>{note ?? `${percent}%`}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-secondary" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)}>
        <div className={cn("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

/** 24 bars, one per hour: the traffic of the day, coloured by how the system did while it ran. */
function Timeline({ round, sim, step, ran }: { round: SysdesignRound; sim: SimResult; step: number; ran: boolean }) {
  const max = Math.max(1, ...round.traffic);
  return (
    <div>
      <div className="flex h-16 items-end gap-[2px]" role="img" aria-label="Traffic over 24 hours">
        {round.traffic.map((load, t) => {
          const result = sim.steps[t]!;
          const seen = ran && t <= step;
          const color = !seen ? "bg-muted-foreground/35" : result.status === "down" ? "bg-red-500" : result.status === "slow" ? "bg-amber-500" : "bg-emerald-500";
          const inOutage = round.outage && t >= round.outage.from && t <= round.outage.to;
          const inBatch = round.batchJob && t >= round.batchJob.from && t <= round.batchJob.to;
          return (
            <div key={t} className="relative flex h-full flex-1 items-end">
              <div className={cn("w-full rounded-t-sm transition-colors", color, ran && t === step && "ring-2 ring-foreground")} style={{ height: `${Math.max(6, (load / max) * 100)}%` }} />
              {inOutage || inBatch ? <span className={cn("absolute -bottom-1.5 left-0 right-0 h-1 rounded", inOutage ? "bg-red-500" : "bg-amber-500")} /> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        One bar is one hour of traffic.
        {round.outage ? " Red line: a zone fails." : ""}
        {round.batchJob ? " Amber line: the report job runs." : ""}
      </p>
    </div>
  );
}

export default function SysdesignPlay({ round, attempt, locked, sounds, onFinish }: GamePlayProps<SysdesignRound, SysdesignSubmission>) {
  const reduced = useReducedMotion();
  const [picked, setPicked] = useState<string[]>([]);
  const [phase, setPhase] = useState<"plan" | "run" | "done">("plan");
  const [step, setStep] = useState(0);
  const [runSim, setRunSim] = useState<SimResult | null>(null);
  const [hints, setHints] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const finishRef = useRef(onFinish);
  // eslint-disable-next-line react-hooks/refs -- keeps the latest callback for timers that outlive a render
  finishRef.current = onFinish;
  const lastStatus = useRef("ok");
  const runPicked = useRef<string[]>([]);

  const baseline = useMemo(() => simulate(round, []), [round]);
  const preview = useMemo(() => simulate(round, picked), [round, picked]);
  const deltas = useMemo(() => Object.fromEntries(round.changes.map((c) => [c.id, costDelta(round, c.id)])), [round]);
  const forecastOk = useMemo(() => evaluateGoals(round.goals, preview).every((g) => g.met), [round, preview]);

  // A new attempt (or a new round) starts from scratch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked([]);
    setPhase("plan");
    setStep(0);
    setRunSim(null);
    setHints(0);
    setNotice(null);
    lastStatus.current = "ok";
    sounds.alarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, round.id]);

  // Plays the day, one hour at a time.
  useEffect(() => {
    if (phase !== "run" || !runSim) return;
    const current = runSim.steps[step];
    if (current) {
      if (current.status !== "ok" && lastStatus.current === "ok") sounds.alarm();
      lastStatus.current = current.status;
    }
    const wait = step >= STEPS - 1 ? 700 : reduced ? STEP_MS_REDUCED : STEP_MS;
    const timer = window.setTimeout(() => {
      if (step >= STEPS - 1) {
        setPhase("done");
        finishRef.current({ changes: runPicked.current });
      } else {
        setStep(step + 1);
      }
    }, wait);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step, runSim, reduced]);

  const toggle = useCallback(
    (id: string) => {
      if (locked || phase === "run") return;
      if (phase === "done") {
        setPhase("plan");
        setRunSim(null);
      }
      setNotice(null);
      if (picked.includes(id)) {
        sounds.key();
        setPicked(picked.filter((p) => p !== id));
        return;
      }
      if (picked.length >= round.maxChanges) {
        sounds.error();
        setShaking(true);
        window.setTimeout(() => setShaking(false), 450);
        setNotice(`You can use only ${round.maxChanges} changes. Remove one first.`);
        return;
      }
      sounds.snap();
      setPicked([...picked, id]);
    },
    [locked, phase, picked, round.maxChanges, sounds],
  );

  function run() {
    if (locked || phase === "run") return;
    const sim = simulate(round, picked);
    runPicked.current = picked;
    lastStatus.current = "ok";
    setNotice(null);
    setRunSim(sim);
    setStep(0);
    setPhase("run");
    sounds.boot();
    sounds.whoosh();
  }

  function hint() {
    if (hints >= round.hints.length) return;
    sounds.ok();
    setHints(hints + 1);
  }

  function clearAll() {
    if (locked || phase === "run") return;
    sounds.key();
    setPicked([]);
    setNotice(null);
    if (phase === "done") {
      setPhase("plan");
      setRunSim(null);
    }
  }

  const running = phase === "run";
  const shown = running && runSim ? runSim : preview;
  const current = running && runSim ? runSim.steps[step]! : null;
  const showFinal = phase === "done";
  const goals = round.goals;

  let availability = shown.availability;
  if (current && runSim) {
    let load = 0;
    let ok = 0;
    for (let t = 0; t <= step; t++) {
      load += runSim.steps[t]!.load;
      ok += runSim.steps[t]!.load * runSim.steps[t]!.success;
    }
    availability = load > 0 ? Math.round((ok / load) * 10000) / 100 : 100;
  }
  const p95 = current ? current.p95Ms : shown.p95Ms;
  const cost = current ? current.costToDate : shown.costUsd;
  const checks = evaluateGoals(goals, shown);
  const allMet = checks.every((c) => c.met);
  const peakReplica = Math.max(0, ...shown.steps.map((s) => s.replicaUtil));
  const m = shown.model;
  const resolved = showFinal ? allMet : forecastOk;
  const lines = [...shown.costLines].sort((a, b) => b.usd - a.usd);
  const costMax = Math.max(1, ...lines.map((l) => l.usd));

  return (
    <div className="space-y-4">
      {/* Incident banner */}
      <div
        role="alert"
        className={cn(
          "relative flex items-start gap-3 overflow-hidden rounded-md border-2 p-3 sm:p-4",
          resolved ? "border-emerald-500/70 bg-emerald-500/10" : "border-red-500 bg-red-500/10",
        )}
      >
        {!resolved ? <span aria-hidden className="pointer-events-none absolute inset-0 bg-red-500/15 motion-safe:animate-pulse" /> : null}
        <TriangleAlert className={cn("relative mt-0.5 size-5 shrink-0", resolved ? "text-emerald-600" : "text-red-500 motion-safe:animate-pulse")} aria-hidden />
        <div className="relative min-w-0">
          <p className={cn("text-xs font-bold uppercase tracking-widest", resolved ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {resolved ? (showFinal ? "Incident resolved" : "Forecast looks stable. Press Run to prove it.") : "Incident"}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug">{round.incident}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        {/* Left: gauges, diagram, timeline, bars */}
        <section aria-label="The system" className="min-w-0 space-y-3 rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{running ? `Live, hour ${String(step).padStart(2, "0")}:00` : showFinal ? "Result of the run" : "Forecast"}</h3>
            {running ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                <span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden /> Running
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Gauge label="p95 latency" text={`${p95} ms`} fill={p95 / Math.max(goals.maxP95Ms * 2.5, p95)} goal={1 / 2.5} ok={p95 <= goals.maxP95Ms} goalText={`goal ${goals.maxP95Ms} ms`} />
            <Gauge label="Availability" text={`${availability}%`} fill={(availability - 90) / 10} goal={(goals.minAvailability - 90) / 10} ok={availability >= goals.minAvailability} goalText={`goal ${goals.minAvailability}%`} />
            <Gauge label="Cost / month" text={usd(cost)} fill={cost / Math.max(goals.maxCostUsd * 1.6, shown.costUsd)} goal={goals.maxCostUsd / Math.max(goals.maxCostUsd * 1.6, shown.costUsd)} ok={shown.costUsd <= goals.maxCostUsd} goalText={`goal ${usd(goals.maxCostUsd)}`} />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">Prices are illustrative round numbers for the game. They are not AWS quotes.</p>

          <SystemDiagram round={round} model={m} preview={shown} step={current} problem={!resolved} animate={!reduced} running={running} />

          <Timeline round={round} sim={shown} step={step} ran={running || showFinal} />

          <div className="space-y-2.5 border-t border-border pt-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{current ? "How busy, now" : "How busy, at the peak"}</h3>
            <UtilBar label="App servers" value={current ? current.appUtil : shown.peakAppUtil} note={current?.zoneDown && current.appInstances === 0 ? "down" : undefined} />
            <UtilBar label={m.db.kind === "dynamodb" ? "DynamoDB hottest partition" : "Database primary"} value={current ? current.dbUtil : shown.peakDbUtil} />
            {m.db.replicas > 0 ? <UtilBar label="Read replicas" value={current ? current.replicaUtil : peakReplica} /> : null}
            {m.cache.on ? <UtilBar label="Cache hit rate" value={m.cache.hit} note={`${Math.round(m.cache.hit * 100)}% of reads`} /> : null}
            {m.queue.on ? <UtilBar label="Write queue" value={Math.min(1, (current ? current.backlog : shown.peakBacklog) / 500)} note={`${Math.round(current ? current.backlog : shown.peakBacklog)} waiting`} /> : null}
          </div>

          <details className="border-t border-border pt-3 text-sm">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted-foreground">Where the money goes</summary>
            <ul className="mt-2 space-y-1.5">
              {lines.map((l) => (
                <li key={l.id}>
                  <div className="flex justify-between text-xs">
                    <span>{l.label}</span>
                    <span className="tabular-nums">{usd(l.usd)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(l.usd / costMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Today it is {usd(baseline.costUsd)} a month with no changes.</p>
          </details>
        </section>

        {/* Right: goals, change cards, controls */}
        <div className="min-w-0 space-y-4">
          <section aria-label="Goals" className="rounded-md border border-border bg-card p-3 sm:p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{showFinal ? "Result: your goals" : "Your goals"}</h3>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white", showFinal || running ? (c.met ? "bg-emerald-500" : "bg-red-500") : c.met ? "bg-emerald-500/80" : "bg-red-500/80")}>
                    {c.met ? <Check className="size-3.5" aria-label="met" /> : <X className="size-3.5" aria-label="not met" />}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold">{c.label}</span> <span className="text-muted-foreground">{c.target}</span>
                    <span className={cn("block text-xs tabular-nums", toneText(c.met))}>{showFinal ? "Result" : running ? "This run" : "Forecast"}: {c.actual}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Changes" className={cn("rounded-md border border-border bg-card p-3 sm:p-4", shaking && "motion-safe:animate-[feedback-shake_420ms_both]")}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Pick your changes</h3>
              <p className="flex items-center gap-1.5 text-sm font-semibold" aria-live="polite">
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: round.maxChanges }, (_, i) => (
                    <span key={i} className={cn("size-2.5 rounded-full border", i < picked.length ? "border-primary bg-primary" : "border-border bg-secondary")} />
                  ))}
                </span>
                {round.maxChanges - picked.length} of {round.maxChanges} left
              </p>
            </div>
            {notice ? (
              <p role="status" className="mt-2 rounded-sm bg-red-500/10 px-2 py-1.5 text-sm font-medium text-red-700 dark:text-red-300">
                {notice}
              </p>
            ) : null}
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {round.changes.map((c) => {
                const index = picked.indexOf(c.id);
                const on = index >= 0;
                const delta = deltas[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={running || locked}
                      onClick={() => toggle(c.id)}
                      className={cn(
                        "relative flex h-full w-full flex-col gap-1.5 rounded-md border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70",
                        on ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-secondary/60",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold leading-snug">{c.label}</span>
                        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent")}>{on ? index + 1 : "."}</span>
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{c.description}</span>
                      <span
                        className={cn(
                          "mt-auto inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                          delta > 0 ? "bg-red-500/15 text-red-700 dark:text-red-300" : delta < 0 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {delta === 0 ? "no change in cost" : `${delta > 0 ? "+" : "-"}${usd(Math.abs(delta))} / month`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {hints > 0 ? (
            <section aria-label="Hints" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 sm:p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                <Lightbulb className="size-4" aria-hidden /> Clues
              </h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                {round.hints.slice(0, hints).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            </section>
          ) : null}

          <div className="sticky bottom-[4.75rem] z-10 lg:bottom-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card/95 p-2 shadow-md backdrop-blur">
            {running ? (
              <>
                <Button type="button" disabled className="min-w-28">
                  <span className="mr-1.5 size-2 rounded-full bg-current motion-safe:animate-pulse" aria-hidden /> Running {step + 1}/{STEPS}
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep(STEPS - 1)}>
                  <SkipForward className="mr-1.5 size-4" aria-hidden /> Skip to the end
                </Button>
              </>
            ) : (
              <Button type="button" onClick={run} disabled={locked} className="min-w-28">
                <Play className="mr-1.5 size-4" aria-hidden /> {phase === "done" ? "Run again" : "Run"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={hint} disabled={running || locked || hints >= round.hints.length}>
              <Lightbulb className="mr-1.5 size-4" aria-hidden /> {hints >= round.hints.length ? "No more clues" : `Hint (${hints}/${round.hints.length})`}
            </Button>
            <Button type="button" variant="ghost" onClick={clearAll} disabled={running || locked || picked.length === 0}>
              <RotateCcw className="mr-1.5 size-4" aria-hidden /> Clear changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
