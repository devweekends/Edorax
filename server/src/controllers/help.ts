import type { Request, Response } from "express";
import { created, ok } from "../utils/responses.js";
import * as threads from "../services/help/threads.js";
import type { AskFromChapterBody, LessonReportBody, ReplyBody } from "../validations/help.js";

// GET /api/v1/help/threads — the learner's own questions
export async function list(req: Request, res: Response) {
  ok(res, { threads: await threads.listMenteeThreads(req.user!) });
}

// GET /api/v1/help/threads/:threadId — mentee or course mentor
export async function detail(req: Request, res: Response) {
  ok(res, await threads.getThread(req.params.threadId as string, req.user!));
}

// POST /api/v1/help/threads — ask the mentor from a chapter
export async function ask(req: Request, res: Response) {
  const result = await threads.askFromChapter(req.user!, req.body as AskFromChapterBody);
  if (result.created) created(res, result);
  else ok(res, result);
}

// POST /api/v1/help/reports — report an error, typo, confusing passage or improvement
export async function reportLesson(req: Request, res: Response) {
  created(
    res,
    await threads.createLessonReport(req.user!, req.body as LessonReportBody),
  );
}

// POST /api/v1/help/threads/:threadId/messages
export async function postMessage(req: Request, res: Response) {
  const { body, replyToId } = req.body as ReplyBody;
  created(
    res,
    await threads.reply(
      req.user!,
      req.params.threadId as string,
      body,
      replyToId,
    ),
  );
}

// POST /api/v1/help/threads/:threadId/seen — the viewer has this conversation open
export async function markSeen(req: Request, res: Response) {
  ok(
    res,
    await threads.markThreadSeen(req.user!, req.params.threadId as string),
  );
}

// POST /api/v1/help/threads/:threadId/resolve — course mentor only
export async function resolve(req: Request, res: Response) {
  ok(res, await threads.resolve(req.user!, req.params.threadId as string));
}
