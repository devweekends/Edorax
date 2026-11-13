// Copies the shell labs from an Edorax Core checkout into desktop/labs/shell, the folder the app
// reads and packages. Usage: EDORAX_CORE_DIR=/path/to/Edorax-core pnpm sync:labs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const core = process.env.EDORAX_CORE_DIR || process.argv[2];
if (!core) {
  console.error(
    'Set EDORAX_CORE_DIR to your Edorax Core checkout, or pass its path.',
  );
  process.exit(1);
}
const from = path.join(core, 'labs', 'shell');
const to = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'labs',
  'shell',
);
if (!fs.existsSync(path.join(from, 'index.yaml'))) {
  console.error(`No labs found at ${from}.`);
  process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
let count = 0;
for (const file of fs
  .readdirSync(from)
  .filter((name) => name.endsWith('.yaml'))) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
  count += 1;
}
console.log(`copied ${count} files from ${from} to ${to}`);
