"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ChapterQuestionStatus } from "@/lib/chapter-question";
import {
  PRACTICE_QUIZ_COUNT,
  allQuestionsAnswered,
  friendlyPracticeQuizError,
  mergeRecentPrompts,
  practiceFocusChips,
  toggleOptionSelection,
} from "@/lib/practice-quiz";
import type {
  PracticeQuizCheckResponse,
  PracticeQuizGenerateResponse,
  PracticeQuizQuestion,
} from "@/shared/api/chapters";

type SessionState = {
  focus: string;
  questions: PracticeQuizQuestion[];
  answerToken: string | null;
  selections: Record<string, string[]>;
  result: PracticeQuizCheckResponse | null;
  recentPrompts: string[];
};

const EMPTY_SESSION: SessionState = {
  focus: "",
  questions: [],
  answerToken: null,
  selections: {},
  result: null,
  recentPrompts: [],
};

/** Keeps the active practice quiz per chapter while the page stays open. */
const sessionQuizStore = new Map<string, SessionState>();

export function usePracticeQuiz(input: {
  chapterId: string;
  headings: { text: string }[];
  status: ChapterQuestionStatus | null;
  onQuotaUpdate: (next: { remaining: number; dailyLimit: number }) => void;
}) {
  const { chapterId, headings, status, onQuotaUpdate } = input;
  const [state, setState] = useState<SessionState>(() => sessionQuizStore.get(chapterId) ?? EMPTY_SESSION);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateState(updater: (prev: SessionState) => SessionState) {
    setState((prev) => {
      const next = updater(prev);
      sessionQuizStore.set(chapterId, next);
      return next;
    });
  }

  function setFocus(focus: string) {
    updateState((prev) => ({ ...prev, focus }));
  }

  function selectOption(questionId: string, optionId: string, quizType: PracticeQuizQuestion["quizType"]) {
    if (checking || state.result) return;
    updateState((prev) => ({
      ...prev,
      selections: {
        ...prev.selections,
        [questionId]: toggleOptionSelection(prev.selections[questionId] ?? [], optionId, quizType),
      },
    }));
  }

  function resetAnswers() {
    setError(null);
    updateState((prev) => ({ ...prev, selections: {}, result: null }));
  }

  async function generate(overrideFocus?: string) {
    if (!status || generating || checking || status.remaining <= 0) return;
    const focusText = (overrideFocus !== undefined ? overrideFocus : state.focus).trim();
    if (overrideFocus !== undefined) {
      updateState((prev) => ({ ...prev, focus: overrideFocus }));
    }
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch<PracticeQuizGenerateResponse>(`/api/v1/chapters/${chapterId}/practice-quiz`, {
        method: "POST",
        json: {
          count: PRACTICE_QUIZ_COUNT,
          ...(focusText ? { focus: focusText } : {}),
          ...(state.recentPrompts.length > 0 ? { excludePrompts: state.recentPrompts } : {}),
        },
      });
      onQuotaUpdate({ remaining: data.remaining, dailyLimit: data.dailyLimit });
      updateState((prev) => ({
        ...prev,
        questions: data.questions,
        answerToken: data.answerToken,
        selections: {},
        result: null,
        recentPrompts: mergeRecentPrompts(prev.recentPrompts, data.questions),
      }));
    } catch (caught) {
      setError(friendlyPracticeQuizError(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function checkAnswers() {
    if (!state.answerToken || checking || generating || !allQuestionsAnswered(state.questions, state.selections)) return;
    setChecking(true);
    setError(null);
    try {
      const data = await apiFetch<PracticeQuizCheckResponse>(`/api/v1/chapters/${chapterId}/practice-quiz/check`, {
        method: "POST",
        json: {
          answerToken: state.answerToken,
          answers: state.questions.map((q) => ({ id: q.id, selected: state.selections[q.id] ?? [] })),
        },
      });
      updateState((prev) => ({ ...prev, result: data }));
    } catch (caught) {
      setError(friendlyPracticeQuizError(caught));
    } finally {
      setChecking(false);
    }
  }

  const outOfQuestions = (status?.remaining ?? 0) <= 0;
  const focusChips = practiceFocusChips(headings);
  const canCheck = !checking && !generating && !state.result && allQuestionsAnswered(state.questions, state.selections);

  return {
    focus: state.focus,
    setFocus,
    focusChips,
    questions: state.questions,
    selections: state.selections,
    result: state.result,
    generating,
    checking,
    error,
    outOfQuestions,
    canCheck,
    selectOption,
    generate,
    checkAnswers,
    resetAnswers,
  };
}

export type PracticeQuizState = ReturnType<typeof usePracticeQuiz>;
