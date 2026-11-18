import type { DotMood } from "@buildment/learning-ui/brand-dot";

// The try-it sequence on the landing page. Each live step unlocks the next one on a
// right answer. "soon" steps are slots for areas that are not built yet (puzzles,
// voice tutors): they show in the progress list and get a component when they ship.

export type TryStepId = "question" | "order" | "linux" | "visual" | "puzzle" | "voice";

export interface TryStep {
  id: TryStepId;
  /** Short label for the progress list. */
  label: string;
  /** Which part of Edorax this step is a taste of. */
  area: string;
  status: "live" | "soon";
  /** What Dot says while the step is open. */
  dotLine: string;
  dotMood: DotMood;
  /** Text of the button that opens this step from the one before. */
  nextLabel: string;
}

export const TRY_STEPS: readonly TryStep[] = [
  { id: "question", label: "Question", area: "Courses", status: "live", dotLine: "Take a guess. No account needed.", dotMood: "think", nextLabel: "" },
  { id: "order", label: "Order", area: "Courses", status: "live", dotLine: "Now the whole trip. Drag them into order.", dotMood: "determined", nextLabel: "Next: put it in order" },
  { id: "linux", label: "Linux lab", area: "Shell labs", status: "live", dotLine: "Three commands. You can do this.", dotMood: "determined", nextLabel: "Next: a quick Linux lab" },
  { id: "visual", label: "Visual lab", area: "Visual labs", status: "live", dotLine: "Build it, then press Run.", dotMood: "think", nextLabel: "Next: build a system" },
  { id: "puzzle", label: "Puzzle", area: "Puzzles", status: "soon", dotLine: "", dotMood: "happy", nextLabel: "" },
  { id: "voice", label: "Voice tutor", area: "Voice tutors", status: "soon", dotLine: "", dotMood: "happy", nextLabel: "" },
];

export const LIVE_STEPS = TRY_STEPS.filter((step) => step.status === "live");
