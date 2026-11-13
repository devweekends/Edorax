// A lesson is what a step teaches before it asks: the idea in a few short paragraphs, then the
// commands in general form. Commands use CAPITAL placeholders and never spell out a step's answer;
// tests/shell-labs.test.ts fails if any lesson gives one away.

export type Lesson = {
  /** Short paragraphs: what the idea is, how it works, why it matters. `code` spans allowed. */
  learn: string[];
  /** [general form, what it does]. Add "key" for keys pressed inside a program (vi, history search): they get no Type it button. */
  commands: [command: string, meaning: string, kind?: "key"][];
};

/** Lessons for one lab, by step id. */
export type LabLessons = Record<string, Lesson>;
