"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { wordOverlap } from "@/lib/integrity/overlap";
import type {
  IntegrityOverview,
  IntegritySimilarPair,
  IntegrityWrittenAnswers,
} from "@/shared/api/integrity";

// Compare two learners' written answers by name. Pick a quiz, then two learners, and read their
// answers side by side. The list of most similar pairs is a shortcut into the same view.
// Everything shown comes from submitted answers. Similar wording can be honest, so this only points.

const selectClass = "h-9 min-w-48 rounded-md border bg-background px-2 text-sm";

export function LearnerCompare({
  quizChapters,
}: {
  quizChapters: IntegrityOverview["quizChapters"];
}) {
  const [chapterId, setChapterId] = useState(
    quizChapters.length === 1 ? quizChapters[0]!.id : "",
  );
  const [data, setData] = useState<IntegrityWrittenAnswers | null>(null);
  const [pairs, setPairs] = useState<IntegritySimilarPair[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setPairs([]);
    setA("");
    setB("");
    setError(null);
    if (!chapterId) return;
    let cancelled = false;
    setBusy(true);
    const base = `/api/v1/teach/chapters/${encodeURIComponent(chapterId)}/integrity`;
    Promise.all([
      apiFetch<IntegrityWrittenAnswers>(`${base}/answers`),
      apiFetch<IntegritySimilarPair[]>(`${base}/similarity`),
    ])
      .then(([answers, similar]) => {
        if (cancelled) return;
        setData(answers);
        setPairs(similar);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the answers.",
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const name = (userId: string) =>
    data?.learners.find((learner) => learner.userId === userId)?.name ??
    "Learner";
  const rows = useMemo(() => {
    if (!data || !a || !b) return [];
    return data.questions.map((question) => {
      const first =
        question.answers.find((answer) => answer.userId === a)?.text ?? null;
      const second =
        question.answers.find((answer) => answer.userId === b)?.text ?? null;
      return {
        number: question.number,
        blockId: question.blockId,
        first,
        second,
        overlap: first && second ? wordOverlap(first, second) : null,
      };
    });
  }, [data, a, b]);

  return (
    <div className="space-y-4">
      {quizChapters.length ? (
        <label className="block text-sm font-medium">
          1. Choose a quiz that learners have answered
          <select
            value={chapterId}
            onChange={(event) => setChapterId(event.target.value)}
            className={`${selectClass} mt-1 block`}
          >
            <option value="">Select a quiz…</option>
            {quizChapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title} · {chapter.learners}{" "}
                {chapter.learners === 1 ? "learner" : "learners"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          No learner has submitted a written answer in this course yet. Quizzes
          appear here as soon as one has, with the number of learners.
        </p>
      )}
      {busy ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading learners and answers…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {data ? (
        data.learners.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            {data.learners.length === 0
              ? "No learner has submitted a written answer in this quiz yet."
              : "Only one learner has submitted written answers so far. Two are needed to compare."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm font-medium">
                2. Learner A
                <select
                  value={a}
                  onChange={(event) => setA(event.target.value)}
                  className={`${selectClass} mt-1 block`}
                >
                  <option value="">Select a learner…</option>
                  {data.learners
                    .filter((learner) => learner.userId !== b)
                    .map((learner) => (
                      <option key={learner.userId} value={learner.userId}>
                        {learner.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                3. Learner B
                <select
                  value={b}
                  onChange={(event) => setB(event.target.value)}
                  className={`${selectClass} mt-1 block`}
                >
                  <option value="">Select a learner…</option>
                  {data.learners
                    .filter((learner) => learner.userId !== a)
                    .map((learner) => (
                      <option key={learner.userId} value={learner.userId}>
                        {learner.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {pairs.length ? (
              <div>
                <p className="text-sm font-medium">Most similar pairs</p>
                <ul className="mt-2 space-y-2">
                  {pairs.map((pair) => (
                    <li
                      key={`${pair.blockId}:${pair.learners[0].userId}:${pair.learners[1].userId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm"
                    >
                      <span>
                        <span className="font-medium">
                          {pair.learners[0].name}
                        </span>{" "}
                        and{" "}
                        <span className="font-medium">
                          {pair.learners[1].name}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {Math.round(pair.score * 100)}% alike (
                          {pair.method === "embedding"
                            ? "meaning"
                            : "word overlap"}
                          )
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setA(pair.learners[0].userId);
                          setB(pair.learners[1].userId);
                        }}
                      >
                        Compare
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No unusually similar pairs were found automatically. You can
                still pick any two learners above.
              </p>
            )}

            {a && b ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {name(a)} and {name(b)}
                </p>
                {rows.map((row) => (
                  <section
                    key={row.blockId}
                    className="rounded-xl border bg-background p-4"
                  >
                    <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                      Question {row.number}
                      <span className="text-xs font-normal text-muted-foreground">
                        {row.overlap === null
                          ? "One of them did not answer"
                          : `${Math.round(row.overlap * 100)}% shared wording`}
                      </span>
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        { who: name(a), text: row.first },
                        { who: name(b), text: row.second },
                      ].map((side) => (
                        <div
                          key={side.who}
                          className="rounded-lg border bg-muted/30 p-3"
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {side.who}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                            {side.text ?? "No answer submitted."}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </>
        )
      ) : null}
      <p className="text-xs text-muted-foreground">
        Similar wording can be honest. Read both answers before you decide
        anything.
      </p>
    </div>
  );
}
