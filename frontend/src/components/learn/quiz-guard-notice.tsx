"use client";

/** A short message that appears when the learner tries something the quiz does not allow. */
export function QuizGuardNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4"
    >
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-base font-bold text-card-foreground shadow-lg">
        {text}
      </p>
    </div>
  );
}
