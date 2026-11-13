import type { ShellLab } from '../domain/shell-labs';

export const linuxUsersAndPermissions: ShellLab = {
  slug: 'linux-users-and-permissions',
  topic: 'linux',
  title: 'Users, groups and permissions',
  summary: 'Add a new developer, lock down a shared folder, fix a deploy script and free a full log, on a real Linux server.',
  scenario:
    'You have just joined the team that runs server1. Sara, a new developer, starts today. The shared project folder is open to everyone, the deploy script will not run and a log is filling the disk. Fix the server before standup. You are root on this machine, and nothing you do here touches your computer.',
  minutes: 20,
  machine: { name: 'server1', image: 'ubuntu:24.04' },
  setup: `set -e
mkdir -p /srv/project /opt/app /var/log/app
echo "Shared notes for the team." > /srv/project/README.md
chmod 777 /srv/project
cat > /opt/app/deploy.sh <<'SCRIPT'
#!/bin/bash
echo "Deployed version $(cat /opt/app/VERSION)"
SCRIPT
echo 1.4.2 > /opt/app/VERSION
chmod 666 /opt/app/deploy.sh
head -c 2097152 /dev/zero > /var/log/app/app.log
head -c 40960 /dev/zero > /var/log/app/access.log
head -c 8192 /dev/zero > /var/log/app/error.log
`,
  steps: [
    {
      id: 'user-and-group',
      goal: 'Create the group devs and the user sara, with a home folder, in that group.',
      body: 'Every person on a shared server gets their own account. Groups decide what a set of people can share. Sara needs an account, a home folder and membership of devs.',
      hints: [
        'Create the group first, then the user. Two commands.',
        'Use `groupadd` for the group. `useradd` makes the user: `-m` creates the home folder and `-G` adds extra groups.',
        'For a user omar in a group ops it would be: `groupadd ops` then `useradd -m -s /bin/bash -G ops omar`. Check with `id omar`.',
      ],
      checks: [
        { id: 'group', label: 'Group devs exists', run: 'getent group devs >/dev/null', fail: 'There is no group called devs yet.' },
        { id: 'user', label: 'User sara exists with a home folder', run: 'id sara >/dev/null 2>&1 && [ -d /home/sara ]', fail: 'There is no user sara with a folder in /home yet. Did you use -m?' },
        { id: 'member', label: 'sara is in devs', run: "id -nG sara | tr ' ' '\\n' | grep -qx devs", fail: 'sara exists but is not in the devs group.' },
      ],
      solution: 'groupadd devs && useradd -m -s /bin/bash -G devs sara',
    },
    {
      id: 'shared-folder',
      goal: 'Make /srv/project belong to devs, usable by owner and group only, with new files joining devs automatically.',
      body: 'Right now anyone on the server can read and change /srv/project. It should be the team folder: the devs group can do everything, other users can do nothing, and files created inside should belong to devs, not to whoever made them.',
      hints: [
        'Three things to change: the group that owns the folder, the permission bits, and the special bit that makes new files inherit the group.',
        'Change the group with `chgrp`. Set permissions with `chmod`: 7 is rwx, 0 is nothing. The setgid bit on a folder is the leading 2 in a four digit mode.',
        'For a folder /data/reports shared by ops: `chgrp ops /data/reports` then `chmod 2770 /data/reports`. Check with `ls -ld /data/reports`, which shows drwxrws---.',
      ],
      checks: [
        { id: 'group-owner', label: 'Owned by group devs', run: '[ "$(stat -c %G /srv/project)" = devs ]', fail: 'The folder still belongs to another group.' },
        { id: 'others', label: 'Other users have no access', run: 'stat -c %A /srv/project | grep -q -- "---$"', fail: 'Users outside the group can still read, write or enter the folder.' },
        { id: 'setgid', label: 'New files join devs', run: '[ -g /srv/project ]', fail: 'The setgid bit is not set, so new files will not belong to devs.' },
        { id: 'sara-writes', label: 'sara can create files there', run: "su -s /bin/bash sara -c 'touch /srv/project/.edorax-check' 2>/dev/null && [ \"$(stat -c %G /srv/project/.edorax-check)\" = devs ]; status=$?; rm -f /srv/project/.edorax-check; exit $status", fail: 'sara cannot create a file in the folder, or the file did not join devs. Finish the first step, and give the group rwx.' },
      ],
      solution: 'chgrp devs /srv/project && chmod 2770 /srv/project',
    },
    {
      id: 'deploy-script',
      goal: 'Make /opt/app/deploy.sh runnable, stop everyone being able to edit it, then run it.',
      body: 'The deploy script fails with "Permission denied". Worse, any user can change it, so anyone could make the next deploy do something else. It should run, and only its owner should be able to edit it.',
      hints: [
        'Look at it first with `ls -l /opt/app/deploy.sh`. Which letters are missing and which are too many?',
        'A script needs the x bit to run. A common mode for scripts is 755: the owner can read, write and run it, everyone else can only read and run it.',
        'For /usr/local/bin/backup.sh: `chmod 755 /usr/local/bin/backup.sh` then run it with `/usr/local/bin/backup.sh`.',
      ],
      checks: [
        { id: 'runs', label: 'The script runs', run: '[ -x /opt/app/deploy.sh ] && /opt/app/deploy.sh | grep -q "Deployed version 1.4.2"', fail: 'The script still cannot run. It needs the execute bit.' },
        { id: 'not-writable', label: 'Only the owner can edit it', run: '[ -z "$(find /opt/app/deploy.sh -perm /022)" ]', fail: 'The group or other users can still change the script.' },
      ],
      solution: 'chmod 755 /opt/app/deploy.sh && /opt/app/deploy.sh',
    },
    {
      id: 'full-log',
      goal: 'Find the biggest file in /var/log/app and empty it without deleting it.',
      body: 'The disk is filling up. One log in /var/log/app is far bigger than the others. Deleting a log a service still has open does not free the space, so empty the file and keep it in place. Leave the other logs alone.',
      hints: [
        'First find out which file is the big one. `ls` can sort by size.',
        '`ls -lhS /var/log/app` lists the biggest first. `truncate -s 0 FILE` empties a file and keeps it.',
        'For /var/log/web: `ls -lhS /var/log/web` shows big.log on top, then `truncate -s 0 /var/log/web/big.log`. `ls -l` again shows it at 0 bytes.',
      ],
      checks: [
        { id: 'kept', label: 'app.log still exists', run: '[ -f /var/log/app/app.log ]', fail: 'app.log is gone. Deleting a log does not free space while a service holds it open. Reset the lab to get it back, then empty it instead.' },
        { id: 'empty', label: 'app.log is empty', run: '[ ! -s /var/log/app/app.log ]', fail: 'The biggest log still has data in it.' },
        { id: 'others', label: 'The other logs are untouched', run: '[ "$(stat -c %s /var/log/app/access.log 2>/dev/null)" = 40960 ] && [ "$(stat -c %s /var/log/app/error.log 2>/dev/null)" = 8192 ]', fail: 'access.log or error.log was changed. Only the biggest file should be emptied.' },
      ],
      solution: 'truncate -s 0 /var/log/app/app.log',
    },
  ],
};
