// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// A tiny virtual Docker daemon for the Docker Commands game. There is no real Docker here: a
// world is plain data (containers, images, networks, volumes), and `runLine` runs one typed
// command against it and returns the output lines. Everything is pure and deterministic (no clock,
// no Math.random): ids come from a hash, and time is a counter that goes up once per command.
// It never throws; a bad command returns an error line, like a real shell would.

import { hashString } from "../daily";

export type Status = "created" | "running" | "exited" | "restarting";
export type RestartPolicy = "no" | "always" | "on-failure" | "unless-stopped";

export type PortMap = { host: number; container: number };
export type Mount = { source: string; target: string; kind: "volume" | "bind" };

export type Container = {
  id: string;
  name: string;
  /** "repo:tag" */
  image: string;
  command: string;
  status: Status;
  exitCode: number;
  oomKilled: boolean;
  restartCount: number;
  ports: PortMap[];
  env: Record<string, string>;
  mounts: Mount[];
  networks: string[];
  restart: RestartPolicy;
  /** Memory limit in MB, 0 means no limit. */
  memoryMb: number;
  logs: string[];
  /** When the container was created: a tick number, or a ready made label like "2 hours". */
  createdAt: number | string;
  /** When the status last changed: a tick number, or a ready made label like "2 hours". */
  since: number | string;
  project?: string;
  service?: string;
};

export type LocalImage = { id: string; repo: string; tag: string; sizeMb: number; created: string };

export type ComposeService = {
  name: string;
  image: string;
  ports: string[];
  env: Record<string, string>;
  volumes: string[];
  dependsOn: string[];
  restart?: RestartPolicy;
};

export type DockerWorld = {
  /** Goes up by one for every command. */
  tick: number;
  /** Counts things created, so new ids are different and repeatable. */
  seq: number;
  containers: Container[];
  images: LocalImage[];
  networks: string[];
  volumes: string[];
  /** Set only in scenarios that show a compose file. */
  compose?: { project: string; file: string[]; services: ComposeService[] };
};

export type OutLine = { kind: "out" | "err" | "sys"; text: string };

export type DockerEvent = {
  type: "created" | "started" | "stopped" | "crashed" | "restarting" | "removed" | "pulled" | "network" | "volume" | "blocked" | "pruned";
  name: string;
};

export type RunResult = { lines: OutLine[]; ok: boolean; events: DockerEvent[] };

// ---------------------------------------------------------------------------------------------
// What each image does when it runs. Anything not listed behaves like a small generic app.

export type ImageSpec = {
  sizeMb: number;
  /** The port the app listens on inside the container. */
  port?: number;
  cmd: string;
  /** Environment variables that must be set, or the app stops at once. */
  requiredEnv?: string[];
  /** The log lines printed when a required variable is missing. */
  missingEnv?: Record<string, string[]>;
  /** An environment variable that names a host (the database) the app must be able to reach. */
  needsHost?: string;
  /** Memory the app needs, in MB. With a smaller limit it is killed (exit 137). */
  memoryMb?: number;
  /** Memory it uses while running, in MB. */
  useMb?: number;
  /** What `curl` gets back. */
  body?: string;
  startLogs: string[];
  dataPath?: string;
  /** What the app prints when it listens but a client sends it a non-HTTP request. */
  rawPort?: boolean;
};

const GENERIC: ImageSpec = { sizeMb: 90, cmd: "app", startLogs: ["app started"] };

export const CATALOG: Record<string, ImageSpec> = {
  "nginx:latest": { sizeMb: 188, port: 80, cmd: "nginx -g 'daemon off;'", body: "<h1>Welcome to nginx!</h1>", useMb: 8, startLogs: ["/docker-entrypoint.sh: Configuration complete; ready for start up", "nginx: [notice] start worker processes"] },
  "nginx:1.25": { sizeMb: 187, port: 80, cmd: "nginx -g 'daemon off;'", body: "<h1>Welcome to nginx!</h1>", useMb: 8, startLogs: ["/docker-entrypoint.sh: Configuration complete; ready for start up", "nginx: [notice] start worker processes"] },
  "nginx:1.25-alpine": { sizeMb: 43.2, port: 80, cmd: "nginx -g 'daemon off;'", body: "<h1>Welcome to nginx!</h1>", useMb: 5, startLogs: ["/docker-entrypoint.sh: Configuration complete; ready for start up", "nginx: [notice] start worker processes"] },
  "postgres:16": {
    sizeMb: 432, port: 5432, cmd: "postgres", requiredEnv: ["POSTGRES_PASSWORD"], dataPath: "/var/lib/postgresql/data", memoryMb: 100, useMb: 45, rawPort: true,
    missingEnv: {
      POSTGRES_PASSWORD: [
        "Error: Database is uninitialized and superuser password is not specified.",
        "       You must specify POSTGRES_PASSWORD to a non-empty value for the",
        "       superuser. For example, \"-e POSTGRES_PASSWORD=password\" on \"docker run\".",
      ],
    },
    startLogs: ["PostgreSQL init process complete; ready for start up.", "LOG:  database system is ready to accept connections"],
  },
  "redis:7": { sizeMb: 117, port: 6379, cmd: "redis-server", useMb: 6, rawPort: true, startLogs: ["Ready to accept connections tcp"] },
  "shop/web:2.0": {
    sizeMb: 212, port: 3000, cmd: "node server.js", needsHost: "DB_HOST", useMb: 60,
    body: "Shop is open: 3 products, connected to the database.",
    startLogs: ["shop-web listening on :3000"],
  },
  "acme/site:1.0": { sizeMb: 62, port: 80, cmd: "nginx -g 'daemon off;'", body: "Acme site v1 (old release)", useMb: 6, startLogs: ["site 1.0 ready"] },
  "acme/site:2.0": {
    sizeMb: 64, port: 80, cmd: "nginx -g 'daemon off;'", requiredEnv: ["SITE_NAME"], body: "Acme site v2 (new release)", useMb: 6,
    missingEnv: { SITE_NAME: ["site: fatal: SITE_NAME is required (example: -e SITE_NAME=Acme)"] },
    startLogs: ["site 2.0 ready"],
  },
  "acme/worker:3.1": {
    sizeMb: 310, cmd: "python worker.py", memoryMb: 400, useMb: 380,
    startLogs: ["worker: loading model into memory (needs about 400 MB)", "worker: ready, waiting for jobs"],
  },
  "shop/api:1.2": { sizeMb: 164, port: 4000, cmd: "node api.js", startLogs: ["api listening on :4000"] },
  "legacy/app:0.9": { sizeMb: 270, port: 8000, cmd: "python app.py", startLogs: ["legacy app started"] },
};

function specFor(image: string): ImageSpec {
  return CATALOG[image] ?? GENERIC;
}

const COMMON_BINS = ["sh", "bash", "sleep", "env", "ls", "cat", "echo", "tail", "true", "false"];

// ---------------------------------------------------------------------------------------------
// Small helpers.

export function hex(seed: string, length: number): string {
  let out = "";
  for (let i = 0; out.length < length; i++) out += hashString(`${seed}:${i}`).toString(16).padStart(8, "0");
  return out.slice(0, length);
}

const shortId = (id: string) => id.slice(0, 12);

export function normalizeImage(ref: string): string {
  const slash = ref.lastIndexOf("/");
  const colon = ref.lastIndexOf(":");
  return colon > slash ? ref : `${ref}:latest`;
}

export function splitImage(ref: string): { repo: string; tag: string } {
  const full = normalizeImage(ref);
  const colon = full.lastIndexOf(":");
  return { repo: full.slice(0, colon), tag: full.slice(colon + 1) };
}

export function fmtSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(2).replace(/0$/, "")}GB`;
  return `${mb < 100 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)}MB`;
}

function age(world: DockerWorld, value: number | string): string {
  if (typeof value === "string") return value;
  const diff = world.tick - value;
  if (diff <= 0) return "Less than a second";
  const seconds = diff * 6;
  return seconds < 60 ? `${seconds} seconds` : `${Math.floor(seconds / 60)} minutes`;
}

function table(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => { widths[i] = Math.max(widths[i] ?? 0, cell.length); });
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]! + 2))).join("").trimEnd());
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const cloneWorld = (world: DockerWorld): DockerWorld => clone(world);

export function emptyWorld(): DockerWorld {
  return { tick: 0, seq: 0, containers: [], images: [], networks: ["bridge", "host", "none"], volumes: [] };
}

export function makeImage(ref: string, created = "3 weeks ago"): LocalImage {
  const { repo, tag } = splitImage(ref);
  return { id: hex(`image:${repo}:${tag}`, 12), repo, tag, sizeMb: specFor(`${repo}:${tag}`).sizeMb, created };
}

export function danglingImage(seed: string, sizeMb: number, created = "5 days ago"): LocalImage {
  return { id: hex(`dangling:${seed}`, 12), repo: "<none>", tag: "<none>", sizeMb, created };
}

export function makeContainer(p: Partial<Container> & { name: string; image: string }): Container {
  const image = normalizeImage(p.image);
  return {
    id: hex(`container:${p.name}`, 64), command: specFor(image).cmd, status: "running", exitCode: 0, oomKilled: false, restartCount: 0,
    ports: [], env: {}, mounts: [], networks: ["bridge"], restart: "no", memoryMb: 0, logs: [], createdAt: "2 hours", since: "2 hours",
    ...p,
    image,
  };
}

const isUserNetwork = (name: string) => !["bridge", "host", "none"].includes(name);

function findContainer(world: DockerWorld, ref: string): Container | undefined {
  const name = ref.replace(/^\//, "");
  const exact = world.containers.find((c) => c.name === name || c.id === ref);
  if (exact) return exact;
  if (/^[0-9a-f]{1,64}$/.test(ref)) {
    const byId = world.containers.filter((c) => c.id.startsWith(ref));
    if (byId.length === 1) return byId[0];
  }
  return undefined;
}

function findImage(world: DockerWorld, ref: string): LocalImage | undefined {
  if (/^[0-9a-f]{3,12}$/.test(ref)) {
    const byId = world.images.find((i) => i.id.startsWith(ref));
    if (byId) return byId;
  }
  const { repo, tag } = splitImage(ref);
  return world.images.find((i) => i.repo === repo && i.tag === tag);
}

const imageRef = (i: LocalImage) => `${i.repo}:${i.tag}`;

/** The container that answers to `host` for a container on user networks, or null. */
function resolveName(world: DockerWorld, from: Container, host: string): Container | null {
  if (host === from.name) return from;
  const shared = from.networks.filter(isUserNetwork);
  for (const other of world.containers) {
    if (other === from || (other.name !== host && other.service !== host) || other.status !== "running") continue;
    if (other.networks.some((n) => shared.includes(n))) return other;
  }
  return null;
}

function ipOf(world: DockerWorld, c: Container): string {
  const net = c.networks.find(isUserNetwork) ?? "bridge";
  const base = net === "bridge" ? 17 : 18 + Math.max(0, world.networks.indexOf(net) - 3);
  return `172.${base}.0.${2 + world.containers.indexOf(c)}`;
}

// ---------------------------------------------------------------------------------------------
// Starting a container: this is where the scenarios' faults show up.

function hostPortBusy(world: DockerWorld, port: number, self: Container): Container | undefined {
  return world.containers.find((c) => c !== self && (c.status === "running" || c.status === "restarting") && c.ports.some((p) => p.host === port));
}

function setState(world: DockerWorld, c: Container, status: Status, exitCode: number, events: DockerEvent[]) {
  const previous = c.status;
  c.status = status;
  c.exitCode = exitCode;
  c.since = world.tick;
  if (status === "running" && previous !== "running") events.push({ type: "started", name: c.name });
  else if (status === "exited" && previous === "running") events.push({ type: "stopped", name: c.name });
}

function pushLogs(c: Container, lines: string[]) {
  c.logs.push(...lines);
  if (c.logs.length > 120) c.logs.splice(0, c.logs.length - 120);
}

/** Try to start a container. Returns an error line when a port is taken (the container stays "created"). */
function boot(world: DockerWorld, c: Container, events: DockerEvent[]): string | null {
  for (const p of c.ports) {
    const other = hostPortBusy(world, p.host, c);
    if (other) {
      if (c.status !== "restarting") setState(world, c, "created", 0, events);
      events.push({ type: "blocked", name: c.name });
      return `Error response from daemon: driver failed programming external connectivity on endpoint ${c.name} (${hex(`ep:${c.name}:${world.seq}`, 64)}): Bind for 0.0.0.0:${p.host} failed: port is already allocated`;
    }
  }
  const spec = specFor(c.image);
  const fail = (code: number, lines: string[], oom = false) => {
    pushLogs(c, lines);
    c.oomKilled = oom;
    if (c.restart !== "no") {
      c.restartCount += 1;
      setState(world, c, "restarting", code, events);
      events.push({ type: "restarting", name: c.name });
    } else {
      setState(world, c, "exited", code, events);
      events.push({ type: "crashed", name: c.name });
    }
    return null;
  };

  const first = c.command.split(/\s+/)[0] ?? "";
  const appCmd = c.command === spec.cmd;
  if (!appCmd && !COMMON_BINS.includes(first) && first !== (spec.cmd.split(/\s+/)[0] ?? "")) {
    return fail(127, [`exec: "${first}": executable file not found in $PATH`]);
  }
  if (appCmd) {
    for (const key of spec.requiredEnv ?? []) {
      if (!c.env[key]) return fail(1, spec.missingEnv?.[key] ?? [`Error: ${key} is required`]);
    }
    if (spec.needsHost) {
      const host = c.env[spec.needsHost];
      if (!host) return fail(1, [`Error: ${spec.needsHost} is not set`]);
      if (host === "localhost" || host === "127.0.0.1") return fail(1, [`Error: connect ECONNREFUSED 127.0.0.1:5432`, "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)"]);
      if (!resolveName(world, c, host)) return fail(1, [`Error: getaddrinfo ENOTFOUND ${host}`, "    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:109:26)"]);
    }
    if (spec.memoryMb && c.memoryMb > 0 && c.memoryMb < spec.memoryMb) {
      return fail(137, [spec.startLogs[0] ?? "starting", "Killed"], true);
    }
    pushLogs(c, spec.startLogs);
    if (spec.needsHost) pushLogs(c, [`connected to database at ${c.env[spec.needsHost]}`]);
  } else {
    pushLogs(c, [`(running "${c.command}")`]);
  }
  c.oomKilled = false;
  setState(world, c, "running", 0, events);
  return null;
}

/** Containers on a restart policy try again after every command, so they heal when the cause is fixed. */
function settle(world: DockerWorld, touched: Set<string>, events: DockerEvent[]) {
  for (const c of world.containers) {
    if (c.status === "restarting" && !touched.has(c.id)) {
      const before = c.restartCount;
      boot(world, c, events);
      if (c.status === "restarting") c.restartCount = before + 1;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Parsing a shell line.

function tokenize(text: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let has = false;
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || current) tokens.push(current);
      current = "";
      has = false;
    } else {
      current += ch;
    }
  }
  if (quote) return null;
  if (has || current) tokens.push(current);
  return tokens;
}

function splitAnd(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === "&" && line[i + 1] === "&") {
      parts.push(current);
      current = "";
      i++;
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

type FlagSpec = { bool?: string[]; value?: string[]; alias?: Record<string, string>; stopAtPositional?: boolean };
type Parsed = { flags: Record<string, string[]>; has: Set<string>; rest: string[]; error?: string };

function parseFlags(args: string[], spec: FlagSpec): Parsed {
  const flags: Record<string, string[]> = {};
  const has = new Set<string>();
  const rest: string[] = [];
  const bool = new Set(spec.bool ?? []);
  const value = new Set(spec.value ?? []);
  const alias = spec.alias ?? {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") { rest.push(...args.slice(i + 1)); break; }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = (eq >= 0 ? arg.slice(2, eq) : arg.slice(2));
      const long = alias[`--${name}`]?.slice(2) ?? name;
      if (bool.has(long)) { has.add(long); continue; }
      if (value.has(long)) {
        const val = eq >= 0 ? arg.slice(eq + 1) : args[++i];
        if (val === undefined) return { flags, has, rest, error: `flag needs an argument: --${name}` };
        (flags[long] ??= []).push(val);
        continue;
      }
      return { flags, has, rest, error: `unknown flag: --${name}` };
    }
    if (arg.startsWith("-") && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const short = arg[j]!;
        const long = alias[`-${short}`]?.slice(2) ?? short;
        if (bool.has(long)) { has.add(long); continue; }
        if (value.has(long)) {
          const attached = arg.slice(j + 1);
          const val = attached || args[++i];
          if (val === undefined) return { flags, has, rest, error: `flag needs an argument: '${short}' in -${short}` };
          (flags[long] ??= []).push(val.replace(/^=/, ""));
          break;
        }
        return { flags, has, rest, error: `unknown shorthand flag: '${short}' in -${arg.slice(j)}` };
      }
      continue;
    }
    rest.push(arg);
    if (spec.stopAtPositional) { rest.push(...args.slice(i + 1)); break; }
  }
  return { flags, has, rest };
}

// ---------------------------------------------------------------------------------------------
// The command runner.

type Ctx = { world: DockerWorld; lines: OutLine[]; events: DockerEvent[]; touched: Set<string> };

const out = (ctx: Ctx, text: string) => { ctx.lines.push({ kind: "out", text }); };
const err = (ctx: Ctx, text: string) => { ctx.lines.push({ kind: "err", text }); };
const outAll = (ctx: Ctx, texts: string[]) => texts.forEach((t) => out(ctx, t));

const USAGE: Record<string, [number, string, string]> = {
  run: [1, "docker run [OPTIONS] IMAGE [COMMAND] [ARG...]", "Create and run a new container from an image"],
  start: [1, "docker start [OPTIONS] CONTAINER [CONTAINER...]", "Start one or more stopped containers"],
  stop: [1, "docker stop [OPTIONS] CONTAINER [CONTAINER...]", "Stop one or more running containers"],
  restart: [1, "docker restart [OPTIONS] CONTAINER [CONTAINER...]", "Restart one or more containers"],
  rm: [1, "docker rm [OPTIONS] CONTAINER [CONTAINER...]", "Remove one or more containers"],
  rmi: [1, "docker rmi [OPTIONS] IMAGE [IMAGE...]", "Remove one or more images"],
  logs: [1, "docker logs [OPTIONS] CONTAINER", "Fetch the logs of a container"],
  inspect: [1, "docker inspect [OPTIONS] NAME|ID [NAME|ID...]", "Return low-level information on Docker objects"],
  exec: [2, "docker exec [OPTIONS] CONTAINER COMMAND [ARG...]", "Execute a command in a running container"],
  pull: [1, "docker pull [OPTIONS] NAME[:TAG|@DIGEST]", "Download an image from a registry"],
  kill: [1, "docker kill [OPTIONS] CONTAINER [CONTAINER...]", "Kill one or more running containers"],
};

function needArgs(ctx: Ctx, cmd: string, count: number): boolean {
  const u = USAGE[cmd];
  if (!u) return true;
  if (count >= u[0]) return true;
  err(ctx, `docker: "docker ${cmd}" requires at least ${u[0]} argument${u[0] > 1 ? "s" : ""}.`);
  err(ctx, `See 'docker ${cmd} --help'.`);
  out(ctx, "");
  out(ctx, `Usage:  ${u[1]}`);
  out(ctx, "");
  out(ctx, u[2]);
  return false;
}

function flagError(ctx: Ctx, cmd: string, message: string) {
  err(ctx, message);
  err(ctx, `See 'docker ${cmd} --help'.`);
}

function noContainer(ctx: Ctx, ref: string) {
  err(ctx, `Error response from daemon: No such container: ${ref}`);
}

function parseMemory(text: string): number | null {
  const m = /^(\d+)([bkmg]?)b?$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "g") return n * 1024;
  if (unit === "m") return n;
  if (unit === "k") return n / 1024;
  return n / 1048576;
}

function parsePort(text: string): { host: number; container: number } | string {
  const m = /^(?:(\d{1,3}(?:\.\d{1,3}){3}):)?(\d{1,5})(?::(\d{1,5}))?(?:\/(tcp|udp))?$/.exec(text);
  if (!m) return `invalid containerPort: ${text.split(":").pop() ?? text}`;
  const a = Number(m[2]);
  const b = m[3] !== undefined ? Number(m[3]) : null;
  const host = b === null ? 0 : a;
  const container = b === null ? a : b;
  if (container < 1 || container > 65535) return `invalid containerPort: ${container}`;
  if (host > 65535) return `invalid hostPort: ${host}`;
  return { host, container };
}

function pullImage(ctx: Ctx, ref: string): LocalImage | null {
  const world = ctx.world;
  const { repo, tag } = splitImage(ref);
  const key = `${repo}:${tag}`;
  if (!CATALOG[key]) {
    const known = Object.keys(CATALOG).some((k) => k.startsWith(`${repo}:`));
    if (known) err(ctx, `Error response from daemon: manifest for ${key} not found: manifest unknown: manifest unknown`);
    else err(ctx, `Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`);
    return null;
  }
  const existing = world.images.find((i) => i.repo === repo && i.tag === tag);
  const official = !repo.includes("/");
  out(ctx, `${tag}: Pulling from ${official ? "library/" : ""}${repo}`);
  if (existing) {
    out(ctx, `Digest: sha256:${hex(`digest:${key}`, 64)}`);
    out(ctx, `Status: Image is up to date for ${key}`);
  } else {
    for (let i = 0; i < 2; i++) out(ctx, `${hex(`layer:${key}:${i}`, 12)}: Pull complete`);
    out(ctx, `Digest: sha256:${hex(`digest:${key}`, 64)}`);
    out(ctx, `Status: Downloaded newer image for ${key}`);
  }
  out(ctx, `docker.io/${official ? "library/" : ""}${key}`);
  if (existing) return existing;
  const image = makeImage(key, "2 weeks ago");
  world.images.push(image);
  ctx.events.push({ type: "pulled", name: key });
  return image;
}

function cmdRun(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const p = parseFlags(args, {
    bool: ["detach", "interactive", "tty", "rm", "publish-all"],
    value: ["publish", "env", "volume", "name", "network", "restart", "memory", "workdir", "hostname", "user"],
    alias: { "-d": "--detach", "-i": "--interactive", "-t": "--tty", "-p": "--publish", "-e": "--env", "-v": "--volume", "-P": "--publish-all", "-m": "--memory", "-w": "--workdir", "-h": "--hostname", "-u": "--user", "--net": "--network" },
    stopAtPositional: true,
  });
  if (p.error) return flagError(ctx, "run", p.error);
  if (!needArgs(ctx, "run", p.rest.length)) return;
  const imageArg = p.rest[0]!;
  if (!/^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9_][A-Za-z0-9_.-]*)?$/.test(imageArg)) {
    return flagError(ctx, "run", `docker: invalid reference format.`);
  }
  const name = p.flags.name?.[0];
  if (name !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
    return flagError(ctx, "run", `docker: Error response from daemon: Invalid container name (${name}), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed`);
  }
  const containerName = name ?? ["eager_turing", "calm_lovelace", "brave_hopper", "quick_ritchie", "happy_torvalds", "clever_knuth"][world.seq % 6]!;
  const taken = world.containers.find((c) => c.name === containerName);
  if (taken) {
    return err(ctx, `docker: Error response from daemon: Conflict. The container name "/${containerName}" is already in use by container "${taken.id}". You have to remove (or rename) that container to be able to reuse that name.`);
  }
  const ports: PortMap[] = [];
  for (const spec of p.flags.publish ?? []) {
    const parsed = parsePort(spec);
    if (typeof parsed === "string") return err(ctx, `docker: ${parsed}.`);
    ports.push({ host: parsed.host || 32768 + ((world.seq + ports.length) % 1000), container: parsed.container });
  }
  if (p.has.has("publish-all")) {
    const port = specFor(normalizeImage(imageArg)).port;
    if (port) ports.push({ host: 32768 + (world.seq % 1000), container: port });
  }
  const env: Record<string, string> = {};
  for (const item of p.flags.env ?? []) {
    const eq = item.indexOf("=");
    if (eq === 0) return err(ctx, `docker: invalid env file: "${item}"`);
    if (eq > 0) env[item.slice(0, eq)] = item.slice(eq + 1);
  }
  const mounts: Mount[] = [];
  const newVolumes: string[] = [];
  for (const item of p.flags.volume ?? []) {
    const parts = item.split(":");
    const target = parts.length === 1 ? parts[0]! : parts[1]!;
    const source = parts.length === 1 ? "" : parts[0]!;
    if (!target.startsWith("/")) {
      return err(ctx, `docker: Error response from daemon: invalid mount config for type "volume": invalid mount path: '${target}' mount path must be absolute.`);
    }
    if (source.startsWith("/") || source.startsWith("./") || source.startsWith("~")) mounts.push({ source, target, kind: "bind" });
    else if (source === "") {
      const anon = hex(`anon:${world.seq}:${mounts.length}`, 64);
      mounts.push({ source: anon, target, kind: "volume" });
      newVolumes.push(anon);
    } else if (/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(source)) {
      mounts.push({ source, target, kind: "volume" });
      if (!world.volumes.includes(source)) newVolumes.push(source);
    } else return err(ctx, `docker: Error response from daemon: invalid volume name "${source}"`);
  }
  const net = p.flags.network?.[0];
  if (net !== undefined && !world.networks.includes(net)) {
    return err(ctx, `docker: Error response from daemon: network ${net} not found.`);
  }
  const restartArg = p.flags.restart?.[0] ?? "no";
  const restart = /^(no|always|unless-stopped|on-failure)(:\d+)?$/.exec(restartArg);
  if (!restart) return err(ctx, `docker: Error response from daemon: invalid restart policy ${restartArg}`);
  let memoryMb = 0;
  if (p.flags.memory) {
    const mb = parseMemory(p.flags.memory[0]!);
    if (mb === null) return err(ctx, `docker: invalid argument "${p.flags.memory[0]}" for "-m, --memory" flag: invalid size: '${p.flags.memory[0]}'`);
    if (mb < 6) return err(ctx, "docker: Error response from daemon: Minimum memory limit allowed is 6MB");
    memoryMb = Math.round(mb);
  }

  const ref = normalizeImage(imageArg);
  let image = findImage(world, ref);
  if (!image) {
    out(ctx, `Unable to find image '${ref}' locally`);
    image = pullImage(ctx, ref) ?? undefined;
    if (!image) {
      err(ctx, "See 'docker run --help'.");
      return;
    }
  }
  const spec = specFor(imageRef(image));
  const command = p.rest.slice(1).join(" ") || spec.cmd;
  world.seq += 1;
  for (const v of newVolumes) {
    world.volumes.push(v);
    ctx.events.push({ type: "volume", name: v });
  }
  const c: Container = makeContainer({
    name: containerName, image: imageRef(image), command, status: "created", ports, env, mounts,
    networks: [net ?? "bridge"], restart: restart[1] as RestartPolicy, memoryMb, createdAt: world.tick, since: world.tick,
  });
  c.id = hex(`container:${containerName}:${world.seq}`, 64);
  world.containers.push(c);
  ctx.events.push({ type: "created", name: c.name });
  ctx.touched.add(c.id);
  const problem = boot(world, c, ctx.events);
  if (problem) {
    err(ctx, `docker: ${problem}.`);
    return;
  }
  if (p.has.has("detach")) out(ctx, c.id);
  else {
    outAll(ctx, c.logs);
    if (c.status === "running") ctx.lines.push({ kind: "sys", text: "Tip: add -d to run the container in the background and keep using this terminal." });
  }
}

function cmdPs(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const p = parseFlags(args, { bool: ["all", "quiet", "no-trunc"], value: ["filter", "format"], alias: { "-a": "--all", "-q": "--quiet", "-f": "--filter" } });
  if (p.error) return flagError(ctx, "ps", p.error);
  if (p.rest.length) return err(ctx, `"docker ps" accepts no arguments.`);
  let list = world.containers.filter((c) => p.has.has("all") || c.status === "running" || c.status === "restarting");
  for (const f of p.flags.filter ?? []) {
    const [k, v] = f.split("=");
    if (k === "status") list = list.filter((c) => c.status === v);
    else if (k === "name") list = list.filter((c) => c.name.includes(v ?? ""));
    else return err(ctx, `Error response from daemon: Invalid filter '${k}'`);
  }
  list = [...list].reverse();
  if (p.has.has("quiet")) return outAll(ctx, list.map((c) => shortId(c.id)));
  const format = p.flags.format?.[0];
  if (format) {
    return outAll(ctx, list.map((c) => format.replace(/\{\{\.(\w+)\}\}/g, (_m, field: string) => ({ ID: shortId(c.id), Names: c.name, Image: c.image, Status: statusText(world, c), Ports: portsText(c), Command: `"${c.command}"` } as Record<string, string>)[field] ?? "")));
  }
  // A shorter table than the real one (no COMMAND and CREATED columns), so it fits a small terminal.
  const rows = [["CONTAINER ID", "IMAGE", "STATUS", "PORTS", "NAMES"]];
  for (const c of list) rows.push([shortId(c.id), c.image, statusText(world, c), portsText(c), c.name]);
  outAll(ctx, table(rows));
}

export function statusText(world: DockerWorld, c: Container): string {
  if (c.status === "running") return `Up ${age(world, c.since)}`;
  if (c.status === "created") return "Created";
  if (c.status === "restarting") return `Restarting (${c.exitCode}) ${age(world, c.since)} ago`;
  return `Exited (${c.exitCode}) ${age(world, c.since)} ago`;
}

export function portsText(c: Container): string {
  if (c.status !== "running" && c.status !== "restarting") return "";
  const list = c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`);
  if (list.length === 0) {
    const port = specFor(c.image).port;
    return port ? `${port}/tcp` : "";
  }
  return list.join(", ");
}

function cmdImages(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const p = parseFlags(args, { bool: ["all", "quiet", "no-trunc"], value: ["filter"], alias: { "-a": "--all", "-q": "--quiet", "-f": "--filter" } });
  if (p.error) return flagError(ctx, "images", p.error);
  let list = [...world.images].reverse();
  for (const f of p.flags.filter ?? []) {
    if (f === "dangling=true") list = list.filter((i) => i.repo === "<none>");
    else if (f === "dangling=false") list = list.filter((i) => i.repo !== "<none>");
    else return err(ctx, `Error response from daemon: Invalid filter '${f.split("=")[0]}'`);
  }
  const wanted = p.rest[0];
  if (wanted) list = list.filter((i) => i.repo === splitImage(wanted).repo && (!wanted.includes(":") || i.tag === splitImage(wanted).tag));
  if (p.has.has("quiet")) return outAll(ctx, list.map((i) => i.id));
  const rows = [["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"]];
  for (const i of list) rows.push([i.repo, i.tag, i.id, i.created, fmtSize(i.sizeMb)]);
  outAll(ctx, table(rows));
}

function stop(ctx: Ctx, c: Container, code = 0) {
  if (c.status === "running" || c.status === "restarting") {
    const was = c.status;
    setState(ctx.world, c, "exited", code, ctx.events);
    if (was === "restarting") ctx.events.push({ type: "stopped", name: c.name });
  }
}

function eachContainer(ctx: Ctx, refs: string[], action: (c: Container) => void) {
  for (const ref of refs) {
    const c = findContainer(ctx.world, ref);
    if (!c) noContainer(ctx, ref);
    else action(c);
  }
}

function startOne(ctx: Ctx, c: Container) {
  if (c.status === "running") return out(ctx, c.name);
  ctx.touched.add(c.id);
  const problem = boot(ctx.world, c, ctx.events);
  if (problem) {
    err(ctx, problem);
    err(ctx, `Error: failed to start containers: ${c.name}`);
    return;
  }
  out(ctx, c.name);
}

function removeContainer(world: DockerWorld, c: Container, events: DockerEvent[]) {
  world.containers = world.containers.filter((x) => x !== c);
  events.push({ type: "removed", name: c.name });
}

function cmdLogs(ctx: Ctx, args: string[]) {
  const p = parseFlags(args, { bool: ["follow", "timestamps"], value: ["tail", "since"], alias: { "-f": "--follow", "-t": "--timestamps", "-n": "--tail" } });
  if (p.error) return flagError(ctx, "logs", p.error);
  if (!needArgs(ctx, "logs", p.rest.length)) return;
  if (p.rest.length > 1) return err(ctx, `docker: "docker logs" requires exactly 1 argument.`);
  const c = findContainer(ctx.world, p.rest[0]!);
  if (!c) return noContainer(ctx, p.rest[0]!);
  let lines = c.logs;
  const tail = p.flags.tail?.[0];
  if (tail !== undefined && tail !== "all") {
    if (!/^\d+$/.test(tail)) return err(ctx, `invalid argument "${tail}" for "-n, --tail" flag: strconv.ParseUint: parsing "${tail}": invalid syntax`);
    lines = Number(tail) === 0 ? [] : lines.slice(-Number(tail));
  }
  outAll(ctx, lines);
  if (p.has.has("follow")) ctx.lines.push({ kind: "sys", text: "(-f would keep waiting for new lines; the game shows the lines so far.)" });
}

function inspectObject(world: DockerWorld, c: Container): Record<string, unknown> {
  const env = Object.entries(c.env).map(([k, v]) => `${k}=${v}`);
  const networks: Record<string, unknown> = {};
  for (const n of c.networks) networks[n] = { NetworkID: hex(`net:${n}`, 64), IPAddress: c.status === "running" ? ipOf(world, c) : "" };
  const bindings: Record<string, unknown> = {};
  for (const p of c.ports) bindings[`${p.container}/tcp`] = [{ HostIp: "", HostPort: String(p.host) }];
  return {
    Id: c.id,
    Name: `/${c.name}`,
    State: {
      Status: c.status, Running: c.status === "running", Restarting: c.status === "restarting", OOMKilled: c.oomKilled,
      ExitCode: c.exitCode, Error: "", RestartCount: c.restartCount,
    },
    Config: { Image: c.image, Cmd: c.command.split(" "), Env: env },
    HostConfig: { Memory: Math.round(c.memoryMb * 1048576), RestartPolicy: { Name: c.restart }, PortBindings: bindings },
    Mounts: c.mounts.map((m) => ({ Type: m.kind, Name: m.kind === "volume" ? m.source : "", Source: m.source, Destination: m.target })),
    NetworkSettings: { Networks: networks },
  };
}

function cmdInspect(ctx: Ctx, args: string[]) {
  const p = parseFlags(args, { value: ["format", "type"], alias: { "-f": "--format" } });
  if (p.error) return flagError(ctx, "inspect", p.error);
  if (!needArgs(ctx, "inspect", p.rest.length)) return;
  const format = p.flags.format?.[0];
  const results: Record<string, unknown>[] = [];
  for (const ref of p.rest) {
    const c = findContainer(ctx.world, ref);
    if (!c) {
      err(ctx, `Error: No such object: ${ref}`);
      continue;
    }
    results.push(inspectObject(ctx.world, c));
  }
  if (format) {
    for (const obj of results) {
      out(ctx, format.replace(/\{\{\s*\.([\w.]+)\s*\}\}/g, (_m, path: string) => {
        let cur: unknown = obj;
        for (const key of path.split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined;
        if (cur === undefined) return "<no value>";
        return typeof cur === "object" ? JSON.stringify(cur) : String(cur);
      }));
    }
    return;
  }
  if (results.length === 0 && p.rest.length) return out(ctx, "[]");
  outAll(ctx, JSON.stringify(results, null, 4).split("\n"));
}

function curlFrom(ctx: Ctx, from: Container | null, target: string): { ok: boolean; text: string } {
  const world = ctx.world;
  let url = target.replace(/^https?:\/\//, "");
  url = url.split("/")[0] ?? "";
  const m = /^([A-Za-z0-9._-]+)(?::(\d{1,5}))?$/.exec(url);
  if (!m) return { ok: false, text: `curl: (3) URL rejected: Bad hostname` };
  const host = m[1]!;
  const port = m[2] ? Number(m[2]) : 80;
  const refused = `curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server`;
  let container: Container | undefined;
  let containerPort = port;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    if (from) {
      container = from;
    } else {
      container = world.containers.find((c) => c.status === "running" && c.ports.some((pp) => pp.host === port));
      containerPort = container?.ports.find((pp) => pp.host === port)?.container ?? port;
    }
  } else if (from) {
    container = resolveName(world, from, host) ?? undefined;
    if (!container) return { ok: false, text: `curl: (6) Could not resolve host: ${host}` };
  } else {
    return { ok: false, text: `curl: (6) Could not resolve host: ${host}` };
  }
  if (!container || container.status !== "running") return { ok: false, text: refused };
  const spec = specFor(container.image);
  const runs = container.command === spec.cmd;
  if (!runs || spec.port !== containerPort) {
    return { ok: false, text: from ? refused : `curl: (56) Recv failure: Connection reset by peer` };
  }
  if (spec.rawPort || spec.body === undefined) return { ok: false, text: "curl: (52) Empty reply from server" };
  return { ok: true, text: spec.body };
}

function cmdExec(ctx: Ctx, args: string[]) {
  const p = parseFlags(args, { bool: ["interactive", "tty", "detach"], value: ["env", "workdir", "user"], alias: { "-i": "--interactive", "-t": "--tty", "-d": "--detach", "-e": "--env", "-w": "--workdir", "-u": "--user" }, stopAtPositional: true });
  if (p.error) return flagError(ctx, "exec", p.error);
  if (!needArgs(ctx, "exec", p.rest.length)) return;
  const c = findContainer(ctx.world, p.rest[0]!);
  if (!c) return noContainer(ctx, p.rest[0]!);
  if (c.status !== "running") return err(ctx, `Error response from daemon: container ${c.id} is not running`);
  const [cmd, ...rest] = p.rest.slice(1);
  const spec = specFor(c.image);
  switch (cmd) {
    case "env":
    case "printenv": {
      const base = { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOSTNAME: shortId(c.id), ...c.env, HOME: "/root" };
      if (cmd === "printenv" && rest[0]) {
        const v = (base as Record<string, string>)[rest[0]];
        if (v === undefined) return;
        return out(ctx, v);
      }
      return outAll(ctx, Object.entries(base).map(([k, v]) => `${k}=${v}`));
    }
    case "hostname": return out(ctx, shortId(c.id));
    case "whoami": return out(ctx, "root");
    case "ls": {
      const dir = rest.find((r) => !r.startsWith("-")) ?? "/";
      const mounted = c.mounts.find((m) => m.target === dir);
      if (mounted) return out(ctx, mounted.kind === "volume" ? "PG_VERSION  base  global  pg_wal  postgresql.conf" : "(bind mount from the host)");
      if (dir === "/" ) return out(ctx, "bin  dev  etc  home  proc  root  usr  var" + (c.mounts.length ? "  " + c.mounts.map((m) => m.target.split("/")[1]).filter(Boolean).join("  ") : ""));
      if (dir === spec.dataPath) return out(ctx, "PG_VERSION  base  global  pg_wal  postgresql.conf");
      return out(ctx, "");
    }
    case "cat": {
      const file = rest[0];
      if (!file) return;
      if (file === "/etc/hostname") return out(ctx, shortId(c.id));
      if (file === "/etc/hosts") return outAll(ctx, ["127.0.0.1\tlocalhost", `${ipOf(ctx.world, c)}\t${shortId(c.id)}`]);
      return err(ctx, `cat: ${file}: No such file or directory`);
    }
    case "curl": {
      const target = rest.filter((r) => !r.startsWith("-"))[0];
      if (!target) return err(ctx, "curl: try 'curl --help' for more information");
      const result = curlFrom(ctx, c, target);
      return result.ok ? out(ctx, result.text) : err(ctx, result.text);
    }
    case "ping": {
      const host = rest.filter((r) => !r.startsWith("-") && !/^\d+$/.test(r))[0];
      if (!host) return err(ctx, "ping: usage error: Destination address required");
      const target = host === "localhost" ? c : resolveName(ctx.world, c, host);
      if (!target) return err(ctx, `ping: ${host}: Temporary failure in name resolution`);
      const ip = host === "localhost" ? "127.0.0.1" : ipOf(ctx.world, target);
      return outAll(ctx, [
        `PING ${host} (${ip}) 56(84) bytes of data.`,
        `64 bytes from ${host} (${ip}): icmp_seq=1 ttl=64 time=0.08 ms`,
        `64 bytes from ${host} (${ip}): icmp_seq=2 ttl=64 time=0.06 ms`,
        `--- ${host} ping statistics ---`,
        "2 packets transmitted, 2 received, 0% packet loss",
      ]);
    }
    case "sh":
    case "bash":
      return ctx.lines.push({ kind: "sys", text: `This game has no interactive shell. Try: docker exec ${c.name} env, ls or curl.` }), undefined;
    default:
      return err(ctx, `OCI runtime exec failed: exec failed: unable to start container process: exec: "${cmd}": executable file not found in $PATH: unknown`);
  }
}

function cmdStats(ctx: Ctx, args: string[]) {
  const p = parseFlags(args, { bool: ["no-stream", "all"], value: ["format"], alias: { "-a": "--all" } });
  if (p.error) return flagError(ctx, "stats", p.error);
  let list = ctx.world.containers.filter((c) => c.status === "running");
  if (p.rest.length) {
    const picked: Container[] = [];
    for (const ref of p.rest) {
      const c = findContainer(ctx.world, ref);
      if (!c) return noContainer(ctx, ref);
      picked.push(c);
    }
    list = picked.filter((c) => c.status === "running");
  }
  const rows = [["CONTAINER ID", "NAME", "CPU %", "MEM USAGE / LIMIT", "MEM %", "PIDS"]];
  for (const c of [...list].reverse()) {
    const use = specFor(c.image).useMb ?? 20;
    const limit = c.memoryMb > 0 ? c.memoryMb : 7870;
    rows.push([shortId(c.id), c.name, "0.02%", `${use}MiB / ${c.memoryMb > 0 ? `${limit}MiB` : "7.686GiB"}`, `${((use / limit) * 100).toFixed(2)}%`, "4"]);
  }
  outAll(ctx, table(rows));
  if (!p.has.has("no-stream")) ctx.lines.push({ kind: "sys", text: "(The real command keeps refreshing until Ctrl+C. Add --no-stream for one snapshot.)" });
}

function cmdNetwork(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const [sub, ...rest] = args;
  if (sub === "ls" || sub === "list") {
    const rows = [["NETWORK ID", "NAME", "DRIVER", "SCOPE"]];
    for (const n of world.networks) rows.push([hex(`net:${n}`, 12), n, n === "host" ? "host" : n === "none" ? "null" : "bridge", "local"]);
    return outAll(ctx, table(rows));
  }
  if (sub === "create") {
    const p = parseFlags(rest, { value: ["driver"], alias: { "-d": "--driver" } });
    if (p.error) return flagError(ctx, "network create", p.error);
    if (p.rest.length !== 1) return err(ctx, `docker: "docker network create" requires exactly 1 argument.`);
    const name = p.rest[0]!;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return err(ctx, `Error response from daemon: invalid network name ${name}`);
    if (world.networks.includes(name)) return err(ctx, `Error response from daemon: network with name ${name} already exists`);
    world.networks.push(name);
    ctx.events.push({ type: "network", name });
    return out(ctx, hex(`net:${name}`, 64));
  }
  if (sub === "connect") {
    if (rest.length !== 2) return err(ctx, `docker: "docker network connect" requires exactly 2 arguments.`);
    const [net, ref] = rest as [string, string];
    if (!world.networks.includes(net)) return err(ctx, `Error response from daemon: network ${net} not found`);
    const c = findContainer(world, ref);
    if (!c) return noContainer(ctx, ref);
    if (c.networks.includes(net)) return err(ctx, `Error response from daemon: endpoint with name ${c.name} already exists in network ${net}`);
    c.networks.push(net);
    ctx.events.push({ type: "network", name: net });
    return;
  }
  if (sub === "disconnect") {
    if (rest.length !== 2) return err(ctx, `docker: "docker network disconnect" requires exactly 2 arguments.`);
    const [net, ref] = rest as [string, string];
    const c = findContainer(world, ref);
    if (!c) return noContainer(ctx, ref);
    if (!c.networks.includes(net)) return err(ctx, `Error response from daemon: container ${c.id} is not connected to network ${net}`);
    c.networks = c.networks.filter((n) => n !== net);
    return;
  }
  if (sub === "rm") {
    for (const net of rest) {
      if (["bridge", "host", "none"].includes(net)) { err(ctx, `Error response from daemon: ${net} is a pre-defined network and cannot be removed`); continue; }
      if (!world.networks.includes(net)) { err(ctx, `Error response from daemon: network ${net} not found`); continue; }
      if (world.containers.some((c) => c.networks.includes(net))) { err(ctx, `Error response from daemon: error while removing network: network ${net} has active endpoints`); continue; }
      world.networks = world.networks.filter((n) => n !== net);
      out(ctx, net);
    }
    return;
  }
  err(ctx, sub ? `docker network: '${sub}' is not a docker network command.` : "Usage:  docker network COMMAND (ls, create, connect, disconnect, rm)");
}

function cmdVolume(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const [sub, ...rest] = args;
  if (sub === "ls" || sub === "list") {
    const rows = [["DRIVER", "VOLUME NAME"]];
    for (const v of world.volumes) rows.push(["local", v]);
    return outAll(ctx, table(rows));
  }
  if (sub === "create") {
    if (rest.length > 1 || rest[0]?.startsWith("-")) return err(ctx, `docker: "docker volume create" requires at most 1 argument.`);
    const name = rest[0] ?? hex(`vol:${world.seq++}`, 64);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return err(ctx, `Error response from daemon: create ${name}: "${name}" includes invalid characters for a local volume name`);
    if (!world.volumes.includes(name)) world.volumes.push(name);
    ctx.events.push({ type: "volume", name });
    return out(ctx, name);
  }
  if (sub === "rm") {
    for (const v of rest) {
      if (!world.volumes.includes(v)) { err(ctx, `Error response from daemon: get ${v}: no such volume`); continue; }
      const users = world.containers.filter((c) => c.mounts.some((m) => m.source === v));
      if (users.length) { err(ctx, `Error response from daemon: remove ${v}: volume is in use - [${users.map((c) => c.id).join(", ")}]`); continue; }
      world.volumes = world.volumes.filter((x) => x !== v);
      out(ctx, v);
    }
    return;
  }
  if (sub === "prune") {
    const p = parseFlags(rest, { bool: ["force", "all"], alias: { "-f": "--force", "-a": "--all" } });
    if (!p.has.has("force")) return promptNo(ctx, "all local volumes not used by at least one container");
    return prune(ctx, { volumes: true });
  }
  err(ctx, sub ? `docker volume: '${sub}' is not a docker volume command.` : "Usage:  docker volume COMMAND (ls, create, rm, prune)");
}

function promptNo(ctx: Ctx, what: string) {
  out(ctx, `WARNING! This will remove ${what}.`);
  out(ctx, "Are you sure you want to continue? [y/N] ");
  ctx.lines.push({ kind: "sys", text: "No answer was given, so nothing was removed. Add -f to skip the question." });
}

function prune(ctx: Ctx, opt: { containers?: boolean; images?: boolean; allImages?: boolean; volumes?: boolean; networks?: boolean }) {
  const world = ctx.world;
  let reclaimed = 0;
  if (opt.containers) {
    const gone = world.containers.filter((c) => c.status === "exited" || c.status === "created");
    if (gone.length) out(ctx, "Deleted Containers:");
    for (const c of gone) {
      out(ctx, c.id);
      reclaimed += 6;
      removeContainer(world, c, ctx.events);
    }
  }
  if (opt.networks) {
    const gone = world.networks.filter((n) => isUserNetwork(n) && !world.containers.some((c) => c.networks.includes(n)));
    if (gone.length) out(ctx, "Deleted Networks:");
    for (const n of gone) out(ctx, n);
    world.networks = world.networks.filter((n) => !gone.includes(n));
  }
  if (opt.volumes) {
    const gone = world.volumes.filter((v) => !world.containers.some((c) => c.mounts.some((m) => m.source === v)));
    if (gone.length) out(ctx, "Deleted Volumes:");
    for (const v of gone) out(ctx, v);
    world.volumes = world.volumes.filter((v) => !gone.includes(v));
    reclaimed += gone.length * 40;
  }
  if (opt.images) {
    const used = new Set(world.containers.map((c) => c.image));
    const gone = world.images.filter((i) => (i.repo === "<none>") || (opt.allImages && !used.has(imageRef(i))));
    if (gone.length) out(ctx, "Deleted Images:");
    for (const i of gone) {
      out(ctx, i.repo === "<none>" ? `deleted: sha256:${hex(`sha:${i.id}`, 64)}` : `untagged: ${imageRef(i)}`);
      reclaimed += i.sizeMb;
    }
    world.images = world.images.filter((i) => !gone.includes(i));
  }
  ctx.events.push({ type: "pruned", name: "prune" });
  out(ctx, "");
  out(ctx, `Total reclaimed space: ${fmtSize(reclaimed)}`);
}

export function diskUsedMb(world: DockerWorld): number {
  return world.images.reduce((sum, i) => sum + i.sizeMb, 0) + world.containers.length * 6 + world.volumes.length * 40;
}

function cmdSystem(ctx: Ctx, args: string[]) {
  const [sub, ...rest] = args;
  if (sub === "df") {
    const w = ctx.world;
    const rows = [["TYPE", "TOTAL", "ACTIVE", "SIZE"]];
    rows.push(["Images", String(w.images.length), String(new Set(w.containers.map((c) => c.image)).size), fmtSize(w.images.reduce((s, i) => s + i.sizeMb, 0))]);
    rows.push(["Containers", String(w.containers.length), String(w.containers.filter((c) => c.status === "running").length), fmtSize(w.containers.length * 6)]);
    rows.push(["Local Volumes", String(w.volumes.length), String(w.volumes.filter((v) => w.containers.some((c) => c.mounts.some((m) => m.source === v))).length), fmtSize(w.volumes.length * 40)]);
    return outAll(ctx, table(rows));
  }
  if (sub === "prune") {
    const p = parseFlags(rest, { bool: ["force", "all", "volumes"], alias: { "-f": "--force", "-a": "--all" } });
    if (p.error) return flagError(ctx, "system prune", p.error);
    if (!p.has.has("force")) {
      out(ctx, "WARNING! This will remove:");
      out(ctx, "  - all stopped containers");
      out(ctx, "  - all networks not used by at least one container");
      if (p.has.has("volumes")) out(ctx, "  - all anonymous volumes not used by at least one container");
      out(ctx, p.has.has("all") ? "  - all images without at least one container associated to them" : "  - all dangling images");
      out(ctx, "");
      out(ctx, "Are you sure you want to continue? [y/N] ");
      ctx.lines.push({ kind: "sys", text: "No answer was given, so nothing was removed. Add -f to skip the question." });
      return;
    }
    return prune(ctx, { containers: true, networks: true, images: true, allImages: p.has.has("all"), volumes: p.has.has("volumes") });
  }
  err(ctx, sub ? `docker system: '${sub}' is not a docker system command.` : "Usage:  docker system COMMAND (df, prune)");
}

// ---------------------------------------------------------------------------------------------
// docker compose (only when the scenario has a compose file).

function composeOrder(services: ComposeService[]): ComposeService[] {
  const done: ComposeService[] = [];
  const visit = (s: ComposeService, depth: number) => {
    if (done.includes(s) || depth > 10) return;
    for (const d of s.dependsOn) {
      const dep = services.find((x) => x.name === d);
      if (dep) visit(dep, depth + 1);
    }
    done.push(s);
  };
  services.forEach((s) => visit(s, 0));
  return done;
}

function cmdCompose(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  const compose = world.compose;
  if (!compose) return err(ctx, "no configuration file provided: not found");
  const [sub, ...rest] = args;
  const net = `${compose.project}_default`;
  const mine = () => world.containers.filter((c) => c.project === compose.project);
  if (sub === "up") {
    const p = parseFlags(rest, { bool: ["detach", "build", "force-recreate"], alias: { "-d": "--detach" } });
    if (p.error) return flagError(ctx, "compose up", p.error);
    if (!p.has.has("detach")) return err(ctx, "This game runs compose in the background. Use: docker compose up -d");
    const order = composeOrder(compose.services);
    const lines: string[] = [];
    let failed = 0;
    if (!world.networks.includes(net)) {
      world.networks.push(net);
      ctx.events.push({ type: "network", name: net });
      lines.push(` ✔ Network ${net}`.padEnd(40) + "Created");
    } else lines.push(` ✔ Network ${net}`.padEnd(40) + "Running");
    for (const s of compose.services) {
      for (const v of s.volumes) {
        const src = v.split(":")[0]!;
        if (src.startsWith("/") || src.startsWith(".")) continue;
        const full = `${compose.project}_${src}`;
        if (!world.volumes.includes(full)) {
          world.volumes.push(full);
          ctx.events.push({ type: "volume", name: full });
          lines.push(` ✔ Volume ${full}`.padEnd(40) + "Created");
        }
      }
    }
    const errors: string[] = [];
    for (const s of order) {
      const name = `${compose.project}-${s.name}-1`;
      let c = world.containers.find((x) => x.name === name);
      const label = ` ✔ Container ${name}`.padEnd(40);
      if (c && c.status === "running") { lines.push(label + "Running"); continue; }
      if (!c) {
        world.seq += 1;
        const ports: PortMap[] = [];
        for (const spec of s.ports) {
          const parsed = parsePort(spec);
          if (typeof parsed !== "string") ports.push({ host: parsed.host, container: parsed.container });
        }
        const mounts: Mount[] = s.volumes.map((v) => {
          const [src, dst] = v.split(":") as [string, string];
          return src.startsWith("/") || src.startsWith(".") ? { source: src, target: dst, kind: "bind" as const } : { source: `${compose.project}_${src}`, target: dst, kind: "volume" as const };
        });
        c = makeContainer({
          name, image: s.image, status: "created", ports, env: { ...s.env }, mounts, networks: [net], restart: s.restart ?? "no",
          createdAt: world.tick, since: world.tick, project: compose.project, service: s.name,
        });
        c.id = hex(`container:${name}:${world.seq}`, 64);
        world.containers.push(c);
        ctx.events.push({ type: "created", name });
      }
      ctx.touched.add(c.id);
      const problem = boot(world, c, ctx.events);
      if (problem) {
        failed += 1;
        lines.push(` ✘ Container ${name}`.padEnd(40) + "Error");
        errors.push(problem);
      } else lines.push(label + "Started");
    }
    out(ctx, `[+] Running ${lines.length - failed}/${lines.length}`);
    outAll(ctx, lines);
    for (const e of errors) err(ctx, e);
    return;
  }
  if (sub === "ps") {
    const p = parseFlags(rest, { bool: ["all", "quiet"], alias: { "-a": "--all", "-q": "--quiet" } });
    const list = mine().filter((c) => p.has.has("all") || c.status === "running" || c.status === "restarting");
    const rows = [["NAME", "IMAGE", "SERVICE", "STATUS", "PORTS"]];
    for (const c of list) rows.push([c.name, c.image, c.service ?? "", statusText(world, c), portsText(c)]);
    return outAll(ctx, table(rows));
  }
  if (sub === "logs") {
    const want = rest.filter((r) => !r.startsWith("-"));
    for (const c of mine()) {
      if (want.length && !want.includes(c.service ?? "")) continue;
      for (const line of c.logs) out(ctx, `${c.name}  | ${line}`);
    }
    return;
  }
  if (sub === "down") {
    const gone = mine();
    for (const c of gone) {
      out(ctx, ` ✔ Container ${c.name}`.padEnd(40) + "Removed");
      removeContainer(world, c, ctx.events);
    }
    if (world.networks.includes(net)) {
      world.networks = world.networks.filter((n) => n !== net);
      out(ctx, ` ✔ Network ${net}`.padEnd(40) + "Removed");
    }
    return;
  }
  err(ctx, sub ? `docker: 'compose ${sub}' is not supported here. Try: docker compose up -d, ps, logs, down` : "Usage:  docker compose COMMAND (up -d, ps, logs, down)");
}

// ---------------------------------------------------------------------------------------------

function cmdDocker(ctx: Ctx, args: string[]) {
  const world = ctx.world;
  let [cmd, ...rest] = args;
  if (cmd === undefined) {
    return outAll(ctx, ["Usage:  docker [OPTIONS] COMMAND", "", "Commands: ps, images, run, start, stop, restart, rm, rmi, logs, inspect, exec, pull,", "          network, volume, stats, system, compose"]);
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") return out(ctx, "Docker version 27.3.1, build ce12230");
  if (cmd === "container" || cmd === "image") {
    const sub = rest[0];
    const map: Record<string, string> = cmd === "container"
      ? { ls: "ps", list: "ps", ps: "ps", rm: "rm", stop: "stop", start: "start", restart: "restart", logs: "logs", inspect: "inspect", run: "run", exec: "exec", kill: "kill", prune: "container-prune", stats: "stats" }
      : { ls: "images", list: "images", rm: "rmi", pull: "pull", prune: "image-prune", inspect: "inspect" };
    const mapped = sub ? map[sub] : undefined;
    if (!mapped) return err(ctx, `docker ${cmd}: '${sub ?? ""}' is not a docker ${cmd} command.`);
    cmd = mapped;
    rest = rest.slice(1);
  }
  switch (cmd) {
    case "run": return cmdRun(ctx, rest);
    case "ps": return cmdPs(ctx, rest);
    case "images": return cmdImages(ctx, rest);
    case "pull": {
      const p = parseFlags(rest, {});
      if (p.error) return flagError(ctx, "pull", p.error);
      if (!needArgs(ctx, "pull", p.rest.length)) return;
      if (!/^[a-z0-9][a-z0-9._/-]*(:[A-Za-z0-9_][A-Za-z0-9_.-]*)?$/.test(p.rest[0]!)) return err(ctx, "invalid reference format");
      pullImage(ctx, p.rest[0]!);
      return;
    }
    case "start": {
      const p = parseFlags(rest, { bool: ["attach", "interactive"], alias: { "-a": "--attach", "-i": "--interactive" } });
      if (p.error) return flagError(ctx, "start", p.error);
      if (!needArgs(ctx, "start", p.rest.length)) return;
      return eachContainer(ctx, p.rest, (c) => startOne(ctx, c));
    }
    case "stop":
    case "kill": {
      const p = parseFlags(rest, { value: ["time", "signal"], alias: { "-t": "--time", "-s": "--signal" } });
      if (p.error) return flagError(ctx, cmd, p.error);
      if (!needArgs(ctx, cmd, p.rest.length)) return;
      return eachContainer(ctx, p.rest, (c) => {
        if (cmd === "kill" && c.status !== "running") return err(ctx, `Error response from daemon: cannot kill container: ${c.name}: container ${c.id} is not running`);
        stop(ctx, c, cmd === "kill" ? 137 : 0);
        out(ctx, c.name);
      });
    }
    case "restart": {
      const p = parseFlags(rest, { value: ["time"], alias: { "-t": "--time" } });
      if (p.error) return flagError(ctx, "restart", p.error);
      if (!needArgs(ctx, "restart", p.rest.length)) return;
      return eachContainer(ctx, p.rest, (c) => {
        stop(ctx, c);
        startOne(ctx, c);
      });
    }
    case "rm": {
      const p = parseFlags(rest, { bool: ["force", "volumes"], alias: { "-f": "--force", "-v": "--volumes" } });
      if (p.error) return flagError(ctx, "rm", p.error);
      if (!needArgs(ctx, "rm", p.rest.length)) return;
      return eachContainer(ctx, p.rest, (c) => {
        if ((c.status === "running" || c.status === "restarting") && !p.has.has("force")) {
          return err(ctx, `Error response from daemon: You cannot remove a ${c.status === "running" ? "running" : "restarting"} container ${c.id}. Stop the container before attempting removal or force remove`);
        }
        removeContainer(world, c, ctx.events);
        out(ctx, c.name);
      });
    }
    case "rmi": {
      const p = parseFlags(rest, { bool: ["force"], alias: { "-f": "--force" } });
      if (p.error) return flagError(ctx, "rmi", p.error);
      if (!needArgs(ctx, "rmi", p.rest.length)) return;
      for (const ref of p.rest) {
        const image = findImage(world, ref);
        if (!image) { err(ctx, `Error response from daemon: No such image: ${normalizeImage(ref)}`); continue; }
        const users = world.containers.filter((c) => c.image === imageRef(image));
        if (users.length && !p.has.has("force")) {
          err(ctx, `Error response from daemon: conflict: unable to remove repository reference "${imageRef(image)}" (must force) - container ${shortId(users[0]!.id)} is using its referenced image ${image.id}`);
          continue;
        }
        world.images = world.images.filter((i) => i !== image);
        out(ctx, image.repo === "<none>" ? `Deleted: sha256:${hex(`sha:${image.id}`, 64)}` : `Untagged: ${imageRef(image)}`);
      }
      return;
    }
    case "logs": return cmdLogs(ctx, rest);
    case "inspect": return cmdInspect(ctx, rest);
    case "exec": return cmdExec(ctx, rest);
    case "stats": return cmdStats(ctx, rest);
    case "network": return cmdNetwork(ctx, rest);
    case "volume": return cmdVolume(ctx, rest);
    case "system": return cmdSystem(ctx, rest);
    case "compose": return cmdCompose(ctx, rest);
    case "container-prune":
    case "image-prune": {
      const p = parseFlags(rest, { bool: ["force", "all"], alias: { "-f": "--force", "-a": "--all" } });
      if (p.error) return flagError(ctx, cmd, p.error);
      if (!p.has.has("force")) return promptNo(ctx, cmd === "container-prune" ? "all stopped containers" : "all dangling images");
      return cmd === "container-prune" ? prune(ctx, { containers: true }) : prune(ctx, { images: true, allImages: p.has.has("all") });
    }
    default:
      err(ctx, `docker: '${cmd}' is not a docker command.`);
      err(ctx, "See 'docker --help'");
  }
}

function runSimple(ctx: Ctx, segment: string, depth: number): boolean {
  let text = segment.trim();
  if (!text) return true;
  // $(...) is replaced by what the inner command prints, one word per line.
  for (let guard = 0; guard < 4 && /\$\(([^()]*)\)/.test(text); guard++) {
    text = text.replace(/\$\(([^()]*)\)/g, (_m, inner: string) => {
      if (depth >= 2) return "";
      const sub: Ctx = { world: ctx.world, lines: [], events: ctx.events, touched: ctx.touched };
      runSimple(sub, inner, depth + 1);
      return sub.lines.filter((l) => l.kind === "out").map((l) => l.text.trim()).filter(Boolean).join(" ");
    });
  }
  const tokens = tokenize(text);
  if (tokens === null) {
    err(ctx, "bash: unexpected EOF while looking for matching quote");
    return false;
  }
  const before = ctx.lines.length;
  const head = tokens[0];
  if (head === undefined) return true;
  if (head === "docker" || head === "docker-compose") cmdDocker(ctx, head === "docker" ? tokens.slice(1) : ["compose", ...tokens.slice(1)]);
  else if (head === "curl") {
    const target = tokens.slice(1).filter((t) => !t.startsWith("-"))[0];
    if (!target) err(ctx, "curl: try 'curl --help' or 'curl --manual' for more information");
    else {
      const result = curlFrom(ctx, null, target);
      if (result.ok) {
        out(ctx, result.text);
        ctx.events.push({ type: "pulled", name: "curl" });
      } else err(ctx, result.text);
    }
  } else if ((head === "cat" || head === "less") && ctx.world.compose && /^(\.\/)?(docker-)?compose\.ya?ml$/.test(tokens[1] ?? "")) {
    outAll(ctx, ctx.world.compose.file);
  } else if (head === "ls") outAll(ctx, ctx.world.compose ? ["docker-compose.yml"] : []);
  else if (head === "pwd") out(ctx, "/home/learner");
  else if (head === "whoami") out(ctx, "learner");
  else err(ctx, `bash: ${head}: command not found`);
  const failed = ctx.lines.slice(before).some((l) => l.kind === "err");
  return !failed;
}

export const HELP_LINES = [
  "Docker commands you can use here:",
  "  docker ps [-a]                      list containers",
  "  docker images                       list images",
  "  docker run -d -p 8080:80 --name web [-e K=V] [-v vol:/path] [--network n] [--restart always] [--memory 512m] IMAGE",
  "  docker start|stop|restart|rm [-f] NAME",
  "  docker rmi IMAGE        docker pull IMAGE[:TAG]",
  "  docker logs [--tail N] NAME      docker inspect [-f '{{.State.ExitCode}}'] NAME",
  "  docker exec NAME env | ls | cat FILE | curl HOST:PORT | ping HOST",
  "  docker network ls|create|connect      docker volume ls|create",
  "  docker stats --no-stream        docker system df|prune [-f]",
  "  curl localhost:8080             (the host side check)",
  "  docker compose up -d | ps | down        (only when a compose file is shown)",
  "  hint    clear    reset",
];

/** Run one typed line (it may hold several commands joined with &&). Changes the world in place. */
export function runLine(world: DockerWorld, line: string): RunResult {
  const ctx: Ctx = { world, lines: [], events: [], touched: new Set() };
  try {
    if (line.length > 300) {
      err(ctx, "bash: command line too long");
      return { lines: ctx.lines, ok: false, events: ctx.events };
    }
    let ok = true;
    for (const part of splitAnd(line)) {
      world.tick += 1;
      ok = runSimple(ctx, part, 0);
      settle(world, ctx.touched, ctx.events);
      if (!ok) break;
    }
    return { lines: ctx.lines, ok, events: ctx.events };
  } catch {
    err(ctx, "bash: something went wrong with that command");
    return { lines: ctx.lines, ok: false, events: ctx.events };
  }
}

// ---------------------------------------------------------------------------------------------
// Goals: what must be true at the end. Pure data, so a round can travel as JSON.

export type Goal =
  | { kind: "running"; name: string; label: string }
  | { kind: "absent"; name: string; label: string }
  | { kind: "image"; name: string; image: string; label: string }
  | { kind: "served"; name: string; contains?: string; label: string }
  | { kind: "publishes"; name: string; port: number; label: string }
  | { kind: "env"; name: string; key: string; value?: string; label: string }
  | { kind: "mount"; name: string; target: string; label: string }
  | { kind: "sharedNetwork"; a: string; b: string; label: string }
  | { kind: "noExited"; label: string }
  | { kind: "noDangling"; label: string }
  | { kind: "restartPolicy"; name: string; policy: RestartPolicy; label: string }
  | { kind: "memoryAtLeast"; name: string; mb: number; label: string }
  | { kind: "imageExists"; image: string; label: string }
  | { kind: "volumeExists"; name: string; label: string };

/** What a host `curl` would get for a container, trying each published port. */
export function servedBody(world: DockerWorld, name: string): string | null {
  const c = world.containers.find((x) => x.name === name);
  if (!c || c.status !== "running") return null;
  for (const p of c.ports) {
    const ctx: Ctx = { world, lines: [], events: [], touched: new Set() };
    const res = curlFrom(ctx, null, `localhost:${p.host}`);
    if (res.ok) return res.text;
  }
  return null;
}

export function checkGoal(world: DockerWorld, goal: Goal): boolean {
  const find = (name: string) => world.containers.find((c) => c.name === name);
  switch (goal.kind) {
    case "running": return find(goal.name)?.status === "running";
    case "absent": return !find(goal.name);
    case "image": return find(goal.name)?.image === normalizeImage(goal.image);
    case "served": {
      const body = servedBody(world, goal.name);
      return body !== null && (goal.contains === undefined || body.includes(goal.contains));
    }
    case "publishes": return find(goal.name)?.ports.some((p) => p.container === goal.port) ?? false;
    case "env": {
      const v = find(goal.name)?.env[goal.key];
      return v !== undefined && v !== "" && (goal.value === undefined || v === goal.value);
    }
    case "mount": return find(goal.name)?.mounts.some((m) => m.target === goal.target && m.kind === "volume") ?? false;
    case "sharedNetwork": {
      const a = find(goal.a);
      const b = find(goal.b);
      return !!a && !!b && a.networks.some((n) => isUserNetwork(n) && b.networks.includes(n));
    }
    case "noExited": return !world.containers.some((c) => c.status === "exited" || c.status === "created");
    case "noDangling": return !world.images.some((i) => i.repo === "<none>");
    case "restartPolicy": return find(goal.name)?.restart === goal.policy;
    case "memoryAtLeast": {
      const c = find(goal.name);
      return !!c && c.status === "running" && (c.memoryMb === 0 || c.memoryMb >= goal.mb);
    }
    case "imageExists": return !!findImage(world, goal.image);
    case "volumeExists": return world.volumes.includes(goal.name);
  }
}
