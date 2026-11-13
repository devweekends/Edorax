// Every shell lab the desktop app offers. To add a lab, write its file next to
// this one and add it here; tests/shell-labs.test.ts validates every entry.
import type { ShellLab } from '../domain/shell-labs';
import { linuxUsersAndPermissions } from './linux-users-and-permissions';
import { linuxOwnershipAndAccess } from './linux-ownership-and-access';
import { linuxDns } from './linux-dns';
import { linuxSshAndScp } from './linux-ssh-and-scp';

export const SHELL_LABS: readonly ShellLab[] = [linuxUsersAndPermissions, linuxOwnershipAndAccess, linuxDns, linuxSshAndScp];

export function getShellLab(slug: unknown): ShellLab | null {
  return typeof slug === 'string' ? (SHELL_LABS.find((lab) => lab.slug === slug) ?? null) : null;
}
