// Every step's lesson, by lab slug then step id. The catalog joins them into the labs, and
// validation fails for any step without one, so a new lab cannot ship without teaching.
import type { ShellLab } from '../../domain/shell-labs';
import { ADMIN } from './admin';
import { CONCEPTS } from './concepts';
import { FOUNDATIONS } from './foundations';
import { NETWORKING } from './networking';
import { OPERATIONS } from './operations';
import type { LabLessons } from './types';

export const LESSONS: Readonly<Record<string, LabLessons>> = { ...FOUNDATIONS, ...CONCEPTS, ...ADMIN, ...OPERATIONS, ...NETWORKING };

/** The lab with each step's lesson and commands filled in from the lesson files. */
export function withLessons(lab: ShellLab): ShellLab {
  const lessons = LESSONS[lab.slug] ?? {};
  return {
    ...lab,
    steps: lab.steps.map((step) => {
      const lesson = lessons[step.id];
      if (!lesson) return step;
      return {
        ...step,
        learn: lesson.learn,
        commands: lesson.commands.map(([command, meaning, kind]) => ({ command, meaning, ...(kind === 'key' ? { key: true } : {}) })),
      };
    }),
  };
}
