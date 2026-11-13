// Every shell lab the desktop app offers, in the order a learner should meet them. To add a lab,
// write its file next to this one and add it here; tests/shell-labs.test.ts validates every entry
// and tests/shell-labs.integration.test.ts proves each one against a real machine.
import type { ShellLab } from '../domain/shell-labs';
import { linux101 } from './linux-101';
import { linux102 } from './linux-102';
import { linuxBasicCommands1 } from './linux-basic-commands-1';
import { linuxBasicCommands2 } from './linux-basic-commands-2';
import { linuxCoreConcepts1 } from './linux-core-concepts-1';
import { linuxCoreConcepts2 } from './linux-core-concepts-2';
import { linuxBashPrompt } from './linux-bash-prompt';
import { linuxUsersAndPermissions } from './linux-users-and-permissions';
import { linuxAccountManagement } from './linux-account-management';
import { linuxOwnershipAndAccess } from './linux-ownership-and-access';
import { linuxSshAndScp } from './linux-ssh-and-scp';
import { linuxDns } from './linux-dns';
import { linuxTroubleshooting } from './linux-troubleshooting';
import { linuxViEditor } from './linux-vi-editor';
import { linuxCron } from './linux-cron';
import { linuxPackageManagement } from './linux-package-management';
import { linuxRpmYum } from './linux-rpm-yum';
import { linuxNetworking } from './linux-networking';
import { linuxIptables } from './linux-iptables';

import { withLessons } from './lessons';

export const SHELL_LABS: readonly ShellLab[] = [
  // Beginner
  linux101,
  linux102,
  linuxBasicCommands1,
  linuxBasicCommands2,
  linuxCoreConcepts1,
  linuxCoreConcepts2,
  linuxBashPrompt,
  linuxViEditor,
  linuxUsersAndPermissions,
  linuxAccountManagement,
  linuxOwnershipAndAccess,
  linuxSshAndScp,
  linuxCron,
  linuxPackageManagement,
  linuxRpmYum,
  // Intermediate
  linuxNetworking,
  linuxDns,
  linuxIptables,
  linuxTroubleshooting,
].map(withLessons);

export function getShellLab(slug: unknown): ShellLab | null {
  return typeof slug === 'string' ? (SHELL_LABS.find((lab) => lab.slug === slug) ?? null) : null;
}
