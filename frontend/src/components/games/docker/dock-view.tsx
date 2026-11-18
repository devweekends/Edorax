"use client";

import type { ReactNode } from "react";
import { diskUsedMb, fmtSize, portsText, statusText, type Container, type DockerWorld } from "@/shared/games/docker/daemon";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./mission-panel";

const DISK_MB = 2000;
const BUILT_IN_NETWORKS = ["bridge", "host", "none"];

export type Probe = { port: number; ok: boolean } | null;
export type ContainerState = "running" | "exited" | "crashed" | "restarting" | "created";

/** "crashed" is an exit with a code other than 0. */
export function stateOf(c: Container): ContainerState {
  if (c.status === "exited" && c.exitCode !== 0) return "crashed";
  return c.status;
}

const LOOK: Record<ContainerState, { box: string; tag: string; label: string }> = {
  running: { box: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30", tag: "bg-emerald-600 text-white", label: "Running" },
  exited: { box: "border-l-slate-400 bg-secondary/60", tag: "bg-slate-500 text-white", label: "Exited" },
  crashed: { box: "border-l-red-500 bg-red-50 dark:bg-red-950/30", tag: "bg-red-600 text-white", label: "Crashed" },
  restarting: { box: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/30", tag: "bg-amber-500 text-slate-950", label: "Restarting" },
  created: { box: "border-l-slate-300 bg-secondary/40", tag: "bg-slate-400 text-white", label: "Created" },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px] leading-snug">
      <dt className="w-16 shrink-0 pt-px font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-mono">{children}</dd>
    </div>
  );
}

function ContainerBox({ c, world, flash }: { c: Container; world: DockerWorld; flash: boolean }) {
  const state = stateOf(c);
  const look = LOOK[state];
  const live = c.status === "running" || c.status === "restarting";
  const ports = portsText(c);
  return (
    <li className={cn("border border-border border-l-4 px-3 py-2.5", look.box, flash && "dk-flash")}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.name}</span>
        <span className={cn("shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider", look.tag)}>{look.label}</span>
      </div>
      <dl className="mt-1.5 space-y-0.5">
        <Row label="Image">{c.image}</Row>
        <Row label="Status">{statusText(world, c)}</Row>
        {live ? <Row label="Ports">{ports || "none"}</Row> : null}
        {c.networks.length > 0 ? <Row label="Network">{c.networks.join(", ")}</Row> : null}
        {c.mounts.length > 0 ? <Row label="Volume">{c.mounts.map((m) => `${m.kind === "volume" ? m.source.slice(0, 14) : m.source} at ${m.target}`).join(", ")}</Row> : null}
        {c.oomKilled ? <Row label="Memory"><span className="font-bold text-red-700 dark:text-red-400">ran out of memory (limit {c.memoryMb} MB)</span></Row> : null}
      </dl>
    </li>
  );
}

/**
 * A plain diagram of the virtual Docker host: one flat box per container (name, image, status,
 * ports), then the published ports, networks, volumes and images. It only reads the world, and
 * updates after every command. `changed` names the containers whose status just changed.
 */
export function DockView({ world, changed, probe }: { world: DockerWorld; changed: ReadonlySet<string>; probe: Probe }) {
  const running = world.containers.filter((c) => c.status === "running").length;
  const published = world.containers.flatMap((c) => c.ports.map((p) => ({ c, p })));
  const userNets = world.networks.filter((n) => !BUILT_IN_NETWORKS.includes(n));
  const used = diskUsedMb(world);
  const pct = Math.min(100, Math.round((used / DISK_MB) * 100));

  return (
    <section aria-label="Docker host">
      <SectionLabel right={<span aria-live="polite">{running} running, {world.containers.length - running} not</span>}>The host now</SectionLabel>

      {world.containers.length === 0 ? (
        <p className="mt-2 border border-dashed border-border p-4 text-sm text-muted-foreground">
          No containers on this host. Start one with <code className="font-mono text-foreground">docker run -d -p 8080:80 nginx</code>
        </p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label="Containers">
          {world.containers.map((c) => (
            <ContainerBox key={changed.has(c.name) ? `${c.id}-${world.tick}` : c.id} c={c} world={world} flash={changed.has(c.name)} />
          ))}
        </ul>
      )}

      {published.length > 0 ? (
        <div className="mt-4">
          <SectionLabel>Open ports</SectionLabel>
          <ul className="mt-2 divide-y divide-border border border-border bg-card">
            {published.map(({ c, p }) => {
              const live = c.status === "running";
              const probed = live && probe && probe.port === p.host ? probe : null;
              return (
                <li key={`${c.id}:${p.host}:${p.container}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-mono text-[13px]">
                  <span className="min-w-0 flex-1 break-words">localhost:{p.host} to {c.name}:{p.container}</span>
                  <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", live ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300")}>
                    {live ? "Open" : "Closed"}
                  </span>
                  {probed ? (
                    <span className={cn("rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", probed.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}>{probed.ok ? "curl: 200 OK" : "curl: no answer"}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {userNets.length > 0 || world.volumes.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {userNets.length > 0 ? (
            <div>
              <SectionLabel>Networks</SectionLabel>
              <ul className="mt-2 divide-y divide-border border border-border bg-card">
                {userNets.map((n) => {
                  const members = world.containers.filter((c) => c.networks.includes(n));
                  return (
                    <li key={n} className="px-3 py-2 font-mono text-[13px]">
                      <span className="font-bold">{n}</span>
                      <span className="block text-muted-foreground">{members.length ? members.map((c) => c.name).join(", ") : "no containers"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {world.volumes.length > 0 ? (
            <div>
              <SectionLabel>Volumes</SectionLabel>
              <ul className="mt-2 divide-y divide-border border border-border bg-card">
                {world.volumes.map((v) => {
                  const users = world.containers.filter((c) => c.mounts.some((m) => m.source === v));
                  return (
                    <li key={v} className="px-3 py-2 font-mono text-[13px]">
                      <span className="font-bold break-all">{v.slice(0, 14)}</span>
                      <span className="block text-muted-foreground">{users.length ? `used by ${users.map((c) => c.name).join(", ")}` : "not used"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {world.images.length > 0 ? (
        <div className="mt-4">
          <SectionLabel right={`${world.images.length}`}>Images</SectionLabel>
          <ul className="mt-2 divide-y divide-border border border-border bg-card">
            {world.images.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5 font-mono text-[13px]">
                <span className={cn("min-w-0 break-all", i.repo === "<none>" && "text-amber-700 dark:text-amber-400")}>{i.repo === "<none>" ? "<none> (unused layer)" : `${i.repo}:${i.tag}`}</span>
                <span className="shrink-0 text-muted-foreground">{fmtSize(i.sizeMb)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <SectionLabel right={`${pct}% of ${fmtSize(DISK_MB)}`}>Disk</SectionLabel>
        <div className="mt-2 h-2 bg-muted" role="progressbar" aria-label="Disk used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full", pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}
