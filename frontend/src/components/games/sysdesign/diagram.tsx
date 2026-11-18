"use client";

// The architecture diagram: inline SVG, drawn top to bottom so it stays readable at 375 px wide.
// Packets are animated with the Web Animations API, and only when the player allows motion.
import { useEffect, useRef } from "react";
import type { ComponentId, Model, SimResult, StepResult, SysdesignRound } from "@/shared/games/sysdesign/engine";
import { cn } from "@/lib/utils";

type Pt = [number, number];
type Tone = "ok" | "warn" | "bad" | "dead" | "off";

const toneStroke: Record<Tone, string> = {
  ok: "stroke-emerald-500",
  warn: "stroke-amber-500",
  bad: "stroke-red-500",
  dead: "stroke-red-600",
  off: "stroke-border",
};
const toneFill: Record<Tone, string> = {
  ok: "fill-emerald-500",
  warn: "fill-amber-500",
  bad: "fill-red-500",
  dead: "fill-red-600",
  off: "fill-muted-foreground",
};

export function utilTone(util: number): Tone {
  return util >= 1 ? "bad" : util >= 0.8 ? "warn" : "ok";
}

function Node(props: {
  id: ComponentId | string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  tone?: Tone;
  util?: number;
  ring?: boolean;
  dim?: boolean;
}) {
  const { x, y, w, h, title, sub, tone = "off", util, ring, dim } = props;
  return (
    <g data-node={props.id} opacity={dim ? 0.45 : 1}>
      {ring ? (
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={10} className="fill-none stroke-red-500 motion-safe:animate-pulse" strokeWidth={2.5} />
      ) : null}
      <rect x={x} y={y} width={w} height={h} rx={7} className={cn("fill-card", toneStroke[tone])} strokeWidth={tone === "off" ? 1 : 2} />
      <text x={x + w / 2} y={y + (sub ? 16 : h / 2 + 4)} textAnchor="middle" className="fill-foreground" fontSize={11} fontWeight={700}>
        {title}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + 29} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
          {sub}
        </text>
      ) : null}
      {util !== undefined ? (
        <g>
          <rect x={x + 8} y={y + h - 9} width={w - 16} height={4} rx={2} className="fill-secondary" />
          <rect x={x + 8} y={y + h - 9} width={Math.max(2, (w - 16) * Math.min(1, util))} height={4} rx={2} className={toneFill[utilTone(util)]} />
        </g>
      ) : null}
      {ring ? (
        <g>
          <circle cx={x + w - 2} cy={y + 2} r={9} className="fill-red-500" />
          <text x={x + w - 2} y={y + 6} textAnchor="middle" fontSize={12} fontWeight={800} className="fill-white">
            !
          </text>
        </g>
      ) : null}
    </g>
  );
}

function lengthOf(points: Pt[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return total;
}

/** Cut a path short, so a dropped packet dies part of the way along. */
function truncate(points: Pt[], share: number): Pt[] {
  const total = lengthOf(points) * share;
  const out: Pt[] = [points[0]!];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (walked + seg >= total) {
      const k = seg === 0 ? 0 : (total - walked) / seg;
      out.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]);
      return out;
    }
    out.push([x1, y1]);
    walked += seg;
  }
  return out;
}

function Packet({ points, delay, dur, dropped }: { points: Pt[]; delay: number; dur: number; dropped: boolean }) {
  const ref = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    const path = dropped ? truncate(points, 0.55) : points;
    const total = lengthOf(path) || 1;
    let walked = 0;
    const frames: Keyframe[] = path.map((p, i) => {
      if (i > 0) walked += Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1]);
      const edge = i === 0 || i === path.length - 1;
      return { offset: walked / total, transform: `translate(${p[0]}px, ${p[1]}px)`, opacity: edge ? 0.2 : 1 };
    });
    frames[0]!.offset = 0;
    frames[frames.length - 1]!.offset = 1;
    if (dropped) frames[frames.length - 1]!.opacity = 0;
    const anim = el.animate(frames, { duration: dur, delay, fill: "both", easing: "linear" });
    return () => anim.cancel();
  }, [points, delay, dur, dropped]);
  return <circle ref={ref} r={3.6} cx={0} cy={0} opacity={0} className={dropped ? "fill-red-500" : "fill-emerald-500"} />;
}

type Edge = { id: string; pts: Pt[]; layer: number; drop: number; count: number; dashed?: boolean };

export type DiagramProps = {
  round: SysdesignRound;
  model: Model;
  preview: SimResult;
  /** The step being played, or null when the player is planning. */
  step: StepResult | null;
  /** Show the red "problem" marker. */
  problem: boolean;
  animate: boolean;
  /** Playing right now. */
  running: boolean;
};

export function SystemDiagram({ round, model: m, preview, step, problem, animate, running }: DiagramProps) {
  const zoneDown = !!step?.zoneDown;
  const appUtil = step ? step.appUtil : preview.peakAppUtil;
  const dbUtil = step ? step.dbUtil : preview.peakDbUtil;
  const repUtil = step ? step.replicaUtil : Math.max(0, ...preview.steps.map((s) => s.replicaUtil));
  const twoZones = m.app.zones === 2;
  const hasBatch = !!round.batchJob;
  const batchOn = !!step?.batchRunning;
  const showNat = round.focus === "nat" || m.net.natGb >= 10000;
  const showLogs = round.focus === "storage" || m.logs.gb >= 10000;
  const replicas = Math.min(2, Math.round(m.db.replicas));
  const ring = (id: ComponentId) => problem && round.focus === id;

  const appToneA: Tone = zoneDown ? "dead" : step ? utilTone(appUtil) : appUtil >= 1 ? "bad" : appUtil >= 0.8 ? "warn" : "ok";
  const appToneB: Tone = step ? utilTone(appUtil) : utilTone(appUtil);
  const dbTone: Tone = zoneDown && !m.db.multiAz ? "dead" : utilTone(dbUtil);

  const instances = m.app.autoscale ? `${m.app.scaleMin}-${m.app.scaleMax}` : String(m.app.count);
  const appSub = step && m.app.autoscale ? `${step.appInstances} running` : `${twoZones ? Math.ceil((m.app.autoscale ? m.app.scaleMin : m.app.count) / 2) : instances} x ${m.app.label}`;
  const appSubB = step && m.app.autoscale ? `${step.appInstances} running` : `${Math.floor(m.app.count / 2) || 1} x ${m.app.label}`;

  const edges: Edge[] = [];
  const add = (e: Edge | null) => e && edges.push(e);
  const appDrop = step?.appDrop ?? 0;
  const dbDrop = step?.dbDrop ?? 0;
  const lbDrop = zoneDown && !twoZones ? 1 : 0;
  add({ id: "u-lb", pts: [[180, 42], [180, 66]], layer: 0, drop: lbDrop, count: 2 });
  if (m.cdn.on) add({ id: "u-cdn", pts: [[150, 42], [60, 66]], layer: 0, drop: 0, count: 1 });
  add({ id: "lb-a", pts: [[160, 100], [92, 140]], layer: 1, drop: twoZones && zoneDown ? (m.app.healthChecks ? 0.1 : 1) : appDrop, count: 2 });
  if (twoZones) add({ id: "lb-b", pts: [[200, 100], [268, 140]], layer: 1, drop: appDrop > 0.5 ? appDrop : 0, count: 2 });
  if (m.cache.on) add({ id: "a-cache", pts: [[50, 196], [50, 214]], layer: 2, drop: appDrop, count: 1 });
  if (m.queue.on) add({ id: "a-queue", pts: [[133, 196], [133, 214]], layer: 2, drop: appDrop, count: 1 });
  add({ id: "a-db", pts: [[92, 196], [92, 300]], layer: 2, drop: zoneDown && !m.db.multiAz ? 1 : dbDrop, count: 2 });
  if (m.queue.on) add({ id: "q-db", pts: [[133, 248], [133, 300]], layer: 3, drop: zoneDown && !m.db.multiAz ? 1 : 0, count: 1 });
  if (twoZones) {
    const standbyPath: Pt[] = [[268, 196], [268, 300]];
    add({ id: "b-db", pts: zoneDown && m.db.multiAz ? standbyPath : [[300, 196], [300, 276], [50, 276], [50, 300]], layer: 2, drop: dbDrop, count: 2 });
  }
  if (m.db.multiAz) add({ id: "sync", pts: [[168, 328], [192, 328]], layer: 3, drop: 0, count: 1, dashed: true });
  if (replicas > 0) {
    add({ id: "rep1", pts: [[130, 356], [130, 368], [228, 368], [228, 380]], layer: 3, drop: repUtil > 1 ? 1 - 1 / repUtil : 0, count: 1, dashed: true });
    if (replicas > 1) add({ id: "rep2", pts: [[228, 368], [306, 368], [306, 380]], layer: 3, drop: repUtil > 1 ? 1 - 1 / repUtil : 0, count: 1, dashed: true });
  }
  if (hasBatch && batchOn) {
    add({ id: "job-db", pts: [[214, 262], [214, 286], [150, 286], [150, 300]], layer: 2, drop: dbDrop, count: 2, dashed: true });
    if (!m.batch.separate) add({ id: "job-app", pts: twoZones ? [[268, 222], [268, 196]] : [[200, 222], [170, 190]], layer: 2, drop: appDrop, count: 2, dashed: true });
  }

  const dur = 480;
  const edgeClass = (e: Edge) => {
    if (!step) return "stroke-border";
    if (e.drop >= 0.5) return "stroke-red-500";
    if (e.drop >= 0.04) return "stroke-amber-500";
    return "stroke-emerald-500/70";
  };

  return (
    <svg viewBox="0 0 360 480" role="img" aria-label="Architecture diagram of the system" className="h-auto w-full select-none">
      {/* Availability Zone panels */}
      <rect x={8} y={116} width={168} height={308} rx={10} className={cn("fill-secondary/40", zoneDown ? "stroke-red-500" : "stroke-border", zoneDown && "motion-safe:animate-pulse")} strokeDasharray="5 4" strokeWidth={zoneDown ? 2 : 1} />
      <rect x={184} y={116} width={168} height={308} rx={10} className="fill-secondary/20 stroke-border" strokeDasharray="5 4" />
      <text x={16} y={132} fontSize={10} fontWeight={700} className={zoneDown ? "fill-red-500" : "fill-muted-foreground"}>
        {zoneDown ? "ZONE A DOWN" : "Availability Zone A"}
      </text>
      <text x={192} y={132} fontSize={10} fontWeight={700} className="fill-muted-foreground">
        Availability Zone B
      </text>
      {!twoZones && !m.db.multiAz && !hasBatch && !replicas ? (
        <text x={268} y={270} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
          nothing here yet
        </text>
      ) : null}

      {/* Connections */}
      {edges.map((e) => (
        <polyline key={e.id} points={e.pts.map((p) => p.join(",")).join(" ")} fill="none" strokeWidth={2} strokeDasharray={e.dashed ? "4 3" : undefined} className={cn("transition-colors", edgeClass(e))} />
      ))}

      {/* Nodes */}
      <Node id="users" x={130} y={8} w={100} h={34} title="Users" sub={step ? `${step.load} req/s` : undefined} tone="off" ring={ring("users")} />
      {m.cdn.on ? <Node id="cdn" x={12} y={66} w={96} h={34} title="CloudFront" tone="ok" /> : null}
      <Node id="lb" x={130} y={66} w={100} h={34} title="Load balancer" tone={lbDrop >= 1 ? "dead" : m.app.healthChecks ? "ok" : "off"} ring={ring("lb")} />
      <Node id="app" x={16} y={140} w={152} h={56} title={twoZones ? "App servers (A)" : "App servers"} sub={appSub} tone={appToneA} util={zoneDown ? 0 : appUtil} ring={ring("app")} />
      {twoZones ? <Node id="app-b" x={192} y={140} w={152} h={56} title="App servers (B)" sub={appSubB} tone={appToneB} util={appUtil} /> : null}
      {m.cache.on ? <Node id="cache" x={16} y={214} w={70} h={34} title="Cache" sub={`${Math.round(m.cache.hit * 100)}% hits`} tone="ok" ring={ring("cache")} /> : null}
      {m.queue.on ? <Node id="queue" x={98} y={214} w={70} h={34} title="SQS" sub={step ? `${Math.round(step.backlog)} wait` : "queue"} tone={step && step.backlog > 50 ? "warn" : "ok"} ring={ring("queue")} /> : null}
      {hasBatch ? (
        <Node id="workers" x={192} y={222} w={152} h={40} title={m.batch.separate ? "Spot workers" : "Report job"} sub={m.batch.separate ? "away from the shop" : "shares the web tier"} tone={batchOn ? "warn" : "off"} ring={ring("workers")} />
      ) : null}
      <Node id="db" x={16} y={300} w={152} h={56} title={m.db.label} sub={m.db.kind === "dynamodb" ? (m.db.skew >= 2 ? "hot key on one partition" : "DynamoDB table") : "primary database"} tone={dbTone} util={zoneDown && !m.db.multiAz ? 0 : dbUtil} ring={ring("db")} />
      {m.db.multiAz ? <Node id="standby" x={192} y={300} w={152} h={56} title="Standby" sub="Multi-AZ copy" tone={zoneDown ? "ok" : "off"} /> : null}
      {replicas > 0 ? <Node id="replica" x={192} y={380} w={72} h={36} title="Replica" tone={utilTone(repUtil)} util={repUtil} ring={ring("replica")} /> : null}
      {replicas > 1 ? <Node id="replica2" x={272} y={380} w={72} h={36} title="Replica" tone={utilTone(repUtil)} util={repUtil} /> : null}
      {showNat ? <Node id="nat" x={16} y={436} w={160} h={36} title={`NAT gateway x${m.net.natGateways}`} sub={m.net.s3Endpoint ? "S3 endpoint on" : "all traffic via NAT"} tone={m.net.s3Endpoint ? "ok" : "off"} ring={ring("nat")} /> : null}
      {showLogs ? <Node id="storage" x={184} y={436} w={160} h={36} title="S3 logs" sub={m.logs.coldShare > 0 ? "old logs in Glacier" : "all in Standard"} tone={m.logs.coldShare > 0 ? "ok" : "off"} ring={ring("storage")} /> : null}

      {/* Packets, one set per step */}
      {animate && running && step
        ? edges.flatMap((e) => {
            const dropped = Math.round(e.count * Math.min(1, e.drop));
            return Array.from({ length: e.count }, (_, i) => (
              <Packet key={`${step.t}-${e.id}-${i}`} points={e.pts} delay={e.layer * 90 + i * 110} dur={dur} dropped={i < dropped || (e.drop >= 0.04 && e.drop < 0.5 && i === 0)} />
            ));
          })
        : null}
    </svg>
  );
}
