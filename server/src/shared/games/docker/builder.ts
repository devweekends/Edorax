// The build simulation for the Docker Commands game. The player puts together a Dockerfile (pieces
// in an order) or a small compose file (one choice per blank). `simulateBuild` reads the result the
// way Docker would and reports whether it builds, how long a build and a rebuild take, how big the
// image is, and whether the app can be reached. Pure and deterministic, and it never throws.

export type BuildKind = "dockerfile" | "compose";

export type ComposeFact = {
  service: string;
  key: "port" | "env" | "depends" | "volume" | "network" | "decl-volume" | "decl-network";
  value: string;
};

export type BuildPiece = {
  id: string;
  /** What the player reads, for example `RUN npm ci`. */
  text: string;
  /** Compose only: the blank this piece can fill. */
  slot?: string;
  /** Compose only: what the piece means. */
  facts?: ComposeFact[];
};

/** The app a Dockerfile builds. */
export type AppSpec = {
  runtime: "node" | "python";
  /** The file or pattern that lists the dependencies, as written in COPY. */
  manifest: string;
  /** What the app listens on when nothing sets the port. */
  defaultPort: number;
  /** An environment variable the app reads for its port. */
  portEnv?: string;
  /** Start commands that work, for example `node server.js`. */
  start: string[];
};

export type StackService = {
  image: string;
  sizeMb: number;
  /** The port the app listens on inside its container. */
  port?: number;
  requiredEnv?: string[];
  dataPath?: string;
  /** An environment variable that must name another service (DB_HOST=db). */
  hostEnv?: { key: string; value: string };
  mustDependOn?: string[];
  /** Services this one talks to, so they must share a network. */
  mustReach?: string[];
};

export type StackSpec = {
  services: Record<string, StackService>;
  publish: { service: string; host: number };
  /** These two services must not share a network. */
  isolate?: [string, string];
};

export type ComposeLine = { text: string } | { slot: string };

export type BuildSlot = { id: string; label: string; indent: number };

export type BuildGoal =
  | { kind: "builds"; label: string }
  | { kind: "runs"; label: string }
  | { kind: "reachable"; port: number; label: string }
  | { kind: "size"; maxMb: number; label: string }
  | { kind: "rebuild"; maxSec: number; label: string }
  | { kind: "persists"; label: string }
  | { kind: "isolated"; label: string };

export type BuildData = {
  kind: BuildKind;
  pieces: BuildPiece[];
  app?: AppSpec;
  slots?: BuildSlot[];
  skeleton?: ComposeLine[];
  fixed?: ComposeFact[];
  stack?: StackSpec;
};

export type BuildLayer = {
  /** The instruction or service, for example `RUN npm ci`. */
  label: string;
  sizeMb: number;
  seconds: number;
  /** True when a rebuild after a code change reuses this layer. */
  cached: boolean;
  failed: boolean;
};

export type BuildReport = {
  kind: BuildKind;
  /** The image (or the compose file) was built. */
  ok: boolean;
  /** Why the build stopped, or null. */
  error: string | null;
  layers: BuildLayer[];
  warnings: string[];
  /** Seconds for a first build. */
  coldSec: number;
  /** Seconds to build again after one source file changed. */
  rebuildSec: number;
  sizeMb: number;
  cacheFriendly: boolean;
  /** The container (or every service) started. */
  started: boolean;
  /** Something answers on `port`. */
  reachable: boolean;
  port: number | null;
  persists: boolean | null;
  isolated: boolean | null;
  runLog: string[];
};

const BASES: Record<string, { sizeMb: number; runtime: "node" | "python" | "none" }> = {
  "node:20": { sizeMb: 1100, runtime: "node" },
  "node:20-slim": { sizeMb: 240, runtime: "node" },
  "node:20-alpine": { sizeMb: 180, runtime: "node" },
  "python:3.12": { sizeMb: 1010, runtime: "python" },
  "python:3.12-slim": { sizeMb: 150, runtime: "python" },
  "ubuntu:22.04": { sizeMb: 77, runtime: "none" },
  "alpine:3.19": { sizeMb: 8, runtime: "none" },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function emptyReport(kind: BuildKind): BuildReport {
  return {
    kind, ok: false, error: null, layers: [], warnings: [], coldSec: 0, rebuildSec: 0, sizeMb: 0, cacheFriendly: false,
    started: false, reachable: false, port: null, persists: null, isolated: null, runLog: [],
  };
}

function normalizeCmd(arg: string): string {
  const t = arg.trim();
  if (t.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map(String).join(" ");
    } catch {
      return t;
    }
  }
  return t.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------------------------
// Dockerfile.

function simulateDockerfile(data: BuildData, steps: string[]): BuildReport {
  const report = emptyReport("dockerfile");
  const app = data.app;
  if (!app) {
    report.error = "This round has no app to build.";
    return report;
  }
  const byId = new Map(data.pieces.map((p) => [p.id, p]));
  const texts: string[] = [];
  for (const id of steps) {
    const piece = byId.get(id);
    if (!piece) {
      report.error = `Unknown piece "${id}".`;
      return report;
    }
    texts.push(piece.text);
  }
  if (texts.length === 0) {
    report.error = "The Dockerfile is empty. Add FROM first.";
    return report;
  }

  let base: { sizeMb: number; runtime: "node" | "python" | "none" } | null = null;
  let workdir = "/";
  let workdirSet = false;
  let manifestDir: string | null = null;
  let sourceDir: string | null = null;
  let installed = false;
  const env: Record<string, string> = {};
  let exposed: number | null = null;
  let cmd: string | null = null;
  let installIdx = -1;
  let sourceIdx = -1;
  let cmdIdx = -1;
  let lastBuildIdx = -1;
  let size = 0;
  let cold = 0;

  const addLayer = (label: string, sizeMb: number, seconds: number, failed = false) => {
    report.layers.push({ label, sizeMb: round1(sizeMb), seconds: round1(seconds), cached: false, failed });
    size += sizeMb;
    cold += seconds;
  };

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    const space = text.indexOf(" ");
    const op = (space < 0 ? text : text.slice(0, space)).toUpperCase();
    const arg = space < 0 ? "" : text.slice(space + 1).trim();
    if (i === 0 && op !== "FROM") {
      addLayer(text, 0, 0, true);
      report.error = "A Dockerfile must start with FROM. Put FROM first.";
      return finishFailed(report, cold, size);
    }
    if (op === "FROM") {
      if (i > 0) {
        addLayer(text, 0, 0, true);
        report.error = "This round uses one FROM only. Take the other FROM out.";
        return finishFailed(report, cold, size);
      }
      base = BASES[arg] ?? null;
      if (!base) {
        addLayer(text, 0, 0, true);
        report.error = `pull access denied for ${arg}: the image does not exist.`;
        return finishFailed(report, cold, size);
      }
      addLayer(text, base.sizeMb, base.sizeMb / 40);
    } else if (op === "WORKDIR") {
      workdir = arg;
      workdirSet = true;
      addLayer(text, 0, 0.1);
    } else if (op === "COPY") {
      const [src] = arg.split(/\s+/);
      if (src !== "." && src !== app.manifest) {
        addLayer(text, 0, 0, true);
        report.error = `COPY failed: "${src ?? ""}" was not found in the build folder.`;
        return finishFailed(report, cold, size);
      }
      if (src === ".") {
        sourceDir = workdir;
        manifestDir = workdir;
        sourceIdx = i;
        addLayer(text, 4, 0.8);
      } else {
        manifestDir = workdir;
        addLayer(text, 0.1, 0.2);
      }
      lastBuildIdx = i;
    } else if (op === "RUN") {
      const cmdText = normalizeCmd(arg);
      const installs = app.runtime === "node" ? ["npm ci", "npm install"] : ["pip install -r requirements.txt", "pip install --no-cache-dir -r requirements.txt"];
      if (installs.includes(cmdText)) {
        if (!base || base.runtime !== app.runtime) {
          addLayer(text, 0, 0.3, true);
          report.error = `/bin/sh: ${app.runtime === "node" ? "npm" : "pip"}: not found. The base image has no ${app.runtime === "node" ? "Node" : "Python"}.`;
          return finishFailed(report, cold, size);
        }
        if (manifestDir !== workdir) {
          addLayer(text, 0, 0.3, true);
          report.error = app.runtime === "node"
            ? "npm error: could not read package.json. Copy the dependency file before this RUN."
            : "ERROR: Could not open requirements file. Copy requirements.txt before this RUN.";
          return finishFailed(report, cold, size);
        }
        installed = true;
        installIdx = i;
        const heavy = app.runtime === "node" ? (cmdText === "npm ci" ? 34 : 46) : 28;
        addLayer(text, app.runtime === "node" ? 95 : 60, heavy);
      } else if (/^(npm start|npm run \w+|node |python )/.test(cmdText)) {
        addLayer(text, 0, 60, true);
        report.error = "The build never finishes: RUN runs while building. Start the app with CMD.";
        return finishFailed(report, cold, size);
      } else {
        addLayer(text, 1, 1);
      }
      lastBuildIdx = i;
    } else if (op === "ENV") {
      const [k, v] = arg.split("=");
      if (k && v !== undefined) env[k] = v.replace(/^"|"$/g, "");
      addLayer(text, 0, 0.1);
    } else if (op === "EXPOSE") {
      const port = Number(arg.split("/")[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        addLayer(text, 0, 0, true);
        report.error = `EXPOSE needs a port number, not "${arg}".`;
        return finishFailed(report, cold, size);
      }
      exposed = port;
      addLayer(text, 0, 0.1);
    } else if (op === "CMD") {
      cmd = normalizeCmd(arg);
      cmdIdx = i;
      addLayer(text, 0, 0.1);
    } else {
      addLayer(text, 0, 0, true);
      report.error = `Unknown instruction ${op}.`;
      return finishFailed(report, cold, size);
    }
  }

  report.ok = true;
  report.coldSec = round1(cold);
  report.sizeMb = Math.round(size);
  const boundary = sourceIdx === -1 ? Number.POSITIVE_INFINITY : sourceIdx;
  let rebuild = 0;
  report.layers.forEach((layer, i) => {
    layer.cached = i < boundary;
    rebuild += layer.cached ? 0.1 : layer.seconds;
  });
  report.rebuildSec = round1(rebuild);
  report.cacheFriendly = installIdx !== -1 && sourceIdx !== -1 && installIdx < sourceIdx;
  if (cmdIdx !== -1 && cmdIdx < lastBuildIdx) report.warnings.push("CMD comes before COPY or RUN. It works, but keep CMD last so the file reads in order.");
  if (!workdirSet) report.warnings.push("There is no WORKDIR, so the files land in the root folder.");

  // Run it.
  const log = report.runLog;
  const listening = env[app.portEnv ?? ""] !== undefined ? Number(env[app.portEnv ?? ""]) : app.defaultPort;
  const entry = app.start[0] ?? "";
  if (cmd === null) {
    log.push("The image has no CMD, so the container has nothing to run and stops at once.");
  } else if (!app.start.includes(cmd)) {
    log.push(`${cmd.split(" ")[0]}: command not found or wrong for this app. Expected something like: ${entry}`);
  } else if (sourceDir === null || sourceDir !== workdir) {
    log.push(app.runtime === "node" ? `Error: Cannot find module '${workdir === "/" ? "" : workdir}/server.js'` : `python: can't open file '${workdir === "/" ? "" : workdir}/app.py': No such file`);
  } else if (!installed) {
    log.push(app.runtime === "node" ? "Error: Cannot find module 'express'. The dependencies were not installed." : "ModuleNotFoundError: No module named 'flask'. The dependencies were not installed.");
  } else {
    report.started = true;
    log.push(`app listening on port ${listening}`);
  }
  if (report.started) {
    report.port = listening;
    report.reachable = exposed !== null && exposed === listening;
    if (exposed === null) log.push("Nothing is published: add EXPOSE with the port the app listens on.");
    else if (!report.reachable) log.push(`The app listens on ${listening} but port ${exposed} is the one published. Connection reset.`);
    else log.push(`localhost:${listening} answers. 200 OK`);
  }
  return report;
}

function finishFailed(report: BuildReport, cold: number, size: number): BuildReport {
  report.coldSec = round1(cold);
  report.sizeMb = Math.round(size);
  return report;
}

// ---------------------------------------------------------------------------------------------
// Compose.

function simulateCompose(data: BuildData, steps: string[]): BuildReport {
  const report = emptyReport("compose");
  const stack = data.stack;
  const slots = data.slots ?? [];
  if (!stack) {
    report.error = "This round has no stack to start.";
    return report;
  }
  const picks = new Map<string, BuildPiece>();
  for (const step of steps) {
    const [slot, id] = step.split(":");
    const piece = data.pieces.find((p) => p.id === id && p.slot === slot);
    if (!slot || !id || !piece) {
      report.error = `Unknown choice "${step}".`;
      return report;
    }
    if (picks.has(slot)) {
      report.error = `The blank "${slot}" was filled twice.`;
      return report;
    }
    picks.set(slot, piece);
  }
  const empty = slots.filter((s) => !picks.has(s.id));
  if (empty.length > 0) {
    report.error = `Fill every blank first (${empty.length} left).`;
    return report;
  }

  const facts: ComposeFact[] = [...(data.fixed ?? [])];
  for (const piece of picks.values()) facts.push(...(piece.facts ?? []));
  const declaredVolumes = new Set(facts.filter((f) => f.key === "decl-volume").map((f) => f.value));
  const declaredNetworks = new Set(facts.filter((f) => f.key === "decl-network").map((f) => f.value));
  const names = Object.keys(stack.services);
  const of = (service: string, key: ComposeFact["key"]) => facts.filter((f) => f.service === service && f.key === key).map((f) => f.value);

  for (const name of names) {
    for (const v of of(name, "volume")) {
      const src = v.split(":")[0]!;
      if (!src.startsWith(".") && !src.startsWith("/") && !declaredVolumes.has(src)) {
        report.error = `service "${name}" refers to undefined volume ${src}: invalid compose project`;
        return report;
      }
    }
    for (const n of of(name, "network")) {
      if (!declaredNetworks.has(n)) {
        report.error = `service "${name}" refers to undefined network ${n}: invalid compose project`;
        return report;
      }
    }
    for (const d of of(name, "depends")) {
      if (!names.includes(d)) {
        report.error = `service "${name}" depends on undefined service "${d}": invalid compose project`;
        return report;
      }
    }
  }
  report.ok = true;

  // Start order: dependencies first.
  const order: string[] = [];
  const visit = (name: string, depth: number) => {
    if (order.includes(name) || depth > 8) return;
    for (const d of of(name, "depends")) visit(d, depth + 1);
    order.push(name);
  };
  names.forEach((n) => visit(n, 0));

  const networksOf = (name: string) => {
    const list = of(name, "network");
    return list.length ? list : ["default"];
  };
  const shares = (a: string, b: string) => networksOf(a).some((n) => networksOf(b).includes(n));
  const status = new Map<string, boolean>();
  let size = 0;
  let cold = 0;
  for (const name of order) {
    const svc = stack.services[name]!;
    const seconds = round1(svc.sizeMb / 40);
    report.layers.push({ label: `${name}: pull ${svc.image}`, sizeMb: svc.sizeMb, seconds, cached: false, failed: false });
    size += svc.sizeMb;
    cold += seconds;
    const env = new Map(of(name, "env").map((e) => [e.split("=")[0]!, e.slice(e.indexOf("=") + 1)]));
    let crash: string | null = null;
    for (const key of svc.requiredEnv ?? []) if (!env.get(key)) crash ??= `${key} is not set. The container exited with code 1.`;
    for (const d of svc.mustDependOn ?? []) if (!of(name, "depends").includes(d)) crash ??= `started before ${d} was ready: connect ECONNREFUSED. Add depends_on: [${d}].`;
    if (svc.hostEnv && env.get(svc.hostEnv.key) !== svc.hostEnv.value) {
      const got = env.get(svc.hostEnv.key);
      crash ??= got === "localhost" || got === undefined ? `connect ECONNREFUSED 127.0.0.1: "${got ?? "(unset)"}" is the container itself. Use the service name ${svc.hostEnv.value}.` : `getaddrinfo ENOTFOUND ${got}`;
    }
    for (const target of svc.mustReach ?? []) {
      if (!shares(name, target)) crash ??= `getaddrinfo ENOTFOUND ${target}: ${name} and ${target} share no network.`;
      else if (status.get(target) === false) crash ??= `connect ECONNREFUSED ${target}: ${target} is not running.`;
    }
    status.set(name, crash === null);
    report.runLog.push(crash === null ? `${name}  | started` : `${name}  | ${crash}`);
    if (crash) report.layers[report.layers.length - 1]!.failed = true;
  }
  report.coldSec = round1(cold);
  report.rebuildSec = round1(cold);
  report.sizeMb = Math.round(size);
  report.cacheFriendly = true;
  report.started = order.every((n) => status.get(n) === true);

  const pub = stack.publish;
  const pubSvc = stack.services[pub.service];
  const mapped = of(pub.service, "port").some((p) => {
    const [h, c] = p.split(":");
    return Number(h) === pub.host && Number(c) === pubSvc?.port;
  });
  report.port = pub.host;
  report.reachable = status.get(pub.service) === true && mapped;
  if (status.get(pub.service) === true && !mapped) report.runLog.push(`localhost:${pub.host} does not answer: the published port does not lead to port ${pubSvc?.port ?? "?"} inside ${pub.service}.`);
  else if (report.reachable) report.runLog.push(`localhost:${pub.host} answers. 200 OK`);

  const dataServices = names.filter((n) => stack.services[n]!.dataPath);
  if (dataServices.length > 0) {
    report.persists = dataServices.every((n) => of(n, "volume").some((v) => v.split(":")[1] === stack.services[n]!.dataPath));
    if (!report.persists) report.warnings.push("The database data is not on a volume, so it is lost when the container is removed.");
  }
  if (stack.isolate) report.isolated = !shares(stack.isolate[0], stack.isolate[1]);
  if (report.isolated === false) report.warnings.push(`${stack.isolate![0]} can reach ${stack.isolate![1]} directly. Keep them on different networks.`);
  return report;
}

export function simulateBuild(data: BuildData, steps: string[]): BuildReport {
  try {
    return data.kind === "compose" ? simulateCompose(data, steps) : simulateDockerfile(data, steps);
  } catch {
    const report = emptyReport(data.kind);
    report.error = "The build could not be read.";
    return report;
  }
}

export function checkBuildGoal(report: BuildReport, goal: BuildGoal): boolean {
  switch (goal.kind) {
    case "builds": return report.ok;
    case "runs": return report.ok && report.started;
    case "reachable": return report.started && report.reachable && report.port === goal.port;
    case "size": return report.ok && report.sizeMb <= goal.maxMb;
    case "rebuild": return report.ok && report.rebuildSec <= goal.maxSec;
    case "persists": return report.persists === true;
    case "isolated": return report.isolated === true;
  }
}
