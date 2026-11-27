import type Anthropic from "@anthropic-ai/sdk";
import { env, learnerQaAvailable } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { applyTokens, contentTokenValues } from "../../../shared/lib/content-tokens.js";
import { resolveCourseFamily } from "../../../shared/lib/course-tracks.js";
import type { ChapterQuestionAnswer, ChapterQuestionStatus } from "./types.js";
import type { SessionUser } from "../../../types/auth.js";
import { AppError, ForbiddenError, NotFoundError } from "../../../utils/errors.js";
import { logger } from "../../../utils/logger.js";
import { bypassProgressGatingForEmail } from "../../auth/seed-access.js";
import { requireBlockSubmissionAccess } from "../../enrollment/api-learn-access.js";
import { ChapterLockedError, assertChapterUnlocked } from "../../progress/gate.js";
import { AiError, createChatCompletion, type ChatMessage } from "../openrouter.js";
import { readCourseAssistant } from "./assistant.js";
import { ANSWER_MAX_TOKENS, buildMessages, buildSystemPrompt, modelSettings, type PreviousTurn } from "./prompt.js";
import { resolveQaProvider, upstreamErrorStatus } from "./provider.js";
import { recordTokens, releaseQuestion, remainingToday, reserveQuestion } from "./usage.js";

// Ask about this chapter: one short question, one short answer, grounded in the chapter's
// teaching text. Uses Anthropic, OpenRouter, or Gemini from server env; keys are never
// logged or returned. Upstream failures become one plain message; the provider's reply
// and error text stay on the server.

const NOT_AVAILABLE = "Chapter questions are not available right now.";
const TRY_LATER = "We could not answer that just now. Please try again in a moment.";
const DECLINED = "I can only help with this chapter, so I cannot answer that one. Ask me about the chapter instead.";

export type ChapterQaDeps = { client?: Pick<Anthropic, "messages">; fetchImpl?: typeof fetch };

/** The same checks blocks use: verified learner, enrolled, chapter unlocked. Quiz chapters never qualify. */
export async function loadAskableChapter(chapterId: string, user: SessionUser | undefined) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      title: true,
      courseId: true,
      readerMode: true,
      archivedAt: true,
      publishedAt: true,
      source: true,
      compiled: true,
      course: { select: { title: true, familySlug: true, variantFamily: true, assistant: true } },
    },
  });
  if (!chapter || chapter.archivedAt || !chapter.publishedAt) throw new NotFoundError("Chapter not found");
  if (chapter.readerMode === "QUIZ") throw new ForbiddenError(NOT_AVAILABLE, "QA_UNAVAILABLE");

  const enrollment = await requireBlockSubmissionAccess(chapter.courseId, user);
  const learner = user!;
  try {
    await assertChapterUnlocked({
      courseId: chapter.courseId,
      enrollmentId: enrollment.id,
      chapterId: chapter.id,
      bypassLocking: bypassProgressGatingForEmail(learner.email),
    });
  } catch (error) {
    if (error instanceof ChapterLockedError) {
      throw new ForbiddenError("This chapter is locked. Finish the previous chapter first.", "CHAPTER_LOCKED");
    }
    throw error;
  }
  return { chapter, enrollment, learner };
}

export async function chapterQuestionStatus(chapterId: string, user: SessionUser | undefined): Promise<ChapterQuestionStatus> {
  if (!learnerQaAvailable) return { available: false, remaining: 0, dailyLimit: env.LEARNER_QA_DAILY_LIMIT, starters: [] };
  const { chapter, learner } = await loadAskableChapter(chapterId, user);
  const { starters } = readCourseAssistant(chapter.course.assistant);
  return { available: true, ...(await remainingToday(learner.id)), starters: starters ?? [] };
}

type Prepared = {
  chapterId: string;
  learnerId: string;
  reservation: string;
  systemPrompt: string;
  chatMessages: ChatMessage[];
  params: Anthropic.MessageCreateParamsNonStreaming;
  remaining: { remaining: number; dailyLimit: number };
};

export type AskInput = { chapterId: string; user: SessionUser | undefined; question: string; previous?: PreviousTurn };

/** Access, limits and the model request, shared by the single and streaming paths. A question is reserved here. */
async function prepareQuestion(input: AskInput): Promise<Prepared> {
  if (!learnerQaAvailable) throw new AppError(NOT_AVAILABLE, 503, "QA_UNAVAILABLE");
  const { chapter, enrollment, learner } = await loadAskableChapter(input.chapterId, input.user);

  const family = resolveCourseFamily(chapter.course.familySlug, chapter.course.variantFamily);
  const source = applyTokens(chapter.compiled ?? chapter.source, contentTokenValues(family, enrollment.variantSlug));
  const assistant = readCourseAssistant(chapter.course.assistant);
  const systemPrompt = buildSystemPrompt({
    courseTitle: chapter.course.title,
    chapterTitle: chapter.title,
    source,
    guidance: assistant.guidance,
  });
  const messages = buildMessages(input.question, input.previous);

  const reservation = await reserveQuestion({ userId: learner.id, courseId: chapter.courseId, chapterId: chapter.id });
  try {
    return {
      chapterId: chapter.id,
      learnerId: learner.id,
      reservation,
      systemPrompt,
      chatMessages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: String(m.content) })),
      ],
      params: {
        model: env.LEARNER_QA_MODEL,
        ...modelSettings(assistant.effort),
        system: systemPrompt,
        messages,
      },
      remaining: await remainingToday(learner.id),
    };
  } catch (error) {
    await releaseQuestion(reservation).catch(() => undefined);
    throw error;
  }
}

/** Log the status only (the error text can echo request details) and hide the rest from the learner. */
function failure(error: unknown, chapterId: string): AppError {
  if (error instanceof AppError && !(error instanceof AiError)) return error;
  logger.error({ status: upstreamErrorStatus(error), chapterId }, "chapter question failed");
  return new AppError(TRY_LATER, 502, "QA_FAILED");
}

export async function askAboutChapter(input: AskInput, deps: ChapterQaDeps = {}): Promise<ChapterQuestionAnswer> {
  const prepared = await prepareQuestion(input);
  try {
    const provider = resolveQaProvider(deps.client);
    if (!provider) throw new AppError(NOT_AVAILABLE, 503, "QA_UNAVAILABLE");

    let answer: string;
    if (provider.kind === "anthropic") {
      const message = await provider.client.messages.create(prepared.params);
      await recordTokens(prepared.reservation, { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens });
      const text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      answer = message.stop_reason === "refusal" ? DECLINED : text;
    } else {
      answer = await createChatCompletion({
        provider: provider.provider,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: prepared.chatMessages,
        maxTokens: ANSWER_MAX_TOKENS,
        temperature: 0.3,
        fetchImpl: deps.fetchImpl,
      });
    }

    if (!answer) throw new AppError(TRY_LATER, 502, "QA_FAILED");
    return { answer, ...(await remainingToday(prepared.learnerId)) };
  } catch (error) {
    await releaseQuestion(prepared.reservation).catch(() => undefined);
    throw failure(error, prepared.chapterId);
  }
}

/** Separates a streamed answer from the message of a failure that happens after the first byte. */
export const STREAM_ERROR_MARK = "\u0000";

export type StreamedQuestion = {
  /** The learner's questions left today, counting this one. */
  remaining: { remaining: number; dailyLimit: number };
  /** Writes the answer as it is generated. Never throws: a late failure is written as STREAM_ERROR_MARK plus a message. */
  run: (write: (chunk: string) => void) => Promise<void>;
};

/**
 * Same checks and limits as askAboutChapter, with the answer arriving in pieces. A failure before
 * the first byte throws like the single path, so the caller can still answer with a normal error.
 */
export async function streamAnswerAboutChapter(input: AskInput, deps: ChapterQaDeps = {}): Promise<StreamedQuestion> {
  const prepared = await prepareQuestion(input);
  const run = async (write: (chunk: string) => void) => {
    let wrote = false;
    try {
      const provider = resolveQaProvider(deps.client);
      if (!provider) throw new AppError(NOT_AVAILABLE, 503, "QA_UNAVAILABLE");

      if (provider.kind === "anthropic") {
        const stream = provider.client.messages.stream(prepared.params);
        stream.on("text", (delta) => {
          if (!wrote && !delta.trim()) return;
          wrote = true;
          write(delta);
        });
        const message = await stream.finalMessage();
        await recordTokens(prepared.reservation, { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens });
        if (message.stop_reason === "refusal" && !wrote) write(DECLINED);
        else if (!wrote) throw new AppError(TRY_LATER, 502, "QA_FAILED");
      } else {
        const answer = await createChatCompletion({
          provider: provider.provider,
          apiKey: provider.apiKey,
          model: provider.model,
          messages: prepared.chatMessages,
          maxTokens: ANSWER_MAX_TOKENS,
          temperature: 0.3,
          fetchImpl: deps.fetchImpl,
        });
        if (!answer.trim()) throw new AppError(TRY_LATER, 502, "QA_FAILED");
        wrote = true;
        write(answer);
      }
    } catch (error) {
      await releaseQuestion(prepared.reservation).catch(() => undefined);
      write(STREAM_ERROR_MARK + failure(error, prepared.chapterId).message);
    }
  };
  return { remaining: prepared.remaining, run };
}
