/**
 * Repairs chapters whose lesson text was stored as raw markdown instead of block tags.
 *
 * Symptom: a quiz chapter says "no question blocks" because its text still holds the front
 * matter and the ```quiz fences. import-course.ts normally turns each fence into a
 * <Quiz id="..." /> tag plus a Block row. This script does the same for chapters that missed it.
 *
 * Preview, changes nothing:  pnpm tsx scripts/repair-quiz-fences.ts --chapter <chapterId>
 * Apply:                     pnpm tsx scripts/repair-quiz-fences.ts --chapter <chapterId> --apply
 * Whole course:              pnpm tsx scripts/repair-quiz-fences.ts --course <slug> [--apply]
 *
 * Chapters of a course with a release, or that already have blocks, are skipped.
 */
import "dotenv/config";
import { load as loadYaml } from "js-yaml";
import { ulid } from "ulid";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/index.js";
import { QuizConfigSchema } from "../src/shared/blocks/quiz/schema.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type PendingBlock = {
  id: string;
  type: "QUIZ" | "OPEN_QUESTION";
  required: boolean;
  config: Prisma.InputJsonValue;
};

type QuizFence = {
  type?: "mcq" | "short";
  question?: string;
  options?: (string | number | boolean)[];
  correct?: number;
  explanation?: string;
  explanations?: string[];
  modelAnswer?: string;
  autoGrade?: "mentor" | "llm";
  rubric?: string;
  minWords?: number;
};

/** One explanation string shown after the learner answers. Same shape the importer builds. */
function quizExplanation(options: (string | number | boolean)[], explanation?: string, explanations?: string[]): string | undefined {
  const perOption = (explanations ?? []).map((why, i) => (options[i] !== undefined ? `"${options[i]}" ${why}` : why));
  const text = [explanation, ...perOption].filter((part) => part?.trim()).join("\n");
  return text || undefined;
}

/** Runs `transform` over the parts of `text` that do NOT match `pattern`, leaving matches untouched. */
function splitOutside(text: string, pattern: RegExp, transform: (part: string) => string): string {
  const parts = text.split(pattern);
  const matches = text.match(pattern) ?? [];
  return parts.map((part, i) => (i < parts.length - 1 ? transform(part) + matches[i] : transform(part))).join("");
}

/** MDX reads bare braces and "<" as code, so escape them in prose. Code and block tags stay as they are. */
function escapeProse(text: string): string {
  return splitOutside(text, /<(?:Quiz|OpenQuestion) id="[^"]+" \/>/g, (part) =>
    splitOutside(part, /^```[\s\S]*?^```[ \t]*$/gm, (segment) =>
      splitOutside(segment, /`[^`\n]+`/g, (prose) =>
        prose.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/</g, "&lt;")
      )
    )
  );
}

function convertQuizFences(body: string) {
  const blocks: PendingBlock[] = [];
  let skipped = 0;
  const text = body.replace(/```quiz\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: QuizFence;
    try {
      parsed = loadYaml(yamlText) as QuizFence;
    } catch {
      skipped += 1;
      return match;
    }
    if (!parsed?.question) {
      skipped += 1;
      return match;
    }

    const id = ulid();
    if (parsed.type === "mcq") {
      if (!parsed.options || typeof parsed.correct !== "number") {
        skipped += 1;
        return match;
      }
      const result = QuizConfigSchema.safeParse({
        quizType: "single",
        prompt: parsed.question,
        options: parsed.options.map((label, i) => ({ id: `opt-${i}`, label })),
        correctOptionIds: [`opt-${parsed.correct}`],
        explanation: quizExplanation(parsed.options, parsed.explanation, parsed.explanations),
        allowRetry: true,
      });
      if (!result.success) {
        skipped += 1;
        return match;
      }
      blocks.push({ id, type: "QUIZ", required: true, config: result.data as Prisma.InputJsonValue });
      return `<Quiz id="${id}" />`;
    }

    blocks.push({
      id,
      type: "OPEN_QUESTION",
      required: true,
      config: {
        prompt: parsed.question,
        minWords: parsed.minWords ?? 0,
        sampleAnswer: parsed.modelAnswer,
        rubric: parsed.rubric,
        autoGrade: parsed.autoGrade === "llm" ? "llm" : "mentor",
        allowSpeechInput: false,
        allowUrl: false,
        urlRequired: false,
      },
    });
    return `<OpenQuestion id="${id}" />`;
  });
  return { text, blocks, skipped };
}

/** Drops the front matter and the duplicate "# 4.7 — Title" heading, then converts the fences. */
function rebuildSource(raw: string) {
  const normalized = raw.replace(/\r\n/g, "\n");
  const frontMatter = normalized.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = (frontMatter ? frontMatter[1]! : normalized).replace(/^# \d+\.\d+ — [^\n]+\n\n?/, "");
  const { text, blocks, skipped } = convertQuizFences(body);
  return { source: escapeProse(text).trim() + "\n", blocks, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const read = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const chapterId = read("--chapter");
  const courseSlug = read("--course");
  if (!chapterId && !courseSlug) {
    console.error("Pass --chapter <chapterId> or --course <slug>.");
    process.exitCode = 1;
    return;
  }

  let where: Prisma.ChapterWhereInput;
  if (chapterId) {
    where = { id: chapterId };
  } else {
    const course = await prisma.course.findUnique({ where: { slug: courseSlug as string }, select: { id: true } });
    if (!course) {
      console.error(`No course with slug "${courseSlug}".`);
      process.exitCode = 1;
      return;
    }
    where = { courseId: course.id, archivedAt: null };
  }

  const chapters = await prisma.chapter.findMany({
    where: { ...where, source: { contains: "```quiz" } },
    select: { id: true, slug: true, title: true, source: true, courseId: true },
  });
  if (chapters.length === 0) {
    console.log("No chapter with ```quiz fences found. Nothing to repair.");
    return;
  }

  console.log(apply ? "APPLY mode: writing changes.\n" : "PREVIEW mode: nothing is written. Add --apply to save.\n");

  let repaired = 0;
  for (const chapter of chapters) {
    const label = `${chapter.slug} (${chapter.id})`;
    const course = await prisma.course.findUnique({
      where: { id: chapter.courseId },
      select: { slug: true, activeReleaseId: true },
    });
    if (course?.activeReleaseId) {
      console.log(`SKIP ${label}: the course has a release. Use the course package publisher instead.`);
      continue;
    }
    const existing = await prisma.block.count({ where: { chapterId: chapter.id, archivedAt: null } });
    if (existing > 0) {
      console.log(`SKIP ${label}: it already has ${existing} blocks.`);
      continue;
    }

    const { source, blocks, skipped } = rebuildSource(chapter.source);
    if (blocks.length === 0) {
      console.log(`SKIP ${label}: no quiz fence could be read${skipped ? ` (${skipped} unreadable)` : ""}.`);
      continue;
    }

    console.log(`${apply ? "FIX " : "WOULD FIX"} ${label}: ${blocks.length} question block(s)${skipped ? `, ${skipped} unreadable fence(s) left as text` : ""}`);
    if (!apply) {
      console.log(source.split("\n").slice(0, 8).map((line) => `    ${line}`).join("\n") + "\n");
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({ where: { id: chapter.id }, data: { source, compiled: source } });
      for (const [index, block] of blocks.entries()) {
        await tx.block.create({
          data: {
            id: block.id,
            chapterId: chapter.id,
            type: block.type,
            order: index + 1,
            required: block.required,
            blocking: false,
            points: 1,
            config: block.config,
            tags: [],
          },
        });
      }
    });
    repaired += 1;
  }

  if (apply) console.log(`\nDone. ${repaired} chapter(s) repaired. Reload the quiz in the app.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
