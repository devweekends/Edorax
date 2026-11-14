/**
 * Reads and validates the shell labs of the private content repository.
 *
 * Layout: <root>/labs/shell/index.yaml lists the lab slugs in the order the app
 * shows them, and <root>/labs/shell/<slug>.yaml holds one lab. The root is
 * BUILDMENT_CONTENT_ROOT (the same checkout the courses use) or a --root flag.
 *
 * The rules match the important checks of the content repository's own
 * validate-shell-labs.mjs. Unknown extra keys are allowed and kept as they are.
 */
import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import type { ShellLabInput } from "../src/services/shell-labs.service.js";

export const SHELL_LAB_TOPICS = ["linux", "docker", "ansible", "kubernetes"] as const;
export const SHELL_LAB_LEVELS = ["beginner", "intermediate"] as const;
export const SHELL_LABS_EXTRA_CAPABILITIES = ["SYS_CHROOT", "NET_BIND_SERVICE", "AUDIT_WRITE", "NET_ADMIN"] as const;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ID = /^[a-z0-9-]{1,60}$/;
const HOSTNAME = /^[a-z0-9-]{1,40}$/;
const PACKAGE = /^[a-z0-9][a-z0-9+.-]{0,60}$/;
const IMAGE = /^[a-z0-9./_-]+:[A-Za-z0-9._-]+(@sha256:[a-f0-9]{64})?$|^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/;

const text = (what: string) => z.string({ error: `${what} is required` }).refine((value) => value.trim().length > 0, `${what} cannot be empty`);
const image = z
  .string({ error: "image is required" })
  .refine((value) => IMAGE.test(value) && !value.endsWith(":latest"), "image needs a fixed tag or a digest, not latest");
const limit = (name: string, low: number, high: number) =>
  z.number({ error: `${name} must be a number from ${low} to ${high}` }).min(low, `${name} must be a number from ${low} to ${high}`).max(high, `${name} must be a number from ${low} to ${high}`);
const capabilities = z.array(z.enum(SHELL_LABS_EXTRA_CAPABILITIES, { error: `capability must be one of ${SHELL_LABS_EXTRA_CAPABILITIES.join(", ")}` }));

const MachineSchema = z.looseObject({
  name: z.string({ error: "machine name is required" }).regex(HOSTNAME, "machine name must be a short hostname"),
  image,
  packages: z.array(z.string().regex(PACKAGE, "is not a valid package name")).optional(),
  capabilities: capabilities.optional(),
  sudo: z.boolean({ error: "sudo must be true or false" }).optional(),
  memoryMb: limit("memoryMb", 128, 4096).optional(),
  pids: limit("pids", 32, 1024).optional(),
  cpus: limit("cpus", 0.5, 2).optional(),
  vm: z.boolean({ error: "vm must be true or false" }).optional(),
});

const CheckSchema = z.looseObject({
  id: z.string({ error: "check id is required" }).regex(ID, "check id is not valid"),
  label: text("check label"),
  run: text("check run"),
  fail: text("check fail"),
  on: z.string().optional(),
});

const QuizSchema = z.looseObject({
  question: text("quiz question"),
  why: text("quiz why"),
  options: z.array(text("a quiz option")).min(2, "a quiz needs 2 to 4 options").max(4, "a quiz needs 2 to 4 options"),
  answer: z.number({ error: "the quiz answer must be the number of one option, counting from 0" }).int(),
  show: z.string().optional(),
});

const StepSchema = z.looseObject({
  id: z.string({ error: "step id is required" }).regex(ID, "step id is not valid"),
  goal: text("goal"),
  body: text("body"),
  solution: z.string().optional(),
  hints: z
    .array(text("a hint"), { error: "needs exactly three hints: a nudge, a hint and a worked example" })
    .length(3, "needs exactly three hints: a nudge, a hint and a worked example"),
  checks: z.array(CheckSchema).optional(),
  quiz: QuizSchema.optional(),
});

const LabSchema = z
  .looseObject({
    slug: z.string({ error: "slug is required" }).regex(SLUG, "slug must be lowercase words joined by dashes"),
    topic: z.enum(SHELL_LAB_TOPICS, { error: `topic must be one of ${SHELL_LAB_TOPICS.join(", ")}` }),
    level: z.enum(SHELL_LAB_LEVELS, { error: `level must be one of ${SHELL_LAB_LEVELS.join(", ")}` }),
    title: text("title"),
    summary: text("summary"),
    scenario: text("scenario"),
    setup: text("setup"),
    minutes: z.number({ error: "minutes must be a whole number, 5 or more" }).int("minutes must be a whole number, 5 or more").min(5, "minutes must be a whole number, 5 or more"),
    tags: z
      .array(z.string().refine((tag) => tag.trim().length > 0 && !tag.startsWith("#"), "tags are written without #"), { error: "needs tags, written without #" })
      .min(1, "needs tags, written without #"),
    machine: MachineSchema,
    machines: z.array(MachineSchema).max(4, "machines must be a list of at most 4 extra machines").optional(),
    steps: z.array(StepSchema, { error: "needs at least one step" }).min(1, "needs at least one step"),
  })
  .superRefine((lab, ctx) => {
    const add = (pathInLab: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path: pathInLab, message });

    const machines = [lab.machine, ...(lab.machines ?? [])];
    const names = new Set<string>();
    machines.forEach((machine, index) => {
      const where = index === 0 ? ["machine"] : ["machines", index - 1];
      if (names.has(machine.name)) add([...where, "name"], `machine name "${machine.name}" is used twice`);
      names.add(machine.name);
    });
    if (lab.machine.vm === true) {
      if (lab.machine.packages?.length || (typeof lab.machine.build === "string" && lab.machine.build.trim())) {
        add(["machine"], "a virtual machine lab cannot install packages or run a build script: they belong in the VM image");
      }
      if (lab.machine.capabilities?.length || lab.machine.sudo) add(["machine"], "a virtual machine lab cannot ask for capabilities or sudo");
      if (lab.machines?.length) add(["machines"], "a virtual machine lab cannot have extra machines");
    } else if ((lab.machine.memoryMb ?? 0) > 2048) {
      add(["machine", "memoryMb"], "machine.memoryMb above 2048 is only for virtual machine labs");
    }

    const stepIds = new Set<string>();
    lab.steps.forEach((step, index) => {
      const at = (key: string) => ["steps", index, key];
      if (stepIds.has(step.id)) add(["steps", index, "id"], `step id "${step.id}" is used twice`);
      stepIds.add(step.id);

      if (step.quiz) {
        if (step.checks?.length || (typeof step.solution === "string" && step.solution.trim())) add(at("quiz"), "a quiz step has no checks and no solution");
        const { options, answer } = step.quiz;
        if (!(answer >= 0 && answer < options.length)) add(at("quiz"), "the quiz answer must be the number of one option, counting from 0");
        return;
      }
      if (!step.solution?.trim()) add(at("solution"), "a task step needs a solution");
      if (!step.checks?.length) {
        add(at("checks"), "a task step needs at least one check");
        return;
      }
      const checkIds = new Set<string>();
      for (const check of step.checks) {
        if (checkIds.has(check.id)) add(at("checks"), `check id "${check.id}" is used twice`);
        checkIds.add(check.id);
        if (check.on !== undefined && !names.has(check.on)) add(at("checks"), `check "${check.id}" runs on "${check.on}", which is not a machine in this lab`);
      }
    });
  });

function describePath(raw: unknown, issuePath: PropertyKey[]): string {
  const [first, index, ...rest] = issuePath;
  if (first === "steps" && typeof index === "number") {
    const step = (raw as { steps?: { id?: unknown }[] } | null)?.steps?.[index];
    const id = typeof step?.id === "string" ? `"${step.id}"` : `#${index + 1}`;
    return `step ${id}${rest.length ? ` ${rest.map(String).join(".")}` : ""}`;
  }
  return issuePath.map(String).join(".");
}

/** Problems of one lab, each naming the lab and (for a step) the step. */
export function validateShellLab(slug: string, raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [`${slug}: the file must hold one lab`];
  const problems: string[] = [];
  const parsed = LabSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const where = describePath(raw, issue.path);
      problems.push(`${slug}${where ? `, ${where}` : ""}: ${issue.message}`);
    }
  }
  const declared = (raw as { slug?: unknown }).slug;
  if (declared !== slug) problems.push(`${slug}: the file says slug "${String(declared)}", expected "${slug}"`);
  return problems;
}

export type ShellLabSource = { dir: string; labs: ShellLabInput[]; problems: string[] };

/** <root>/labs/shell, with the root from --root or BUILDMENT_CONTENT_ROOT. */
export function shellLabsDirForRoot(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): string {
  const index = argv.indexOf("--root");
  const inline = argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length);
  const root = (index >= 0 ? argv[index + 1] : inline) ?? env.BUILDMENT_CONTENT_ROOT;
  if (!root) throw new Error("Set BUILDMENT_CONTENT_ROOT to the content checkout, or pass --root <path>");
  return path.resolve(root, "labs", "shell");
}

/** Reads index.yaml and every listed lab. Collects every problem instead of stopping at the first. */
export function readShellLabSource(dir: string): ShellLabSource {
  const problems: string[] = [];
  const labs: ShellLabInput[] = [];
  const indexFile = path.join(dir, "index.yaml");
  if (!fs.existsSync(indexFile)) return { dir, labs, problems: [`index.yaml: not found at ${indexFile}`] };

  let listed: unknown;
  try {
    listed = (loadYaml(fs.readFileSync(indexFile, "utf8")) as { labs?: unknown } | null)?.labs;
  } catch (error) {
    return { dir, labs, problems: [`index.yaml: cannot be read (${error instanceof Error ? error.message : String(error)})`] };
  }
  if (!Array.isArray(listed) || listed.length === 0 || !listed.every((slug) => typeof slug === "string")) {
    return { dir, labs, problems: [`index.yaml: needs a "labs" list of slugs`] };
  }
  const slugs = listed as string[];
  if (new Set(slugs).size !== slugs.length) problems.push("index.yaml: lists a lab twice");
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".yaml") && name !== "index.yaml" && !slugs.includes(name.slice(0, -".yaml".length))) {
      problems.push(`${name.slice(0, -".yaml".length)}: has a file but is not listed in index.yaml, so the app will not offer it`);
    }
  }

  const done = new Set<string>();
  for (const slug of slugs) {
    if (done.has(slug)) continue;
    done.add(slug);
    const file = path.join(dir, `${slug}.yaml`);
    if (!fs.existsSync(file)) {
      problems.push(`${slug}: is listed in index.yaml but has no file`);
      continue;
    }
    let raw: unknown;
    try {
      raw = loadYaml(fs.readFileSync(file, "utf8"));
    } catch (error) {
      problems.push(`${slug}: the file is not valid YAML (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
      continue;
    }
    const found = validateShellLab(slug, raw);
    if (found.length) problems.push(...found);
    else labs.push(raw as ShellLabInput);
  }
  return { dir, labs, problems };
}
