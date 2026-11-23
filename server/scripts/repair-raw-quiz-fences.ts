/**
 * Repairs chapters whose text is still raw lesson markdown, where the quiz questions are
 * ```quiz fences. The reader only counts <Quiz id="..." /> tags that have a Block row, so
 * such a chapter shows "no questions". This turns each fence into a Block plus its tag, the same
 * way import-course.ts does when it reads a course folder.
 *
 * Preview:  pnpm exec tsx scripts/repair-raw-quiz-fences.ts --chapter <chapterId>
 * Write:    pnpm exec tsx scripts/repair-raw-quiz-fences.ts --chapter <chapterId> --apply
 * A whole course (default multi-vendor-marketplace): use --course <slug> instead of --chapter.
 *
 * Chapters of a released course, or ones that already have active blocks, are skipped.
 */
import "dotenv/config";
import { load as loadYaml } from "js-yaml";
import { ulid } from "ulid";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/index.js";
import { QuizConfigSchema } from "../src/shared/blocks/quiz/schema.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type NewBlock = {
  id: string;
  type: "QUIZ" | "OPEN_QUESTION";
  required: boolean;
  config: Prisma.InputJsonValue;
};

type QuizFence = {
  type: "mcq" | "short";
  question: string;
  options?: (string | number | boolean)[];
  correct?: number;
  explanation?: string;
  explanations?: string[];
  modelAnswer?: string;
  autoGrade?: "mentor" | "llm";
  hints?: string[];
  hintAfterAttempts?: number;
  maxAttempts?: number;
  reviewChapters?: string[];
  rubric?: string;
  allowSpeechInput?: boolean;
  allowUrl?: boolean;
  urlLabel?: string;
  urlRequired?: boolean;
  urlHint?: string;
  minWords?: number;
};

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Same feedback text the importer builds: one line per option, after the main explanation. */
function quizExplanation(
  options: (string | number | boolean)[],
  explanation?: string,
  explanations?: string[],
): string | undefined {
  const perOption = (explanations ?? []).map((why, i) =>
    options[i] !== undefined ? `"${options[i]}" ${why}` : why,
  );
  const text = [explanation, ...perOption].filter((part) => part?.trim()).join("\n");
  return text || undefined;
}

/** ```quiz fenced YAML -> Quiz / OpenQuestion blocks and their placeholder tags. */
function convertQuizFences(body: string, blocks: NewBlock[]): string {
  return body.replace(/```quiz\n([\s\S]*?)```/g, (match, yamlText: string) => {
    let parsed: QuizFence;
    try {
      parsed = loadYaml(yamlText) as QuizFence;
    } catch {
      return match;
    }
    if (!parsed?.question) return match;

    if (parsed.type === "mcq" && parsed.options && typeof parsed.correct === "number") {
      const block: NewBlock = {
        id: ulid(),
        type: "QUIZ",
        required: true,
        config: QuizConfigSchema.parse({
          quizType: "single",
          prompt: parsed.question,
          options: parsed.options.map((label, i) => ({ id: `opt-${i}`, label })),
          correctOptionIds: [`opt-${parsed.correct}`],
          explanation: quizExplanation(parsed.options, parsed.explanation, parsed.explanations),
          allowRetry: true,
        }) as Prisma.InputJsonValue,
      };
      blocks.push(block);
      return `<Quiz id="${block.id}" />`;
    }

    const hints = Array.isArray(parsed.hints)
      ? parsed.hints.map((hint) => String(hint).trim()).filter(Boolean)
      : undefined;
    const block: NewBlock = {
      id: ulid(),
      type: "OPEN_QUESTION",
      required: true,
      config: {
        prompt: parsed.question,
        minWords: parsed.minWords ?? 0,
        sampleAnswer: parsed.modelAnswer,
        rubric: parsed.rubric,
        autoGrade: parsed.autoGrade === "llm" ? "llm" : "mentor",
        ...(hints && hints.length > 0 ? { hints } : {}),
        ...(typeof parsed.hintAfterAttempts === "number"
          ? { hintAfterAttempts: parsed.hintAfterAttempts }
          : {}),
        ...(typeof parsed.maxAttempts === "number" ? { maxAttempts: parsed.maxAttempts } : {}),
        ...(Array.isArray(parsed.reviewChapters)
          ? { reviewChapterSlugs: parsed.reviewChapters }
          : {}),
        allowSpeechInput: parsed.allowSpeechInput ?? false,
        allowUrl: parsed.allowUrl ?? false,
        urlLabel: parsed.urlLabel,
        urlRequired: parsed.urlRequired ?? false,
        urlHint: parsed.urlHint,
      },
    };
    blocks.push(block);
    return `<OpenQuestion id="${block.id}" />`;
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const chapterId = argValue("--chapter");
  const courseSlug = argValue("--course") ?? "multi-vendor-marketplace";

  const chapters = await prisma.chapter.findMany({
    where: {
      archivedAt: null,
      source: { contains: "```quiz" },
      ...(chapterId ? { id: chapterId } : { course: { slug: courseSlug } }),
    },
    select: {
      id: true,
      title: true,
      source: true,
      course: { select: { slug: true, activeReleaseId: true } },
    },
    orderBy: { order: "asc" },
  });

  if (chapters.length === 0) {
    console.log("No chapter with raw ```quiz fences was found. Nothing to repair.");
    return;
  }

  let repaired = 0;
  for (const chapter of chapters) {
    const label = `"${chapter.title}" (${chapter.id})`;
    try {
      if (chapter.course.activeReleaseId) {
        console.log(`SKIP ${label}: the course has a release. Use the course package publisher instead.`);
        continue;
      }
      const activeBlocks = await prisma.block.count({
        where: { chapterId: chapter.id, archivedAt: null },
      });
      if (activeBlocks > 0) {
        console.log(`SKIP ${label}: it already has ${activeBlocks} active block(s).`);
        continue;
      }

      // Same cleanup the importer does: drop the frontmatter and the duplicate "# 4.7 — ..." heading.
      const raw = chapter.source.replace(/\r\n/g, "\n");
      const withFrontmatter = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const body = (withFrontmatter ? withFrontmatter[2]! : raw).replace(
        /^# \d+\.\d+ — [^\n]+\n\n?/,
        "",
      );

      const blocks: NewBlock[] = [];
      const converted = convertQuizFences(body, blocks);

      if (/```quiz\n/.test(converted)) {
        console.log(`SKIP ${label}: a quiz fence could not be read. Check its YAML.`);
        continue;
      }
      if (blocks.length === 0) {
        console.log(`SKIP ${label}: no readable quiz fence.`);
        continue;
      }
      const others = converted.match(
        /```(?:predict|openquestion|aiinterview|codeexercise|code-exercise|video|walkthrough|diagram|roadmap)\n/g,
      );
      if (others) {
        console.log(`NOTE ${label}: ${others.length} other fence(s) were left as plain text.`);
      }

      const next = converted.trim() + "\n";
      console.log(`${apply ? "FIX " : "PLAN"} ${label}: ${blocks.length} block(s)`);

      if (!apply) continue;
      await prisma.$transaction(async (tx) => {
        await tx.chapter.update({
          where: { id: chapter.id },
          data: { source: next, compiled: next },
        });
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
    } catch (error) {
      console.error(`FAIL ${label}:`, error);
    }
  }

  console.log(
    apply
      ? `Done. Repaired ${repaired} chapter(s).`
      : "Preview only. Nothing was written. Add --apply to write the changes.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
