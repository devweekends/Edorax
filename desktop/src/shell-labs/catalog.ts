// The shell labs the desktop app offers, in the order a learner should meet them. The labs are
// content owned by Edorax Core (labs/shell/*.yaml); this file loads them once at start-up.
// To add or change a lab, edit Core, then run `pnpm sync:labs`. See loader.ts for where the app looks.
import type { ShellLab } from '../domain/shell-labs';
import { loadShellLabs } from './loader';

const loaded = loadShellLabs();
for (const message of loaded.errors) console.error(`[shell-labs] ${message}`);

export const SHELL_LABS: readonly ShellLab[] = loaded.labs;
export const SHELL_LAB_ERRORS: readonly string[] = loaded.errors;

export function getShellLab(slug: unknown): ShellLab | null {
  return typeof slug === 'string' ? (SHELL_LABS.find((lab) => lab.slug === slug) ?? null) : null;
}
