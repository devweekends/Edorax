import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { dump as dumpYaml } from "js-yaml";
import { readShellLabSource, shellLabsDirForRoot, validateShellLab } from "../../scripts/shell-labs-source.js";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

const taskStep = () => ({
  id: "make-file",
  goal: "Create the file.",
  body: "1. Run `touch a`.",
  hints: ["nudge", "hint", "example"],
  checks: [{ id: "exists", label: "a exists", run: "test -f a", fail: "a is missing" }],
  solution: "touch a",
});
const quizStep = () => ({
  id: "read-output",
  goal: "Pick the answer.",
  body: "1. Read.",
  hints: ["nudge", "hint", "example"],
  quiz: { question: "What?", options: ["A", "B"], answer: 1, why: "Because." },
});
const lab = (over: Record<string, unknown> = {}) => ({
  slug: "linux-demo",
  topic: "linux",
  level: "beginner",
  tags: ["Demo"],
  title: "Demo",
  summary: "A demo.",
  scenario: "A demo lab.",
  minutes: 20,
  machine: { name: "demo1", image: "ubuntu:24.04" },
  setup: "true",
  steps: [taskStep(), quizStep()],
  futureKey: { kept: true },
  ...over,
});

describe("shell lab validation", () => {
  it("accepts a valid lab and allows unknown keys", () => {
    expect(validateShellLab("linux-demo", lab())).toEqual([]);
  });

  it("checks the slug against the file name", () => {
    expect(validateShellLab("other-name", lab()).join("\n")).toContain('the file says slug "linux-demo", expected "other-name"');
  });

  it("rejects a bad topic, level, minutes and machine", () => {
    const problems = validateShellLab("linux-demo", lab({ topic: "windows", level: "expert", minutes: 2, machine: { name: "Bad Name", image: "ubuntu:latest" } })).join("\n");
    expect(problems).toContain("linux-demo, topic: topic must be one of");
    expect(problems).toContain("level: level must be one of");
    expect(problems).toContain("minutes: minutes must be a whole number, 5 or more");
    expect(problems).toContain("machine.name");
    expect(problems).toContain("machine.image: image needs a fixed tag or a digest, not latest");
  });

  it("names the lab and the step for step problems", () => {
    const noHints = { ...taskStep(), id: "second-step", hints: ["only one"] };
    const problems = validateShellLab("linux-demo", lab({ steps: [taskStep(), noHints] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toBe('linux-demo, step "second-step" hints: needs exactly three hints: a nudge, a hint and a worked example');
  });

  it("needs steps", () => {
    expect(validateShellLab("linux-demo", lab({ steps: [] })).join("\n")).toContain("linux-demo, steps: needs at least one step");
  });

  it("needs checks and a solution on a task step", () => {
    const step = { ...taskStep(), checks: [], solution: undefined };
    const problems = validateShellLab("linux-demo", lab({ steps: [step] })).join("\n");
    expect(problems).toContain('step "make-file" solution: a task step needs a solution');
    expect(problems).toContain('step "make-file" checks: a task step needs at least one check');
  });

  it("keeps quiz steps free of checks and solution, with 2 to 4 options and a valid answer", () => {
    const withChecks = { ...quizStep(), checks: taskStep().checks, solution: "x" };
    expect(validateShellLab("linux-demo", lab({ steps: [withChecks] })).join("\n")).toContain('step "read-output" quiz: a quiz step has no checks and no solution');
    const outOfRange = { ...quizStep(), quiz: { question: "Q", options: ["A", "B"], answer: 2, why: "w" } };
    expect(validateShellLab("linux-demo", lab({ steps: [outOfRange] })).join("\n")).toContain("the quiz answer must be the number of one option");
    const oneOption = { ...quizStep(), quiz: { question: "Q", options: ["A"], answer: 0, why: "w" } };
    expect(validateShellLab("linux-demo", lab({ steps: [oneOption] })).join("\n")).toContain("a quiz needs 2 to 4 options");
    const noWhy = { ...quizStep(), quiz: { question: "Q", options: ["A", "B"], answer: 0 } };
    expect(validateShellLab("linux-demo", lab({ steps: [noWhy] })).join("\n")).toContain("quiz.why");
  });

  it("rejects a check that runs on an unknown machine", () => {
    const step = { ...taskStep(), checks: [{ ...taskStep().checks[0]!, on: "ghost" }] };
    expect(validateShellLab("linux-demo", lab({ steps: [step] })).join("\n")).toContain('runs on "ghost", which is not a machine in this lab');
  });
});

describe("shell lab source folder", () => {
  function source(labs: Record<string, unknown>[], listed = labs.map((item) => String(item.slug))) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shell-labs-"));
    temporary.push(root);
    const dir = path.join(root, "labs", "shell");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.yaml"), dumpYaml({ labs: listed }));
    for (const item of labs) fs.writeFileSync(path.join(dir, `${String(item.slug)}.yaml`), dumpYaml(item));
    return { root, dir };
  }

  it("reads the labs in index order and keeps every key", () => {
    const { dir } = source([lab({ slug: "linux-b" }), lab({ slug: "linux-a" })], ["linux-b", "linux-a"]);
    const read = readShellLabSource(dir);
    expect(read.problems).toEqual([]);
    expect(read.labs.map((item) => item.slug)).toEqual(["linux-b", "linux-a"]);
    expect(read.labs[0]!.futureKey).toEqual({ kept: true });
  });

  it("reports unlisted files, missing files and invalid labs", () => {
    const { dir } = source([lab({ slug: "linux-a" }), lab({ slug: "linux-b", minutes: 1 })], ["linux-a", "linux-missing"]);
    const problems = readShellLabSource(dir).problems.join("\n");
    expect(problems).toContain("linux-b: has a file but is not listed in index.yaml");
    expect(problems).toContain("linux-missing: is listed in index.yaml but has no file");
  });

  it("fails the check script on a problem and passes on a good folder", () => {
    const bad = source([lab({ steps: [] })]);
    const run = (root: string) => spawnSync(process.execPath, ["--import", "tsx", "scripts/shell-labs-publish.ts", "--check", "--root", root], {
      cwd: path.resolve(import.meta.dirname, "../.."), env: { ...process.env, BUILDMENT_CONTENT_ROOT: "" }, encoding: "utf8",
    });
    const failed = run(bad.root);
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("linux-demo, steps: needs at least one step");
    const good = run(source([lab()]).root);
    expect(good.status).toBe(0);
    expect(good.stdout).toContain("1 labs OK");
  }, 60_000);

  it("finds the folder from --root or BUILDMENT_CONTENT_ROOT", () => {
    expect(shellLabsDirForRoot(["--root", "/x"], {})).toBe(path.join("/x", "labs", "shell"));
    expect(shellLabsDirForRoot([], { BUILDMENT_CONTENT_ROOT: "/y" })).toBe(path.join("/y", "labs", "shell"));
    expect(() => shellLabsDirForRoot([], {})).toThrow(/BUILDMENT_CONTENT_ROOT/);
  });
});
