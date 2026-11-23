import { prisma } from "../../db/prisma.js";
import type {
  IntegritySimilarPair,
  IntegrityWrittenAnswers,
} from "../../shared/api/integrity.js";
import type { SessionUser } from "../../types/auth.js";
import { logger } from "../../utils/logger.js";
import { requireCourseById } from "../teach/access.js";

// Turns written answers into vectors with a sentence-transformer that runs inside this server
// (Transformers.js, ONNX on the CPU). No paid API, no separate service, and no student text
// leaves our infrastructure. The model downloads once on first use and is then cached on disk.
// If the package or model is unavailable, callers get null and fall back to word overlap.

const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"; // small, many languages
const BATCH = 32;
const MAX_CHARS = 2000;

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractor: Promise<Extractor | null> | null = null;

function loadExtractor(): Promise<Extractor | null> {
  // Loaded once and kept. A failure is remembered too, so a missing package is not retried on every request.
  extractor ??= (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      return (await pipeline(
        "feature-extraction",
        MODEL,
      )) as unknown as Extractor;
    } catch (error) {
      logger.warn(
        { err: error },
        "[integrity] embedding model unavailable. Similarity uses word overlap instead",
      );
      return null;
    }
  })();
  return extractor;
}

/** Unit-length vectors, so the cosine similarity of two answers is just their dot product. Null when unavailable. */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const run = await loadExtractor();
  if (!run) return null;
  try {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH) {
      const batch = texts
        .slice(start, start + BATCH)
        .map((text) => text.slice(0, MAX_CHARS));
      vectors.push(
        ...(await run(batch, { pooling: "mean", normalize: true })).tolist(),
      );
    }
    return vectors.length === texts.length ? vectors : null;
  } catch (error) {
    logger.warn(
      { err: error },
      "[integrity] embedding failed. Similarity uses word overlap instead",
    );
    return null;
  }
}

// Finds written answers that are unusually alike. It only ever suggests two answers for a
// mentor to read side by side. Similar wording happens honestly (a shared textbook, a short
// definition), so nothing here marks anyone or changes a grade.

const MIN_CHARS = 40;
const MAX_ANSWERS_PER_BLOCK = 400;
const MAX_PAIRS = 50;
/** Embeddings of the same idea sit close together even when the words differ, so the bar is high. */
const EMBEDDING_THRESHOLD = 0.92;
const LEXICAL_THRESHOLD = 0.6;

type Answer = { userId: string; name: string; text: string };

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(text: string): Set<string> {
  const tokens = words(text);
  const set = new Set<string>();
  for (let index = 0; index + 3 <= tokens.length; index += 1)
    set.add(tokens.slice(index, index + 3).join(" "));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

async function pairsForBlock(
  blockId: string,
  answers: Answer[],
): Promise<IntegritySimilarPair[]> {
  const vectors = await embedTexts(answers.map((answer) => answer.text));
  const sets = vectors ? null : answers.map((answer) => shingles(answer.text));
  const found: IntegritySimilarPair[] = [];
  for (let i = 0; i < answers.length; i += 1) {
    for (let j = i + 1; j < answers.length; j += 1) {
      // The service returns unit vectors, so the dot product is the cosine similarity.
      const score = vectors
        ? dot(vectors[i]!, vectors[j]!)
        : jaccard(sets![i]!, sets![j]!);
      if (score < (vectors ? EMBEDDING_THRESHOLD : LEXICAL_THRESHOLD)) continue;
      found.push({
        blockId,
        score: Math.round(score * 100) / 100,
        method: vectors ? "embedding" : "lexical",
        learners: [
          { userId: answers[i]!.userId, name: answers[i]!.name },
          { userId: answers[j]!.userId, name: answers[j]!.name },
        ],
      });
    }
  }
  return found;
}

type Collected = Map<string, { order: number; answers: Map<string, Answer> }>;

/** Latest submitted written answer of every learner in a quiz chapter, grouped by question. */
async function collectAnswers(
  user: SessionUser,
  chapterId: string,
  minChars: number,
): Promise<Collected | null> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { courseId: true },
  });
  if (!chapter) return null;
  await requireCourseById(user, chapter.courseId, "SUBMISSION_EVALUATOR");

  const rows = await prisma.response.findMany({
    where: {
      status: { not: "DRAFT" },
      block: { chapterId, type: "OPEN_QUESTION", archivedAt: null },
    },
    orderBy: { attempt: "desc" },
    select: {
      blockId: true,
      userId: true,
      payload: true,
      user: { select: { name: true } },
      block: { select: { order: true } },
    },
  });

  const byBlock: Collected = new Map();
  for (const row of rows) {
    const text = (row.payload as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || text.trim().length < minChars) continue;
    const entry = byBlock.get(row.blockId) ?? {
      order: row.block.order,
      answers: new Map<string, Answer>(),
    };
    // Rows arrive newest attempt first, so the first one per learner is the one that counts.
    if (
      !entry.answers.has(row.userId) &&
      entry.answers.size < MAX_ANSWERS_PER_BLOCK
    ) {
      entry.answers.set(row.userId, {
        userId: row.userId,
        name: row.user.name ?? "Learner",
        text: text.trim(),
      });
    }
    byBlock.set(row.blockId, entry);
  }
  return byBlock;
}

/** Answers that look alike across learners, question by question. */
export async function findSimilarAnswers(
  user: SessionUser,
  chapterId: string,
): Promise<IntegritySimilarPair[]> {
  const byBlock = await collectAnswers(user, chapterId, MIN_CHARS);
  if (!byBlock) return [];
  const pairs: IntegritySimilarPair[] = [];
  for (const [blockId, entry] of byBlock)
    pairs.push(...(await pairsForBlock(blockId, [...entry.answers.values()])));
  return pairs.sort((a, b) => b.score - a.score).slice(0, MAX_PAIRS);
}

/** Every learner's submitted written answers, by name, so a mentor can pick two and read them side by side. */
export async function loadWrittenAnswers(
  user: SessionUser,
  chapterId: string,
): Promise<IntegrityWrittenAnswers> {
  const byBlock = await collectAnswers(user, chapterId, 1);
  const learners = new Map<string, string>();
  const questions = [...(byBlock ?? new Map())]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([blockId, entry], index) => {
      const answers = [...entry.answers.values()].map(
        ({ userId, name, text }) => ({ userId, name, text }),
      );
      for (const answer of answers) learners.set(answer.userId, answer.name);
      return { blockId, number: index + 1, answers };
    });
  return {
    learners: [...learners]
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    questions,
  };
}
