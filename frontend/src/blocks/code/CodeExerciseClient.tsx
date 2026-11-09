"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { apiFetch } from "@/lib/api-client";
import { playFeedback } from "@/lib/sound-feedback";
import { CodeExerciseClient as SharedCodeExerciseClient } from "@buildment/learning-ui/blocks/exercises/CodeExerciseClient";

type Props = ComponentProps<typeof SharedCodeExerciseClient>;
type CheckResult = { isCorrect: boolean | null; failedTestName?: string; errorMessage?: string; explanation?: string; solution?: string };

export function CodeExerciseClient(props: Props) {
  const router = useRouter();
  return (
    <SharedCodeExerciseClient
      {...props}
      onRespond={(payload: Record<string, unknown>) => apiFetch<CheckResult>(`/api/v1/blocks/${props.id}/respond`, { method: "POST", json: payload })}
      onComplete={() => router.refresh()}
      onFeedback={playFeedback}
    />
  );
}
