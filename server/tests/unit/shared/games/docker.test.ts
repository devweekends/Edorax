import { describe, expect, it } from "vitest";
import { dockerEngine, parseSubmission, roundsFor, verify, type BuildRound, type DockerRound, type DockerSubmission, type FixRound } from "../../../../src/shared/games/docker/engine.js";
import { POOL } from "../../../../src/shared/games/docker/scenarios.js";
import { simulateBuild } from "../../../../src/shared/games/docker/builder.js";
import { cloneWorld, runLine, type DockerWorld } from "../../../../src/shared/games/docker/daemon.js";
import { engineFor } from "../../../../src/shared/games/index.js";

const fixes = POOL.filter((r): r is FixRound => r.mode === "fix");
const builds = POOL.filter((r): r is BuildRound => r.mode === "build");
const byId = (id: string) => POOL.find((r) => r.id === id)!;
const fixSub = (commands: string[], hints = 0): DockerSubmission => ({ mode: "fix", commands, hints });
const buildSub = (steps: string[], hints = 0): DockerSubmission => ({ mode: "build", steps, hints });
const solutionOf = (r: DockerRound, hints = 0): DockerSubmission => (r.mode === "fix" ? fixSub(r.solution, hints) : buildSub(r.solution, hints));

function play(round: FixRound, lines: string[]): { world: DockerWorld; out: string[] } {
  const world = cloneWorld(round.world);
  const out: string[] = [];
  for (const line of lines) out.push(...runLine(world, line).lines.map((l) => l.text));
  return { world, out };
}

describe("docker pool", () => {
  it("has at least four scenarios per difficulty and both modes", () => {
    for (const d of ["easy", "medium", "hard"] as const) expect(POOL.filter((r) => r.difficulty === d).length).toBeGreaterThanOrEqual(4);
    expect(fixes.length).toBeGreaterThan(0);
    expect(builds.length).toBeGreaterThan(0);
    for (const d of ["easy", "medium", "hard"] as const) {
      expect(POOL.some((r) => r.difficulty === d && r.mode === "fix")).toBe(true);
      expect(POOL.some((r) => r.difficulty === d && r.mode === "build")).toBe(true);
    }
  });

  it("has unique ids, three hints each and no dashes in the text", () => {
    expect(new Set(POOL.map((r) => r.id)).size).toBe(POOL.length);
    for (const r of POOL) {
      expect(r.hints).toHaveLength(3);
      const text = JSON.stringify([r.title, r.brief, r.hints, r.goals.map((g) => g.label)]);
      expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`));
    }
  });

  it("is plain JSON, so a round can travel to the browser", () => {
    for (const r of POOL) expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("solves every scenario with its stated solution, with three stars", () => {
    for (const r of POOL) {
      const result = verify(r, solutionOf(r));
      expect(result.passed, `${r.id}: ${result.message}`).toBe(true);
      expect(result.stars, r.id).toBe(3);
    }
  });

  it("gives fewer stars when hints are used", () => {
    for (const r of POOL) {
      expect(verify(r, solutionOf(r, 1)).stars, r.id).toBe(2);
      expect(verify(r, solutionOf(r, 3)).stars, r.id).toBe(1);
    }
  });

  it("does not pass empty or unrelated submissions", () => {
    for (const r of POOL) {
      const empty = r.mode === "fix" ? fixSub([]) : buildSub([]);
      expect(verify(r, empty).passed, r.id).toBe(false);
      const wrong = r.mode === "fix" ? fixSub(["docker ps", "docker images"]) : buildSub([r.pieces[0]!.id]);
      expect(verify(r, wrong).passed, r.id).toBe(false);
      expect(verify(r, wrong).stars).toBe(0);
    }
  });

  it("starts every fix scenario broken, with at least one goal unmet", () => {
    for (const r of fixes) expect(verify(r, fixSub(["docker ps"])).passed, r.id).toBe(false);
  });

  it("gives one star for a slow fix and two for a medium one", () => {
    const r = byId("docker-start-stopped") as FixRound;
    const slow = verify(r, fixSub(["docker ps", "docker ps -a", "docker images", "docker network ls", "docker volume ls", "docker ps -a", "docker start web"]));
    expect(slow.passed).toBe(true);
    expect(slow.stars).toBe(1);
    const medium = verify(r, fixSub(["docker ps", "docker ps -a", "docker images", "docker start web"]));
    expect(medium.stars).toBe(2);
  });
});

describe("daily rounds", () => {
  it("always has one round per difficulty with at least one fix and one build round", () => {
    for (let day = 0; day < 120; day++) {
      const key = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const rounds = roundsFor(key);
      expect(rounds.map((r) => r.difficulty)).toEqual(["easy", "medium", "hard"]);
      const modes = rounds.map((r) => r.mode);
      expect(modes, key).toContain("fix");
      expect(modes, key).toContain("build");
    }
  });

  it("is deterministic and varies by day", () => {
    expect(roundsFor("2026-11-18").map((r) => r.id)).toEqual(roundsFor("2026-11-18").map((r) => r.id));
    const seen = new Set<string>();
    for (let day = 0; day < 30; day++) roundsFor(new Date(Date.UTC(2026, 10, 1 + day)).toISOString().slice(0, 10)).forEach((r) => seen.add(r.id));
    expect(seen.size).toBeGreaterThanOrEqual(12);
    const today = roundsFor("2026-11-18").map((r) => r.id).join();
    const other = Array.from({ length: 5 }, (_, i) => roundsFor(`2026-11-${19 + i}`).map((r) => r.id).join());
    expect(other.some((o) => o !== today)).toBe(true);
  });

  it("is registered as the docker engine", () => {
    expect(engineFor("docker").id).toBe("docker");
    expect(dockerEngine.roundsFor("2026-11-18")).toHaveLength(3);
  });
});

describe("parseSubmission", () => {
  it("accepts good fix and build submissions", () => {
    expect(parseSubmission({ mode: "fix", commands: ["docker ps"], hints: 0 })).toEqual({ mode: "fix", commands: ["docker ps"], hints: 0 });
    expect(parseSubmission({ mode: "build", steps: ["from", "web-port:wp-ok"], hints: 2 })).toEqual({ mode: "build", steps: ["from", "web-port:wp-ok"], hints: 2 });
  });

  it("rejects junk", () => {
    const junk: unknown[] = [
      null, undefined, 5, "fix", [], {}, { mode: "fix" }, { mode: "fix", commands: "docker ps", hints: 0 },
      { mode: "fix", commands: [1], hints: 0 }, { mode: "fix", commands: [""], hints: 0 }, { mode: "fix", commands: ["  "], hints: 0 },
      { mode: "fix", commands: ["x".repeat(301)], hints: 0 }, { mode: "fix", commands: Array(101).fill("docker ps"), hints: 0 },
      { mode: "fix", commands: ["docker ps"], hints: -1 }, { mode: "fix", commands: ["docker ps"], hints: 1.5 }, { mode: "fix", commands: ["docker ps"], hints: "0" },
      { mode: "fix", commands: ["docker ps"], hints: 0, extra: true }, { mode: "fix", commands: ["a\u0000b"], hints: 0 },
      { mode: "build", steps: ["has space"], hints: 0 }, { mode: "build", steps: [1], hints: 0 }, { mode: "build", steps: Array(41).fill("a"), hints: 0 },
      { mode: "build", commands: ["a"], hints: 0 }, { mode: "other", steps: [], hints: 0 }, { done: true },
    ];
    for (const j of junk) expect(parseSubmission(j), JSON.stringify(j)).toBeNull();
  });

  it("fails verify when the mode does not match the round", () => {
    const fix = byId("docker-start-stopped");
    const build = byId("docker-build-node-order") as BuildRound;
    expect(verify(fix, buildSub(["from"])).passed).toBe(false);
    expect(verify(build, fixSub(["docker ps"])).passed).toBe(false);
    expect(verify(fix, buildSub(["from"])).message).toMatch(/fix round/);
    expect(verify(build, fixSub(["docker ps"])).message).toMatch(/build round/);
  });

  it("never throws on odd input", () => {
    const rounds: unknown[] = [null, undefined, 3, "x", {}, { id: 4 }, { mode: "fix" }, { mode: "build", pieces: 5 }, { mode: "fix", world: null, goals: null }, ...POOL];
    const subs: unknown[] = [null, 1, "a", [], {}, { mode: "fix", commands: [null], hints: 0 }, { mode: "build", steps: [{}], hints: 0 }, fixSub(["docker run"]), fixSub(["$(", "'"]), buildSub(["nope"])];
    for (const r of rounds) for (const s of subs) {
      expect(() => verify(r as DockerRound, s as DockerSubmission)).not.toThrow();
      expect(verify(r as DockerRound, s as DockerSubmission).passed).toBe(false);
    }
  });

  it("returns one short sentence message", () => {
    for (const r of POOL) {
      const m = verify(r, solutionOf(r)).message;
      expect(m.length).toBeGreaterThan(5);
      expect(m).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}!]`));
    }
  });
});

describe("virtual docker daemon", () => {
  it("shows a table for docker ps and hides stopped containers without -a", () => {
    const r = byId("docker-start-stopped") as FixRound;
    const a = play(r, ["docker ps"]).out;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatch(/^CONTAINER ID\s+IMAGE\s+STATUS\s+PORTS\s+NAMES$/);
    const b = play(r, ["docker ps -a"]).out;
    expect(b).toHaveLength(2);
    expect(b[1]).toMatch(/Exited \(0\)/);
  });

  it("explains a container that exits because of a missing variable", () => {
    const r = byId("docker-missing-env") as FixRound;
    expect(play(r, ["docker logs db"]).out.join("\n")).toContain("POSTGRES_PASSWORD");
    const again = play(r, ["docker rm db", "docker run -d --name db postgres:16", "docker ps -a", "docker logs --tail 1 db"]);
    expect(again.world.containers[0]!.status).toBe("exited");
    expect(again.out.join("\n")).toContain("Exited (1)");
  });

  it("reports a name conflict and a port conflict like Docker", () => {
    const r = byId("docker-port-taken") as FixRound;
    const first = play(r, ["docker run -d --name web -p 8080:80 nginx:1.25"]);
    expect(first.out.join("\n")).toContain("port is already allocated");
    expect(first.world.containers.find((c) => c.name === "web")!.status).toBe("created");
    const second = play(r, ["docker run -d --name old-site nginx:1.25"]);
    expect(second.out.join("\n")).toContain("is already in use by container");
  });

  it("curl shows connection errors and then the page", () => {
    const r = byId("docker-wrong-port") as FixRound;
    expect(play(r, ["curl localhost:8080"]).out.join("\n")).toContain("(56)");
    expect(play(r, ["curl localhost:9999"]).out.join("\n")).toContain("(7) Failed to connect");
    const ok = play(r, ["docker rm -f web", "docker run -d --name web -p 8080:80 nginx:1.25", "curl http://localhost:8080/"]);
    expect(ok.out.join("\n")).toContain("Welcome to nginx");
  });

  it("starts containers on a user network and resolves names with exec", () => {
    const r = byId("docker-no-network") as FixRound;
    const before = play(r, ["docker start web", "docker ps -a"]);
    expect(before.world.containers.find((c) => c.name === "web")!.status).toBe("exited");
    const fixed = play(r, ["docker network create appnet", "docker network connect appnet db", "docker network connect appnet web", "docker start web", "docker exec web ping -c 1 db", "docker exec web curl db:5432"]);
    expect(fixed.out.join("\n")).toContain("PING db");
    expect(fixed.world.containers.find((c) => c.name === "web")!.status).toBe("running");
    expect(play(r, ["docker exec web ping db"]).out.join("\n")).toMatch(/not running/);
  });

  it("restarts a crashing container on its policy and shows OOM in inspect", () => {
    const r = byId("docker-oom-loop") as FixRound;
    const info = play(r, ["docker inspect -f '{{.State.OOMKilled}} {{.State.ExitCode}}' worker", "docker ps", "docker stats --no-stream"]);
    expect(info.out[0]).toBe("true 137");
    expect(info.out.join("\n")).toContain("Restarting (137)");
    const loop = play(r, ["docker run -d --name w2 --restart always --memory 128m acme/worker:3.1", "docker ps -a"]);
    expect(loop.world.containers.find((c) => c.name === "w2")!.status).toBe("restarting");
  });

  it("heals a restarting container once its cause is fixed", () => {
    const r = byId("docker-no-network") as FixRound;
    const world = cloneWorld(r.world);
    world.containers.find((c) => c.name === "web")!.restart = "always";
    runLine(world, "docker start web");
    expect(world.containers.find((c) => c.name === "web")!.status).toBe("restarting");
    runLine(world, "docker network create n1 && docker network connect n1 db && docker network connect n1 web");
    expect(world.containers.find((c) => c.name === "web")!.status).toBe("running");
  });

  it("supports && and $( ) and prune with a safe default", () => {
    const r = byId("docker-disk-full") as FixRound;
    expect(play(r, ["docker rm $(docker ps -aq -f status=exited)"]).world.containers.filter((c) => c.status === "exited")).toHaveLength(0);
    expect(play(r, ["docker system prune"]).out.join("\n")).toContain("[y/N]");
    expect(verify(r, fixSub(["docker container prune -f", "docker image prune -f"])).passed).toBe(true);
    expect(verify(r, fixSub(["docker system prune -af --volumes"])).passed).toBe(false);
    expect(verify(r, fixSub(["docker system prune -a -f"])).passed).toBe(false);
  });

  it("only runs compose where the scenario has a file", () => {
    expect(play(byId("docker-wrong-port") as FixRound, ["docker compose up -d"]).out.join("\n")).toContain("no configuration file");
    const r = byId("docker-compose-conflict") as FixRound;
    const once = play(r, ["cat docker-compose.yml", "docker compose up -d"]);
    expect(once.out.join("\n")).toContain("services:");
    expect(once.out.join("\n")).toContain("port is already allocated");
    expect(once.world.containers.find((c) => c.name === "shop-db-1")!.status).toBe("running");
  });

  it("is strict about flags and arguments", () => {
    const r = byId("docker-start-stopped") as FixRound;
    const o = (line: string) => play(r, [line]).out.join("\n");
    expect(o("docker run")).toContain('requires at least 1 argument');
    expect(o("docker run --bogus nginx")).toContain("unknown flag: --bogus");
    expect(o("docker run -x nginx")).toContain("unknown shorthand flag");
    expect(o("docker run -p 99999:80 nginx")).toContain("invalid");
    expect(o("docker run -d --name x --network nope nginx:1.25")).toContain("network nope not found");
    expect(o("docker run -d nginx:latst")).toContain("manifest for nginx:latst not found");
    expect(o("docker run -d nosuchrepo")).toContain("pull access denied");
    expect(o("docker stop ghost")).toContain("No such container: ghost");
    expect(o("docker rm web nope")).toContain("No such container: nope");
    expect(o("docker frobnicate")).toContain("is not a docker command");
    expect(o("docker ps 'unterminated")).toContain("unexpected EOF");
    expect(o("docker exec web env")).toContain("is not running");
    expect(o("rm -rf /")).toContain("command not found");
    expect(o("docker run -d -m 1m nginx")).toContain("Minimum memory");
    expect(o("x".repeat(400))).toContain("too long");
  });

  it("is deterministic", () => {
    const r = byId("docker-no-network") as FixRound;
    const lines = ["docker ps -a", "docker network create a", "docker run -d --name z nginx:1.25", "docker images"];
    expect(play(r, lines).out).toEqual(play(r, lines).out);
    const w = cloneWorld(r.world);
    runLine(w, "docker run -d --name z nginx:1.25");
    expect(r.world.containers.some((c) => c.name === "z")).toBe(false);
  });
});

describe("build simulation", () => {
  const node = byId("docker-build-node-order") as BuildRound;
  const slim = byId("docker-build-slim") as BuildRound;
  const portEnv = byId("docker-build-port-env") as BuildRound;
  const basic = byId("docker-build-compose-basic") as BuildRound;
  const tiers = byId("docker-build-compose-tiers") as BuildRound;

  it("builds fast when the dependencies are installed before the code is copied", () => {
    const good = simulateBuild(node, node.solution);
    expect(good.ok && good.started && good.reachable).toBe(true);
    expect(good.cacheFriendly).toBe(true);
    expect(good.rebuildSec).toBeLessThan(3);
    const bad = simulateBuild(node, ["from", "workdir", "cp-src", "npm-ci", "expose", "cmd"]);
    expect(bad.ok).toBe(true);
    expect(bad.cacheFriendly).toBe(false);
    expect(bad.rebuildSec).toBeGreaterThan(30);
    expect(verify(node, buildSub(["from", "workdir", "cp-pkg", "cp-src", "npm-ci", "expose", "cmd"])).passed).toBe(false);
  });

  it("reports the build problems a real Dockerfile has", () => {
    expect(simulateBuild(node, ["workdir", "from"]).error).toMatch(/start with FROM/);
    expect(simulateBuild(node, []).error).toMatch(/empty/);
    expect(simulateBuild(node, ["from", "workdir", "npm-ci"]).error).toMatch(/package\.json/);
    expect(simulateBuild(slim, ["from-ubuntu", "workdir", "cp-req", "pip"]).error).toMatch(/not found/);
    expect(simulateBuild(slim, ["from-slim", "from-full"]).error).toMatch(/one FROM/);
    expect(simulateBuild(node, ["nope"]).error).toMatch(/Unknown piece/);
    const noCmd = simulateBuild(node, ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose"]);
    expect(noCmd.ok).toBe(true);
    expect(noCmd.started).toBe(false);
    const cmdFirst = simulateBuild(node, ["from", "cmd", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose"]);
    expect(cmdFirst.warnings.join()).toMatch(/CMD/);
    expect(verify(node, buildSub(["from", "cmd", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose"])).stars).toBe(1);
    const copyBeforeWorkdir = simulateBuild(node, ["from", "cp-pkg", "workdir", "npm-ci"]);
    expect(copyBeforeWorkdir.error).toMatch(/package\.json/);
  });

  it("needs the right base image and port", () => {
    const full = simulateBuild(slim, ["from-full", "workdir", "cp-req", "pip", "cp-src", "expose", "cmd"]);
    expect(full.sizeMb).toBeGreaterThan(1000);
    expect(verify(slim, buildSub(["from-full", "workdir", "cp-req", "pip", "cp-src", "expose", "cmd"])).passed).toBe(false);
    const wrongPort = simulateBuild(portEnv, ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "env-3000", "expose-8080", "cmd-node"]);
    expect(wrongPort.started).toBe(true);
    expect(wrongPort.reachable).toBe(false);
    expect(simulateBuild(portEnv, ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose-3000", "cmd-node"]).reachable).toBe(true);
    expect(verify(portEnv, buildSub(["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose-3000", "cmd-node"])).passed).toBe(false);
    expect(simulateBuild(portEnv, ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "env-8080", "expose-8080", "cmd-dev"]).started).toBe(false);
  });

  it("checks a compose file", () => {
    const solved = simulateBuild(basic, basic.solution);
    expect(solved.started && solved.reachable && solved.persists).toBe(true);
    const swap = (slot: string, pick: string) => basic.solution.map((s) => (s.startsWith(slot + ":") ? `${slot}:${pick}` : s));
    expect(simulateBuild(basic, swap("web-port", "wp-same")).reachable).toBe(false);
    expect(simulateBuild(basic, swap("web-env", "we-localhost")).started).toBe(false);
    expect(simulateBuild(basic, swap("web-dep", "wd-restart")).started).toBe(false);
    expect(simulateBuild(basic, swap("web-dep", "wd-cache")).error).toMatch(/undefined service/);
    expect(simulateBuild(basic, swap("db-env", "de-empty")).started).toBe(false);
    expect(simulateBuild(basic, swap("top-vol", "tv-none")).error).toMatch(/undefined volume/);
    expect(simulateBuild(basic, swap("db-vol", "dv-bind")).persists).toBe(false);
    expect(simulateBuild(basic, basic.solution.slice(1)).error).toMatch(/Fill every blank/);
    expect(simulateBuild(basic, [...basic.solution, "web-port:wp-ok"]).error).toMatch(/twice/);
    expect(simulateBuild(basic, ["web-port:zzz"]).error).toMatch(/Unknown choice/);
  });

  it("keeps the three tier networks apart", () => {
    expect(simulateBuild(tiers, tiers.solution).isolated).toBe(true);
    const swap = (slot: string, pick: string) => tiers.solution.map((s) => (s.startsWith(slot + ":") ? `${slot}:${pick}` : s));
    expect(simulateBuild(tiers, swap("web-net", "wn-both")).isolated).toBe(false);
    expect(verify(tiers, buildSub(swap("web-net", "wn-both"))).passed).toBe(false);
    expect(simulateBuild(tiers, swap("api-net", "an-front")).started).toBe(false);
    expect(simulateBuild(tiers, swap("top-net", "tn-front")).error).toMatch(/undefined network/);
  });
});
