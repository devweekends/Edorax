import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ide = fileURLToPath(new URL('../ide', import.meta.url));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(fileURLToPath(new URL('../ide/lib', import.meta.url)))) {
  run('pnpm', ['--dir', ide, 'install'], root);
  run('pnpm', ['--dir', ide, 'run', 'build'], root);
}
run('node', ['scripts/prepare-pty.mjs'], root);
