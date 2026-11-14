import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import type { Prisma } from "../../src/generated/prisma/index.js";
import { createSession } from "../../src/services/auth/session.js";
import { importShellLabs, shellLabsVersion, type ShellLabInput } from "../../src/services/shell-labs.service.js";
import { readShellLabSource } from "../../scripts/shell-labs-source.js";

// The real labs come from the private content checkout. Without it these tests skip.
const CORE_ROOT = process.env.BUILDMENT_CONTENT_ROOT ?? "/home/aqib/projects/Edorax/Buildment-core-labs";
const CORE_DIR = path.join(CORE_ROOT, "labs", "shell");
const hasCore = fs.existsSync(path.join(CORE_DIR, "index.yaml"));

const app = createApp();
const temporary: string[] = [];
let snapshot: Awaited<ReturnType<typeof prisma.shellLab.findMany>> = [];
let userId = "";
let auth: Record<string, string> = {};

// The table may already hold published labs (a developer database). Keep them aside
// while the tests run and put every row back afterwards.
beforeAll(async () => {
  snapshot = await prisma.shellLab.findMany();
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { email: `shell-labs-${tag}@test.local`, name: "Shell Labs Tester", role: "MENTEE", emailVerified: new Date() } });
  userId = user.id;
  auth = { Authorization: `Bearer ${(await createSession(user.id)).sessionToken}` };
});

afterAll(async () => {
  await prisma.$transaction([
    prisma.shellLab.deleteMany(),
    prisma.shellLab.createMany({ data: snapshot.map((row) => ({ ...row, data: row.data as Prisma.InputJsonValue })) }),
  ]);
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  for (const dir of temporary) fs.rmSync(dir, { recursive: true, force: true });
});

function coreLabs() {
  const read = readShellLabSource(CORE_DIR);
  expect(read.problems).toEqual([]);
  return read.labs;
}

/** A writable copy of the Core labs to change. */
function copyCore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shell-labs-api-"));
  temporary.push(root);
  const dir = path.join(root, "labs", "shell");
  fs.cpSync(CORE_DIR, dir, { recursive: true });
  return { root, dir };
}

const rows = () => prisma.shellLab.findMany({ orderBy: { position: "asc" } });
const hashes = async () => Object.fromEntries((await rows()).map((row) => [row.slug, row.contentHash]));

describe("/api/v1/shell-labs without labs", () => {
  it("needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/shell-labs")).status).toBe(401);
    expect((await request(app).get("/api/v1/shell-labs/version")).status).toBe(401);
  });

  it("answers with an empty version and no labs when nothing is imported", async () => {
    await prisma.shellLab.deleteMany();
    const version = await request(app).get("/api/v1/shell-labs/version").set(auth);
    expect(version.status).toBe(200);
    expect(version.body).toEqual({ success: true, data: { version: "", count: 0 } });
    const list = await request(app).get("/api/v1/shell-labs").set(auth);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ success: true, data: { version: "", labs: [] } });
    expect(await shellLabsVersion()).toBe("");
  });
});

describe.skipIf(!hasCore)("shell labs imported from the Core checkout", () => {
  beforeAll(async () => {
    await prisma.shellLab.deleteMany();
  });

  it("imports every listed lab and counts them as added", async () => {
    const labs = coreLabs();
    expect(labs.length).toBeGreaterThanOrEqual(46);
    const result = await importShellLabs(labs);
    expect(result).toMatchObject({ added: labs.length, updated: 0, unchanged: 0, deactivated: 0 });
    expect(result.version).toMatch(/^[0-9a-f]{64}$/);
    const stored = await rows();
    expect(stored).toHaveLength(labs.length);
    expect(stored.map((row) => row.slug)).toEqual(labs.map((lab) => lab.slug));
    expect(stored.map((row) => row.position)).toEqual(labs.map((_, index) => index));
    expect(stored.every((row) => row.active)).toBe(true);
  });

  it("re-importing changes nothing and keeps the version", async () => {
    const before = await rows();
    const version = await shellLabsVersion();
    const result = await importShellLabs(coreLabs());
    expect(result).toMatchObject({ added: 0, updated: 0, unchanged: before.length, deactivated: 0, version });
    expect(await shellLabsVersion()).toBe(version);
    const after = await rows();
    expect(after.map((row) => row.updatedAt.getTime())).toEqual(before.map((row) => row.updatedAt.getTime()));
  });

  it("a dry run reports changes and writes nothing", async () => {
    const labs = coreLabs();
    const before = await hashes();
    const changed = labs.map((lab, index) => (index === 0 ? { ...lab, title: "Changed in a dry run" } : lab));
    const result = await importShellLabs(changed.slice(0, 10), { dryRun: true });
    expect(result).toMatchObject({ updated: 1, unchanged: 9, deactivated: labs.length - 10 });
    expect(await hashes()).toEqual(before);
    expect((await rows()).every((row) => row.active)).toBe(true);
  });

  it("a changed lab changes only its own hash and the version", async () => {
    const before = await hashes();
    const versionBefore = await shellLabsVersion();
    const { dir } = copyCore();
    const file = path.join(dir, "linux-cron.yaml");
    const lab = loadYaml(fs.readFileSync(file, "utf8")) as { title: string };
    lab.title = `${lab.title} (edited)`;
    fs.writeFileSync(file, dumpYaml(lab));

    const read = readShellLabSource(dir);
    expect(read.problems).toEqual([]);
    const result = await importShellLabs(read.labs);
    expect(result).toMatchObject({ added: 0, updated: 1, unchanged: Object.keys(before).length - 1, deactivated: 0 });
    const after = await hashes();
    const differing = Object.keys(after).filter((slug) => after[slug] !== before[slug]);
    expect(differing).toEqual(["linux-cron"]);
    expect(await shellLabsVersion()).not.toBe(versionBefore);
    expect((await prisma.shellLab.findUniqueOrThrow({ where: { slug: "linux-cron" } })).title).toBe(lab.title);

    // Back to the Core text: the hash and the version return to what they were.
    await importShellLabs(coreLabs());
    expect(await hashes()).toEqual(before);
    expect(await shellLabsVersion()).toBe(versionBefore);
  });

  it("a lab removed from index.yaml becomes inactive and leaves the API", async () => {
    const { dir } = copyCore();
    const index = loadYaml(fs.readFileSync(path.join(dir, "index.yaml"), "utf8")) as { labs: string[] };
    const total = index.labs.length;
    const removed = index.labs[3]!;
    index.labs = index.labs.filter((slug) => slug !== removed);
    fs.writeFileSync(path.join(dir, "index.yaml"), dumpYaml(index));
    fs.rmSync(path.join(dir, `${removed}.yaml`));

    const read = readShellLabSource(dir);
    expect(read.problems).toEqual([]);
    const result = await importShellLabs(read.labs);
    expect(result.deactivated).toBe(1);

    const row = await prisma.shellLab.findUniqueOrThrow({ where: { slug: removed } });
    expect(row.active).toBe(false);
    expect(await prisma.shellLab.count()).toBe(total);

    const list = await request(app).get("/api/v1/shell-labs").set(auth);
    expect(list.body.data.labs).toHaveLength(total - 1);
    expect(list.body.data.labs.map((lab: { slug: string }) => lab.slug)).not.toContain(removed);
    const version = await request(app).get("/api/v1/shell-labs/version").set(auth);
    expect(version.body.data).toEqual({ version: result.version, count: total - 1 });

    // Listed again, the lab comes back as an update (same hash, active again).
    const back = await importShellLabs(coreLabs());
    expect(back).toMatchObject({ updated: expect.any(Number), added: 0, deactivated: 0 });
    expect((await prisma.shellLab.findUniqueOrThrow({ where: { slug: removed } })).active).toBe(true);
  });

  it("an invalid lab stops the publish script with a named error and changes nothing", async () => {
    const before = await rows();
    const { root, dir } = copyCore();
    const file = path.join(dir, "linux-dns.yaml");
    const lab = loadYaml(fs.readFileSync(file, "utf8")) as { steps: { id: string; hints: string[] }[] };
    lab.steps[1]!.hints = lab.steps[1]!.hints.slice(0, 2);
    const stepId = lab.steps[1]!.id;
    fs.writeFileSync(file, dumpYaml(lab));
    // A valid change in another lab must not slip through either.
    const other = path.join(dir, "linux-cron.yaml");
    const cron = loadYaml(fs.readFileSync(other, "utf8")) as { title: string };
    cron.title = "Should not be published";
    fs.writeFileSync(other, dumpYaml(cron));

    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/shell-labs-publish.ts", "--publish", "--root", root], {
      cwd: path.resolve(import.meta.dirname, "../.."), env: process.env, encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`linux-dns, step "${stepId}" hints: needs exactly three hints`);
    const after = await rows();
    expect(after).toEqual(before);
  }, 60_000);

  it("a failed write rolls the whole import back", async () => {
    const before = await rows();
    const labs = coreLabs().map((lab) => ({ ...lab }));
    labs[0]!.title = "Written first, must roll back";
    labs[labs.length - 1]!.minutes = 99_999_999_999; // does not fit a 32-bit integer
    await expect(importShellLabs(labs as ShellLabInput[])).rejects.toThrow();
    expect(await rows()).toEqual(before);
    await expect(importShellLabs([labs[0]!, labs[0]!])).rejects.toThrow(/appears twice/);
    expect(await rows()).toEqual(before);
  });

  it("returns the contract on both endpoints and keeps each lab as authored", async () => {
    const labs = coreLabs();
    const version = await shellLabsVersion();

    const summary = await request(app).get("/api/v1/shell-labs/version").set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({ success: true, data: { version, count: labs.length } });

    const list = await request(app).get("/api/v1/shell-labs").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(Object.keys(list.body.data).sort()).toEqual(["labs", "version"]);
    expect(list.body.data.version).toBe(version);
    expect(list.body.data.labs).toHaveLength(labs.length);
    // Same order, and every key (checks, solutions, unknown ones) is present.
    expect(list.body.data.labs).toEqual(JSON.parse(JSON.stringify(labs)));
  });

  it("quiz steps keep their quiz and have no checks", async () => {
    const list = await request(app).get("/api/v1/shell-labs").set(auth);
    const steps = (list.body.data.labs as { steps: Record<string, unknown>[] }[]).flatMap((lab) => lab.steps);
    const quizzes = steps.filter((step) => step.quiz);
    expect(quizzes.length).toBeGreaterThan(0);
    for (const step of quizzes) {
      expect(step.quiz).toMatchObject({ question: expect.any(String), why: expect.any(String), options: expect.any(Array) });
      expect(step.checks ?? []).toHaveLength(0);
      expect(step.solution).toBeUndefined();
    }
    const tasks = steps.filter((step) => !step.quiz);
    expect(tasks.every((step) => Array.isArray(step.checks) && (step.checks as unknown[]).length > 0)).toBe(true);
  });
});
