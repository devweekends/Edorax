import type { QuizChapterState } from "@/shared/api/blocks";
import { PredictComponent } from "@/blocks/predict/Component";
import { CodeExerciseComponent } from "@/blocks/code/Component";
import { OpenQuestionComponent } from "@/blocks/open-question/Component";
import { QuizComponent } from "@/blocks/quiz/Component";
import { getSessionUser } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { QuizChapterSessionClient } from "./quiz-chapter-session-client";
import { SecureExamLaunch } from "./secure-exam-launch";
import type { IntegrityMode } from "@/shared/api/integrity";

export async function QuizChapterWizard({
  chapterId,
  chapterTitle,
  nextHref,
  nextLocked,
  canMarkComplete,
  chapterComplete,
  integrityMode = "STANDARD",
}: {
  chapterId: string;
  chapterTitle: string;
  nextHref?: string;
  nextLocked: boolean;
  canMarkComplete: boolean;
  chapterComplete: boolean;
  integrityMode?: IntegrityMode;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  if (integrityMode === "SECURE") {
    return <SecureExamLaunch chapterId={chapterId} />;
  }

  const state = await serverApiFetch<QuizChapterState>(
    `/api/v1/chapters/${encodeURIComponent(chapterId)}/quiz`,
  );
  if (state.steps.length === 0)
    return (
      <p role="status" className="py-6 text-base">
        This quiz isn&apos;t ready yet. Please let your mentor know so they can
        add the questions.
      </p>
    );

  const draftStoragePrefix = `buildment:quiz-draft:${user.id}:${chapterId}`;

  return (
    <QuizChapterSessionClient
      chapterId={chapterId}
      chapterTitle={chapterTitle}
      quizBlockIds={state.blockIds}
      stepIds={state.steps.map((step) => step.id)}
      individualActivityCount={
        state.steps.filter((step) => step.type !== "QUIZ").length
      }
      draftStoragePrefix={draftStoragePrefix}
      initialAnswers={state.initialAnswers}
      initialScoreSummary={state.initialScoreSummary}
      initialBlockGrades={state.initialBlockGrades}
      initialAssessment={state.assessment}
      nextHref={nextHref}
      nextLocked={nextLocked}
      canMarkComplete={canMarkComplete}
      chapterComplete={chapterComplete}
    >
      {state.steps.map((step) =>
        step.type === "OPEN_QUESTION" ? (
          <OpenQuestionComponent key={step.id} id={step.id} />
        ) : step.type === "PREDICT" ? (
          <PredictComponent key={step.id} id={step.id} />
        ) : step.type === "CODE" ? (
          <CodeExerciseComponent key={step.id} id={step.id} />
        ) : (
          <QuizComponent
            key={step.id}
            id={step.id}
            presentation="wizard"
            draftStoragePrefix={draftStoragePrefix}
          />
        ),
      )}
    </QuizChapterSessionClient>
  );
}
