// The parts of a shell lab the browser runtime reads. The full contract lives in the desktop app
// (desktop/src/domain/shell-labs.ts) and in Edorax Core (labs/README.md).

export interface BrowserLabCheck {
  id: string;
  label: string;
  /** A bash script run as root inside the machine. Exit 0 passes. */
  run: string;
  fail: string;
}

export interface BrowserLabCommand {
  command: string;
  meaning: string;
  key?: boolean;
  example?: string;
  output?: string;
}

export interface BrowserLabQuiz {
  question: string;
  show?: string;
  options: string[];
  answer: number;
  why: string;
}

export interface BrowserLabStep {
  id: string;
  goal: string;
  body: string;
  about?: string;
  expected?: string;
  learn?: string[];
  commands?: BrowserLabCommand[];
  hints: string[];
  checks?: BrowserLabCheck[];
  quiz?: BrowserLabQuiz;
  win?: string;
  after?: string;
  mistakes?: { when: string; say: string }[];
  solution?: string;
}

export interface BrowserLab {
  slug: string;
  title: string;
  machine: { name: string; memoryMb?: number };
  setup?: string;
  boot?: string;
  steps: BrowserLabStep[];
}

export interface BrowserLabCheckResult {
  id: string;
  label: string;
  passed: boolean;
  message: string;
}

export interface BrowserLabStepResult {
  stepId: string;
  passed: boolean;
  checks: BrowserLabCheckResult[];
  /** What went wrong, when the machine matches one of the step's listed mistakes. */
  mistake?: string;
}
