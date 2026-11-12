import { playFeedback } from '../../../lib/sound-feedback';
import { useEffect, useRef, useState } from 'react';
import type { QuizChapterState } from '../../../../../server/src/shared/api/blocks';
import { useQuizIntegrity } from '@buildment/learning-ui/lib/integrity/use-quiz-integrity';
import { integrityTransport } from './integrity-transport';
import { IntegrityNotice } from './IntegrityNotice';
import { useDotVoice } from '../../mascot/DotVoice';
import { Exercise } from '../Exercise';

export function QuizSession({
  chapterId,
  state,
  complete,
  onSaved,
  onExit,
}: {
  chapterId: string;
  state: QuizChapterState;
  complete: boolean;
  onSaved: () => void;
  onExit: () => void;
}) {
  const [screens, setScreens] = useState(1);
  const steps = state.steps.length
    ? state.steps
    : state.blockIds.map((id) => ({ id, type: 'QUIZ' as const }));
  const [answers, setAnswers] = useState(state.initialAnswers);
  const [score, setScore] = useState(state.initialScoreSummary);
  const [grades, setGrades] = useState(state.initialBlockGrades);
  const [index, setIndex] = useState(0);
  const [retryMissed, setRetryMissed] = useState(
    Boolean(
      state.initialScoreSummary &&
      state.initialScoreSummary.score < state.initialScoreSummary.maxScore,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const changed = useRef(new Set<string>());
  const root = useRef<HTMLElement>(null);
  const perfect = Boolean(
    score && score.maxScore > 0 && score.score === score.maxScore,
  );
  const individualCount = steps.filter((step) => step.type !== 'QUIZ').length;
  const missed = steps.filter(
    (step) => step.type === 'QUIZ' && grades[step.id]?.isCorrect !== true,
  );
  const visible = retryMissed && !perfect && missed.length ? missed : steps;
  const position = Math.min(index, visible.length - 1);
  const current = visible[position];
  const integrity = useQuizIntegrity({
    chapterId,
    enabled:
      steps.length > 0 && !complete && !(perfect && individualCount === 0),
    rootRef: root,
    currentBlockId: current?.id || null,
    transport: integrityTransport,
  });
  useEffect(() => {
    const fullscreen = () => {
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => undefined);
    };
    window.addEventListener('buildment:quiz-focus', fullscreen);
    return () => {
      window.removeEventListener('buildment:quiz-focus', fullscreen);
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const { track: trackDot, setQuiet } = useDotVoice();
  useEffect(() => {
    // Quiz mode: full screen, on top, no screenshots, copy blocked, and one screen only.
    setQuiet(true);
    void window.buildment.quizLockdown(true).then((result) => setScreens(result.screens));
    const unsubscribe = window.buildment.onQuizScreens((result) => setScreens(result.screens));
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      setQuiet(false);
      unsubscribe();
      document.body.style.userSelect = previous;
      void window.buildment.quizLockdown(false);
    };
  }, []);
  async function exitQuiz() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    await window.buildment.quizLockdown(false);
    onExit();
  }
  async function submit() {
    if (busy || perfect) return;
    const payload = state.blockIds.map((blockId) => ({
      blockId,
      selected:
        grades[blockId]?.isCorrect === true
          ? grades[blockId].selected
          : answers[blockId] || [],
    }));
    const unanswered = payload.filter(
      (answer) => !answer.selected.length,
    ).length;
    if (
      unanswered &&
      !integrity.withoutFlags(() =>
        window.confirm(
          unanswered +
            ' questions are unanswered. Submit anyway? Unanswered questions will be marked incorrect.',
        ),
      )
    )
      return;
    setBusy(true);
    setError('');
    integrity.checkPace(score ? [...changed.current] : state.blockIds);
    try {
      const result = await window.buildment.learning.submitQuiz(
        chapterId,
        payload,
      );
      if (!result.ok) {
        playFeedback('error');
        setError(result.message);
        return;
      }
      void trackDot({ type: 'quiz_submitted', chapterId });
      const data = result.data as {
        score: number;
        maxScore: number;
        questions: number;
        assessment?: { passed: boolean };
        grades?: Array<{
          blockId: string;
          selected: string[];
          isCorrect: boolean | null;
        }>;
      };
      if (
        data.assessment?.passed ||
        (data.maxScore > 0 && data.score === data.maxScore)
      )
        playFeedback('celebration');
      else if (data.score <= 0) playFeedback('error');
      setScore({
        score: data.score,
        maxScore: data.maxScore,
        questions: data.questions,
      });
      const nextGrades = { ...grades };
      for (const grade of data.grades || [])
        nextGrades[grade.blockId] = {
          selected: grade.selected,
          isCorrect: grade.isCorrect,
        };
      // Refresh from the server also restores explanations and saved correct answers.
      const saved = await window.buildment.learning.quiz(chapterId);
      if (saved.ok)
        Object.assign(
          nextGrades,
          (saved.data as QuizChapterState).initialBlockGrades,
        );
      setGrades(nextGrades);
      changed.current.clear();
      const allCorrect = data.maxScore > 0 && data.score === data.maxScore;
      setRetryMissed(!allCorrect);
      setIndex(0);
      setRevision((value) => value + 1);
      if (allCorrect && individualCount === 0) integrity.finish();
      else if (!allCorrect) void integrity.nextAttempt();
      onSaved();
    } catch {
      playFeedback('error');
      setError(
        'Could not submit your quiz. Your answers are still here. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!steps.length) return <p>No quiz questions are available yet.</p>;
  return (
    <section ref={root} aria-label="Quiz session" className="mt-7">
      <div className="mb-5 flex items-center justify-between text-sm">
        <span className="font-medium">
          Question {position + 1} of {visible.length}
          {retryMissed && !perfect ? ' to retry' : ''}
        </span>
        <span className="text-muted-foreground">
          {Math.round(((position + 1) / visible.length) * 100)}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={1}
        aria-valuemax={visible.length}
        aria-valuenow={position + 1}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: ((position + 1) / visible.length) * 100 + '%' }}
        />
      </div>
      {screens > 1 && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="quiz-screens-title"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/95 p-6 text-center"
        >
          <div className="max-w-md rounded-2xl border border-border bg-card p-7">
            <h2 id="quiz-screens-title" className="text-2xl font-semibold">Turn off your other screens</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Quizzes run on one screen only. Disconnect or turn off the other displays to continue.
            </p>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => void exitQuiz()}
        className="fixed right-4 top-4 z-[75] rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted"
      >
        Exit quiz
      </button>
      <IntegrityNotice integrity={integrity} />
      {individualCount > 0 && (
        <p className="text-sm leading-6 text-muted-foreground">
          Written answers, predictions, and code exercises are submitted
          individually. The quiz score covers multiple-choice questions.
        </p>
      )}
      {steps.map((step) => (
        <div
          hidden={step.id !== current?.id}
          data-integrity-step={step.id}
          key={step.id + ':' + revision}
        >
          <Exercise
            id={step.id}
            onSaved={onSaved}
            quizAnswers={answers}
            onQuizAnswer={(id, selected) => {
              changed.current.add(id);
              setAnswers((previous) => ({ ...previous, [id]: selected }));
            }}
          />
        </div>
      ))}
      {score && (
        <div
          role="status"
          className="my-5 rounded-xl border border-border bg-secondary/40 p-5"
        >
          <p className="text-lg font-semibold">
            Quiz score: {score.score} / {score.maxScore}
          </p>
          <p className="mt-1 text-sm">
            {perfect
              ? 'All multiple-choice answers are correct.'
              : missed.length +
                ' questions to retry. Correct answers are kept.'}
          </p>
          {!perfect && (
            <button
              className="mt-3 text-sm underline"
              onClick={() => {
                setRetryMissed(!retryMissed);
                setIndex(0);
              }}
            >
              {retryMissed ? 'Review all questions' : 'Retry missed questions'}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="my-4 rounded-lg border border-border p-3">
          {error}
        </p>
      )}
      <div className="mt-8 flex justify-between gap-3 border-t border-border pt-5">
        <button
          disabled={busy || position <= 0}
          onClick={() => setIndex(position - 1)}
          className="rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-50"
        >
          Previous question
        </button>
        {position < visible.length - 1 ? (
          <button
            disabled={busy}
            onClick={() => setIndex(position + 1)}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground"
          >
            Next question
          </button>
        ) : state.blockIds.length > 0 ? (
          <button
            disabled={busy || perfect}
            onClick={() => void submit()}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? 'Submitting…'
              : perfect
                ? 'Quiz complete'
                : score
                  ? 'Submit again'
                  : 'Submit quiz'}
          </button>
        ) : (
          <p className="text-sm">Submit each activity above.</p>
        )}
      </div>
    </section>
  );
}
