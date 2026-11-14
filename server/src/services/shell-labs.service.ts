import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import type { Prisma } from "../generated/prisma/index.js";
import { BadRequestError } from "../utils/errors.js";

// Shell labs live in the private content repository and reach the database through
// `pnpm labs:publish`. The desktop app reads them from the API and runs the checks
// itself, so the whole lab is stored and served as it was authored.

/** One lab as authored. Only the listed keys are read here; every other key is kept. */
export type ShellLabInput = {
  slug: string;
  topic: string;
  level: string;
  title: string;
  summary: string;
  minutes: number;
  [key: string]: unknown;
};

export type ShellLabImportResult = {
  added: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  version: string;
};

/** JSON with object keys sorted, so the same lab always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function shellLabHash(lab: unknown): string {
  return createHash("sha256").update(canonicalJson(lab)).digest("hex");
}

/** Stable version of an ordered list of labs: empty string when there are none. */
export function versionOf(labs: { slug: string; contentHash: string }[]): string {
  if (labs.length === 0) return "";
  const hash = createHash("sha256");
  for (const lab of labs) hash.update(`${lab.slug}:${lab.contentHash}\n`);
  return hash.digest("hex");
}

/**
 * Upserts every lab (position = order of the list) and marks labs that are not in
 * the list inactive. Nothing is deleted. All changes happen in one transaction.
 * With `dryRun` it only reports what would change.
 */
export async function importShellLabs(
  labs: ShellLabInput[],
  options: { dryRun?: boolean } = {}
): Promise<ShellLabImportResult> {
  const seen = new Set<string>();
  for (const lab of labs) {
    if (seen.has(lab.slug)) throw new Error(`Shell lab "${lab.slug}" appears twice in the import`);
    seen.add(lab.slug);
  }
  const incoming = labs.map((lab, position) => ({ lab, position, contentHash: shellLabHash(lab) }));
  const version = versionOf(incoming.map(({ lab, contentHash }) => ({ slug: lab.slug, contentHash })));

  const run = async (tx: Pick<Prisma.TransactionClient, "shellLab">): Promise<ShellLabImportResult> => {
    const existing = new Map(
      (await tx.shellLab.findMany({ select: { slug: true, contentHash: true, position: true, active: true } })).map(
        (row) => [row.slug, row] as const
      )
    );
    const result: ShellLabImportResult = { added: 0, updated: 0, unchanged: 0, deactivated: 0, version };

    for (const { lab, position, contentHash } of incoming) {
      const row = existing.get(lab.slug);
      const fields = {
        topic: lab.topic,
        level: lab.level,
        title: lab.title,
        summary: lab.summary,
        minutes: lab.minutes,
        position,
        active: true,
        contentHash,
        data: lab as Prisma.InputJsonObject,
      };
      if (!row) {
        result.added += 1;
        if (!options.dryRun) await tx.shellLab.create({ data: { slug: lab.slug, ...fields } });
      } else if (row.contentHash !== contentHash || row.position !== position || !row.active) {
        result.updated += 1;
        if (!options.dryRun) await tx.shellLab.update({ where: { slug: lab.slug }, data: fields });
      } else {
        result.unchanged += 1;
      }
    }

    const toDeactivate = [...existing.values()].filter((row) => row.active && !seen.has(row.slug));
    result.deactivated = toDeactivate.length;
    if (!options.dryRun && toDeactivate.length) {
      await tx.shellLab.updateMany({ where: { slug: { in: toDeactivate.map((row) => row.slug) } }, data: { active: false } });
    }
    return result;
  };

  if (options.dryRun) return run(prisma);
  return prisma.$transaction(run, { timeout: 60_000, maxWait: 10_000 });
}

/** Active labs in index order, exactly as they were published. */
export async function listActiveShellLabs(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.shellLab.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { data: true } });
  return rows.map((row) => row.data as Record<string, unknown>);
}

/** Version and count of the active labs, in one read. */
export async function shellLabsSummary(): Promise<{ version: string; count: number }> {
  const rows = await prisma.shellLab.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
    select: { slug: true, contentHash: true },
  });
  return { version: versionOf(rows), count: rows.length };
}

export async function shellLabsVersion(): Promise<string> {
  return (await shellLabsSummary()).version;
}

/** Labs and their version from one read, so the two always agree. */
export async function shellLabsWithVersion(): Promise<{ version: string; labs: Record<string, unknown>[] }> {
  const rows = await prisma.shellLab.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
    select: { slug: true, contentHash: true, data: true },
  });
  return { version: versionOf(rows), labs: rows.map((row) => row.data as Record<string, unknown>) };
}

// ---- Progress: the steps a learner has passed, per lab ----

const MAX_STEPS_PER_LAB = 100;
const MAX_STEP_ID_LENGTH = 80;

/** Every lab the learner has progress in: { slug: [step ids] }. */
export async function shellLabProgress(userId: string): Promise<Record<string, string[]>> {
  const rows = await prisma.shellLabProgress.findMany({ where: { userId }, select: { labSlug: true, steps: true } });
  return Object.fromEntries(rows.map((row) => [row.labSlug, row.steps]));
}

/** Replaces the passed steps of one lab. An empty list clears them (the lab was reset). */
export async function saveShellLabProgress(userId: string, slug: string, steps: unknown): Promise<string[]> {
  if (!Array.isArray(steps) || steps.length > MAX_STEPS_PER_LAB) throw new BadRequestError("steps must be a short list of step ids");
  const clean = [...new Set(steps)];
  if (clean.some((step) => typeof step !== "string" || !step || step.length > MAX_STEP_ID_LENGTH)) {
    throw new BadRequestError("every step id must be a short text");
  }
  if (!(await prisma.shellLab.findUnique({ where: { slug }, select: { slug: true } }))) {
    throw new BadRequestError("unknown lab");
  }
  if (!clean.length) {
    await prisma.shellLabProgress.deleteMany({ where: { userId, labSlug: slug } });
    return [];
  }
  const done = clean as string[];
  await prisma.shellLabProgress.upsert({
    where: { userId_labSlug: { userId, labSlug: slug } },
    create: { userId, labSlug: slug, steps: done },
    update: { steps: done },
  });
  return done;
}
