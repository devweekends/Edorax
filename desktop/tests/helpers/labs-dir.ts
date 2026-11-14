// Where the shell-lab tests read their labs from.
//   1. EDORAX_LABS_DIR, when it has an index.yaml (a Core checkout);
//   2. else desktop/labs/shell, when it has an index.yaml (a developer ran `pnpm sync:labs`);
//   3. else tests/fixtures/shell-labs: made-up labs, so tests run on a clean checkout and in CI.
// The real labs are private. Tests about real content run only when `realLabsPresent` is true.
import fs from 'node:fs';
import path from 'node:path';

const hasIndex = (dir: string | undefined): dir is string => Boolean(dir) && fs.existsSync(path.join(dir as string, 'index.yaml'));

export const FIXTURE_LABS_DIR = path.resolve(__dirname, '..', 'fixtures', 'shell-labs');
const real = [process.env.EDORAX_LABS_DIR, path.resolve(__dirname, '..', '..', 'labs', 'shell')].find(hasIndex);

/** The folder with index.yaml and one YAML file per lab that the tests should use. */
export const LABS_DIR: string = real ?? FIXTURE_LABS_DIR;
/** True when LABS_DIR holds the real labs, not the made-up ones. */
export const realLabsPresent: boolean = real !== undefined;
