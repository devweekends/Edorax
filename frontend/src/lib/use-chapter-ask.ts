"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  friendlyFailure,
  isAskable,
  pushHistory,
  starterQuestions,
  type ChapterQuestionStatus,
  type QaTurn,
} from "@/lib/chapter-question";
import { streamChapterAnswer, type StreamResult } from "@/lib/chapter-question-stream";
import { markdownToPlainText } from "@/lib/safe-markdown";

/** Last questions and answers per chapter, kept for as long as the page is open (never saved anywhere). */
const sessionHistory = new Map<string, QaTurn[]>();

/**
 * Everything the quick-answers panel needs for one chapter. The inline card and the floating window both
 * read this one state, so they always show the same draft, answer, history and limits.
 */
export function useChapterAsk(chapterId: string, headings: { text: string }[], enabled = true) {
  const [status, setStatus] = useState<ChapterQuestionStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [followUp, setFollowUp] = useState<QaTurn | null>(null);
  const [history, setHistory] = useState<QaTurn[]>(() => sessionHistory.get(chapterId) ?? []);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiFetch<ChapterQuestionStatus>(`/api/v1/chapters/${chapterId}/ask`)
      .then((next) => {
        if (active) setStatus({ ...next, starters: next.starters ?? [] });
      })
      .catch(() => {
        // Any failure means no box: this panel is an extra, never a blocker for reading.
      });
    return () => {
      active = false;
      clearTimeout(copyTimer.current);
    };
  }, [chapterId, enabled]);

  const starters = useMemo(() => starterQuestions(status?.starters ?? [], headings), [status?.starters, headings]);

  const available = enabled && status?.available === true;
  const outOfQuestions = (status?.remaining ?? 0) <= 0;
  const locked = asking || outOfQuestions;
  const finished = asked !== null && !asking && !error && answer.length > 0;
  // The newest saved turn is already on screen as the current answer, so the list holds the ones before it.
  const earlier = finished ? history.slice(1) : history;

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!status || asking || outOfQuestions || !isAskable(trimmed)) return;
    const context = followUp;
    setAsking(true);
    setError(null);
    setAsked(trimmed);
    setAnswer("");
    setFollowUp(null);
    setQuestion("");
    let result: StreamResult;
    try {
      result = await streamChapterAnswer({
        chapterId,
        question: trimmed,
        previous: context ?? undefined,
        fallback: { remaining: status.remaining, dailyLimit: status.dailyLimit },
        onText: setAnswer,
      });
      setStatus((current) => (current ? { ...current, remaining: result.remaining, dailyLimit: result.dailyLimit } : current));
    } catch (caught) {
      // A question that failed is not charged: the API releases it, so the count goes back up.
      setAnswer("");
      setError(friendlyFailure(caught));
      setQuestion(trimmed);
      setAsking(false);
      return;
    }
    if (result.answer.trim()) {
      const next = pushHistory(sessionHistory.get(chapterId) ?? [], { question: trimmed, answer: result.answer.trim() });
      sessionHistory.set(chapterId, next);
      setHistory(next);
    }
    setAsking(false);
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(markdownToPlainText(answer));
      setCopied(true);
    } catch {
      setError("Copy did not work here. Select the answer and copy it by hand.");
      return;
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  function startFollowUp() {
    if (asked) setFollowUp({ question: asked, answer });
  }

  return {
    status,
    setStatus,
    available,
    starters,
    question,
    setQuestion,
    asked,
    answer,
    error,
    asking,
    followUp,
    setFollowUp,
    history,
    earlier,
    copied,
    outOfQuestions,
    locked,
    finished,
    ask,
    copyAnswer,
    startFollowUp,
  };
}

export type ChapterAsk = ReturnType<typeof useChapterAsk>;
