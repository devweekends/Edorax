// Copies only what the Theia IDE needs at runtime into .ide-bundle/ide, which Forge ships as a
// resource. The production build bundles the backend (lib/backend/main.js, with its native
// binaries in lib/backend/native) and the frontend (lib/frontend), so ide/node_modules, src-gen,
// the build scripts and the lockfiles are not needed in the installed app.
import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(desktop, 'ide');
const target = path.join(desktop, '.ide-bundle', 'ide');

const keep = ['lib', 'plugins', 'package.json'];
// Source maps are only useful when debugging the IDE itself.
const skip = (file) => file.endsWith('.map');

export async function stageIde() {
  await stat(path.join(source, 'lib', 'backend', 'main.js')).catch(() => {
    throw new Error('The IDE is not built. Run `pnpm ide:setup` (or `pnpm ide:build`) first.');
  });
  await rm(target, { recursive: true, force: true });
  for (const entry of keep) {
    await cp(path.join(source, entry), path.join(target, entry), {
      recursive: true,
      filter: (file) => !skip(file),
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await stageIde();
  console.log(`Staged IDE runtime at ${target}`);
}
