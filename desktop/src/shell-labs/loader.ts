// Shell labs are content, and Edorax Core owns them (labs/shell/*.yaml there). The app reads
// them from a folder: this file turns that folder into validated labs. A lab that fails
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
 * Where the labs are. In order: EDORAX_LABS_DIR (for testing a Core checkout directly), the folder
 * packaged with the app, then desktop/labs/shell (copied from Core by `pnpm sync:labs`).
 */
export function shellLabsDir(): string {
  const candidates = [
    process.env.EDORAX_LABS_DIR,
    (process as { resourcesPath?: string }).resourcesPath &&
      path.join(
        (process as { resourcesPath?: string }).resourcesPath!,
        'labs',
        'shell',
      ),
    path.resolve(__dirname, '..', '..', 'labs', 'shell'),
    path.resolve(__dirname, '..', 'labs', 'shell'),
  ].filter((item): item is string => Boolean(item));
  return (
    candidates.find((dir) => fs.existsSync(path.join(dir, 'index.yaml'))) ??
    candidates[candidates.length - 1]
  );
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
