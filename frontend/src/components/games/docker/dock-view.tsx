"use client";

import { Box, Cylinder, Globe, HardDrive, Network, RotateCw, X } from "lucide-react";
import { CATALOG, diskUsedMb, fmtSize, portsText, statusText, type Container, type DockerWorld } from "@/shared/games/docker/daemon";
import { cn } from "@/lib/utils";

const DISK_MB = 2000;

const NET_TONES = [
  "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "border-pink-500/50 bg-pink-500/10 text-pink-700 dark:text-pink-300",
  "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300",
];

export type Probe = { port: number; ok: boolean } | null;

function Whale({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} role="img" aria-label="Docker whale">
      <g className="dk-bob" style={{ transformOrigin: "32px 24px" }}>
        <path d="M4 22c0-6 5-10 12-10h30c8 0 14 5 14 12 0 8-8 14-20 14H20C10 38 4 31 4 22Z" className="fill-sky-500" />
        <path d="M54 14c3-4 7-5 9-4-1 4-3 7-7 9" className="fill-sky-500" />
        <circle cx="14" cy="20" r="1.6" className="fill-white" />
        <rect x="18" y="6" width="7" height="6" rx="1" className="fill-brand-yellow" />
        <rect x="26" y="6" width="7" height="6" rx="1" className="fill-emerald-400" />
        <rect x="34" y="6" width="7" height="6" rx="1" className="fill-pink-400" />
        <rect x="26" y="-1" width="7" height="6" rx="1" className="fill-violet-400" />
      </g>
      <g className="dk-spout fill-sky-300">
        <circle cx="9" cy="10" r="1.3" />
        <circle cx="6" cy="7" r="1" />
      </g>
    </svg>
  );
}

function stateOf(c: Container): "running" | "exited" | "crashed" | "restarting" | "created" {
  if (c.status === "exited" && c.exitCode !== 0) return "crashed";
  return c.status;
}

const TONE: Record<ReturnType<typeof stateOf>, string> = {
  running: "border-emerald-500/70 bg-emerald-500/10",
  exited: "border-border bg-muted/50 opacity-80",
  crashed: "border-red-500/70 bg-red-500/10",
  restarting: "border-amber-500/70 bg-amber-500/10",
  created: "border-dashed border-border bg-muted/30",
};

function StateDot({ state }: { state: ReturnType<typeof stateOf> }) {
  if (state === "restarting") return <RotateCw className="size-3.5 text-amber-500 motion-safe:animate-spin" aria-hidden />;
  const color = state === "running" ? "bg-emerald-500" : state === "crashed" ? "bg-red-500" : "bg-muted-foreground/60";
  return <span className={cn("size-2.5 rounded-full", color, state === "running" && "dk-ring motion-safe:animate-pulse")} aria-hidden />;
}

/** Colour for a network name, the same every time. */
function netTone(world: DockerWorld, name: string): string {
  const user = world.networks.filter((n) => !["bridge", "host", "none"].includes(n));
  const i = user.indexOf(name);
  return i < 0 ? "border-border bg-secondary text-muted-foreground" : NET_TONES[i % NET_TONES.length]!;
}

/**
 * The live picture of the virtual Docker host: container boxes coloured by state, arrows from
 * "localhost" to the published ports, and chips for volumes, networks and images. It only reads
 * the world; the terminal changes it.
 */
export function DockView({ world, crashed, probe }: { world: DockerWorld; crashed: ReadonlySet<string>; probe: Probe }) {
  const running = world.containers.filter((c) => c.status === "running").length;
  const published = world.containers.filter((c) => c.status !== "exited").flatMap((c) => c.ports.map((p) => ({ c, p })));
  const used = diskUsedMb(world);
  const pct = Math.min(100, Math.round((used / DISK_MB) * 100));
  const userNets = world.networks.filter((n) => !["bridge", "host", "none"].includes(n));

  return (
    <section aria-label="Docker host" className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/50 px-3 py-2">
        <Whale className="h-9 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold">Docker host</h3>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {running} running, {world.containers.length - running} not running
          </p>
        </div>
        <div className="w-28 shrink-0" title={`Disk: ${fmtSize(used)} of ${fmtSize(DISK_MB)}`}>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><HardDrive className="size-3" aria-hidden /> Disk</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Disk used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full rounded-full transition-all duration-500", pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-3">
        {published.length > 0 ? (
          <div className="space-y-1.5" aria-label="Published ports">
            {published.map(({ c, p }) => {
              const live = c.status === "running";
              const probed = live && probe && probe.port === p.host ? probe : null;
              return (
                <div key={`${c.id}:${p.host}:${p.container}`} className="flex items-center gap-2 text-xs">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-1 font-mono">
                    <Globe className="size-3" aria-hidden /> localhost:{p.host}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "relative h-1 min-w-6 flex-1 rounded-full",
                      live ? "dk-flow dk-line-on" : "dk-line-off",
                    )}
                  />
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-1 font-mono", live ? "border-emerald-500/60 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10")}>
                    {live ? <Box className="size-3" aria-hidden /> : <X className="size-3 text-red-500" aria-hidden />} {c.name}:{p.container}
                  </span>
                  {probed ? (
                    <span className={cn("shrink-0 rounded-sm px-1.5 py-1 font-bold", probed.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>{probed.ok ? "200 OK" : "no answer"}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {world.containers.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No containers yet. Try <code className="font-mono">docker run -d -p 8080:80 nginx</code></p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Containers">
            {world.containers.map((c) => {
              const state = stateOf(c);
              return (
                <li
                  key={c.id}
                  className={cn(
                    "min-w-0 rounded-md border-2 p-2.5 motion-safe:animate-[bm-pop_0.35s_ease-out_both] transition-colors duration-300",
                    TONE[state],
                    state === "crashed" && crashed.has(c.name) && "dk-shake",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StateDot state={state} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
                    <span className="shrink-0 rounded-sm bg-background/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">{state === "crashed" ? "crashed" : c.status}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{c.image}</p>
                  <p className="mt-0.5 text-xs">{statusText(world, c)}</p>
                  {c.status === "running" || c.status === "restarting" ? (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{portsText(c) || (CATALOG[c.image]?.port ? `${CATALOG[c.image]!.port}/tcp (not published)` : "no ports")}</p>
                  ) : null}
                  {c.oomKilled ? <p className="mt-1 text-[11px] font-bold text-red-600 dark:text-red-400">Out of memory ({c.memoryMb} MB limit)</p> : null}
                  {c.mounts.length + c.networks.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.mounts.map((m) => (
                        <span key={m.target} className="inline-flex max-w-full items-center gap-1 truncate rounded-sm border border-border bg-background/70 px-1.5 py-0.5 text-[11px]">
                          <Cylinder className="size-3 shrink-0 text-amber-500" aria-hidden /> <span className="truncate">{m.kind === "volume" ? m.source.slice(0, 12) : m.source}</span>
                        </span>
                      ))}
                      {c.networks.map((n) => (
                        <span key={n} className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px]", netTone(world, n))}>
                          <Network className="size-3 shrink-0" aria-hidden /> {n}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {(world.volumes.length > 0 || userNets.length > 0) ? (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            {world.volumes.length > 0 ? (
              <div>
                <p className="mb-1 font-bold uppercase tracking-widest text-muted-foreground">Volumes</p>
                <div className="flex flex-wrap gap-1">
                  {world.volumes.map((v) => {
                    const user = world.containers.filter((c) => c.mounts.some((m) => m.source === v));
                    return (
                      <span key={v} className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-1", user.length ? "border-amber-500/50 bg-amber-500/10" : "border-dashed border-border text-muted-foreground")}>
                        <Cylinder className="size-3" aria-hidden /> {v.slice(0, 14)}{user.length ? ` (${user.map((c) => c.name).join(", ")})` : " (unused)"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {userNets.length > 0 ? (
              <div>
                <p className="mb-1 font-bold uppercase tracking-widest text-muted-foreground">Networks</p>
                <div className="flex flex-wrap gap-1">
                  {userNets.map((n) => {
                    const members = world.containers.filter((c) => c.networks.includes(n));
                    return (
                      <span key={n} className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-1", netTone(world, n))}>
                        <Network className="size-3" aria-hidden /> {n}{members.length ? `: ${members.map((c) => c.name).join(", ")}` : " (empty)"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {world.images.length > 0 ? (
          <div className="text-xs">
            <p className="mb-1 font-bold uppercase tracking-widest text-muted-foreground">Images</p>
            <div className="flex flex-wrap gap-1">
              {world.images.map((i) => (
                <span key={i.id} className={cn("rounded-sm border px-1.5 py-1 font-mono", i.repo === "<none>" ? "border-dashed border-amber-500/60 text-amber-700 dark:text-amber-300" : "border-border bg-secondary")}>
                  {i.repo === "<none>" ? "<none>" : `${i.repo}:${i.tag}`} {fmtSize(i.sizeMb)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
