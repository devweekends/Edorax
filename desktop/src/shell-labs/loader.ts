// Shell labs are content, and Edorax Core owns them (labs/shell/*.yaml there). The server hands them
// to the app; for development and tests this file also turns a folder of YAML into validated labs. A lab that fails
// validation is skipped and named in the error list, so one bad file cannot hide the others.
import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { validateShellLab, type ShellLab } from '../domain/shell-labs';

export interface LoadedShellLabs {
  labs: ShellLab[];
  /** Plain sentences about what could not be loaded. Empty when everything loaded. */
  errors: string[];
}

/**
 * The development folder of labs, or null when there is none: EDORAX_LABS_DIR (for testing a Core
 * checkout directly), else desktop/labs/shell (copied from Core by `pnpm sync:labs`). The installed
 * app has no such folder: its labs come from the server (see catalog.ts).
 */
export function devShellLabsDir(): string | null {
  const candidates = [
    process.env.EDORAX_LABS_DIR,
    path.resolve(__dirname, '..', '..', 'labs', 'shell'),
    path.resolve(__dirname, '..', 'labs', 'shell'),
  ].filter((item): item is string => Boolean(item));
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.yaml'))) ?? null;
}

/** The folder the loader reads by default, used by tests and tools. Falls back to a path that names the problem. */
export function shellLabsDir(): string {
  return devShellLabsDir() ?? path.resolve(__dirname, '..', '..', 'labs', 'shell');
}

/** A quiz step has no checks and no solution in the YAML or the server data: give the rest of the app empty ones. */
export function normalizeShellLab(lab: ShellLab): ShellLab {
  if (Array.isArray(lab?.steps))
    for (const step of lab.steps) {
      step.checks ??= [];
      step.solution ??= '';
    }
  return lab;
}

export function loadShellLabs(dir: string = shellLabsDir()): LoadedShellLabs {
  const labs: ShellLab[] = [];
  const errors: string[] = [];
  let slugs: string[];
  try {
    const index = loadYaml(
      fs.readFileSync(path.join(dir, 'index.yaml'), 'utf8'),
    ) as { labs?: unknown };
    if (
      !Array.isArray(index?.labs) ||
      index.labs.some((slug) => typeof slug !== 'string')
    )
      throw new Error('index.yaml needs a "labs" list of slugs');
    slugs = index.labs as string[];
  } catch (error) {
    return {
      labs,
      errors: [
        `Shell labs not found in ${dir}. Run "pnpm sync:labs" or set EDORAX_LABS_DIR. ${error instanceof Error ? error.message : ''}`.trim(),
      ],
    };
  }
  const seen = new Set<string>();
  for (const slug of slugs) {
    try {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
        throw new Error('not a valid slug');
      if (seen.has(slug)) throw new Error('listed twice in index.yaml');
      seen.add(slug);
      const lab = loadYaml(
        fs.readFileSync(path.join(dir, `${slug}.yaml`), 'utf8'),
      ) as ShellLab;
      if (lab?.slug !== slug)
        throw new Error(
          `the file says slug "${lab?.slug}", expected "${slug}"`,
        );
      normalizeShellLab(lab);
      const problems = validateShellLab(lab);
      if (problems.length) throw new Error(problems.join('; '));
      labs.push(lab);
    } catch (error) {
      errors.push(
        `Lab "${slug}" was not loaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { labs, errors };
}
