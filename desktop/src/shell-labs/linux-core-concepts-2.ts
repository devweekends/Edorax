import type { ShellLab } from '../domain/shell-labs';

// The logger keeps a deleted file open, so its contents live on only through /proc/PID/fd.
const LOGGER = String.raw`#!/bin/bash
exec 3> /var/tmp/payments.log
echo "2026-11-13 09:12 payment 4411 failed: card expired" >&3
echo "2026-11-13 09:15 payment 4412 ok" >&3
rm /var/tmp/payments.log
while true; do sleep 60; done
`;

export const linuxCoreConcepts2: ShellLab = {
  slug: 'linux-core-concepts-2',
  topic: 'linux',
  level: 'beginner',
  tags: ['Filesystem', 'Links', 'proc'],
  title: 'Core concepts 2: links, inodes and /proc',
  summary: 'Point an app at its current release with a symlink, share one file under two names, recover a deleted log from a running process and read the machine from /proc.',
  scenario:
    'files2 serves a small shop. A release switch is half done, a report must appear in two places without being copied twice, and someone deleted the payments log while the logger was still writing to it. Everything is in a file somewhere, even the running processes. You are root.',
  minutes: 60,
  machine: { name: 'files2', image: 'ubuntu:24.04' },
  setup: `set -e
mkdir -p /etc/shop/releases /srv/data /opt/logger
echo "version=1" > /etc/shop/releases/v1.conf
echo "version=2" > /etc/shop/releases/v2.conf
cp /etc/shop/releases/v1.conf /etc/shop/current.conf
printf 'month,total\\n2026-10,48210\\n' > /srv/data/report.csv
cat > /opt/logger/logger.sh <<'SCRIPT'
${LOGGER}SCRIPT
chmod 755 /opt/logger/logger.sh
nohup /opt/logger/logger.sh >/dev/null 2>&1 &
sleep 1
`,
  steps: [
    {
      id: 'symlink',
      goal: 'Make /etc/shop/current.conf a symbolic link to /etc/shop/releases/v2.conf.',
      body: 'A symbolic link is a small file that points to another path, like a shortcut. Releases are often switched this way: the app always reads `current.conf`, and moving the link changes what it gets. Right now current.conf is a plain copy of v1.',
      hints: [
        'Replace the copy with a link that points at v2.',
        '`ln -s TARGET LINKNAME` makes a symbolic link. `-f` replaces a file already at LINKNAME. `ls -l` shows a link with an arrow.',
        'For an app reading /etc/app/live.conf: `ln -sf /etc/app/releases/v5.conf /etc/app/live.conf`, then `ls -l /etc/app/live.conf` shows live.conf -> /etc/app/releases/v5.conf.',
      ],
      checks: [
        { id: 'is-link', label: 'current.conf is a symbolic link', run: '[ -L /etc/shop/current.conf ]', fail: 'current.conf is still a regular file, not a link.' },
        { id: 'to-v2', label: 'It points to v2', run: '[ "$(readlink -f /etc/shop/current.conf)" = /etc/shop/releases/v2.conf ] && grep -qx "version=2" /etc/shop/current.conf', fail: 'current.conf does not lead to /etc/shop/releases/v2.conf.' },
      ],
      solution: 'ln -sf /etc/shop/releases/v2.conf /etc/shop/current.conf',
    },
    {
      id: 'hardlink',
      goal: 'Make /srv/data/report-latest.csv a hard link to /srv/data/report.csv.',
      body: 'A file\'s data lives in an inode; a name is just an entry pointing at it. A hard link is a second name for the same inode, so both names are the same file: a change through one shows through the other, and the data stays until the last name is removed. `ls -i` shows inode numbers.',
      hints: [
        'Make a second name for the same file, not a copy and not a symbolic link.',
        '`ln TARGET NEWNAME` without -s makes a hard link. `ls -li` shows both names with the same inode number and a link count of 2.',
        'For /srv/a.txt: `ln /srv/a.txt /srv/b.txt`, then `ls -li /srv/a.txt /srv/b.txt` shows the same number in the first column.',
      ],
      checks: [
        { id: 'same-inode', label: 'Both names share one inode', run: '[ ! -L /srv/data/report-latest.csv ] && [ "$(stat -c %i /srv/data/report-latest.csv 2>/dev/null)" = "$(stat -c %i /srv/data/report.csv)" ]', fail: 'report-latest.csv is missing, is a symbolic link, or is a separate copy. It must be the same inode as report.csv.' },
      ],
      solution: 'ln /srv/data/report.csv /srv/data/report-latest.csv',
    },
    {
      id: 'recover',
      goal: 'Recover the deleted payments log into /root/payments-recovered.log.',
      body: 'Deleting a file removes its name. The data stays while any process still has the file open. The logger, `/opt/logger/logger.sh`, still holds `/var/tmp/payments.log` open, and every open file of a process appears under `/proc/PID/fd/`.',
      hints: [
        'Find the logger\'s PID, look at its open files in /proc, and copy the one marked deleted.',
        '`pgrep -f logger.sh` or `ps aux` gives the PID. `ls -l /proc/PID/fd` lists open files; the deleted one says (deleted). `cat` that fd into the new file.',
        'For a process 812 holding a deleted /var/log/app.log on fd 4: `ls -l /proc/812/fd` shows 4 -> /var/log/app.log (deleted), then `cat /proc/812/fd/4 > /root/app.log`.',
      ],
      checks: [{ id: 'recovered', label: 'The log is recovered with both payments', run: 'grep -q "payment 4411 failed: card expired" /root/payments-recovered.log 2>/dev/null && grep -q "payment 4412 ok" /root/payments-recovered.log', fail: '/root/payments-recovered.log is missing or does not hold the deleted log\'s lines.' }],
      solution: String.raw`pid=$(pgrep -f '^/bin/bash /opt/logger/logger.sh' | head -1); for fd in /proc/$pid/fd/*; do if readlink "$fd" | grep -q 'payments.log (deleted)'; then cat "$fd" > /root/payments-recovered.log; fi; done; [ -s /root/payments-recovered.log ]`,
    },
    {
      id: 'proc',
      goal: 'Write this machine\'s number of CPUs and its kernel version, one per line, into /root/system.txt.',
      body: '`/proc` is not on a disk: the kernel makes it up as you read it. `/proc/cpuinfo` describes each CPU and `/proc/version` names the running kernel. Tools such as `nproc` and `uname -r` read the same information.',
      hints: [
        'Two facts: how many processors, and the kernel release. Put each on its own line.',
        '`grep -c ^processor /proc/cpuinfo` or `nproc` counts CPUs. `uname -r` prints the kernel release. `>` writes the first line and `>>` adds the second.',
        'On another machine: `nproc > /root/info.txt` then `uname -r >> /root/info.txt`, and `cat /root/info.txt` shows for example 8 and 6.8.0-45-generic.',
      ],
      checks: [
        { id: 'cpus', label: 'Line 1 is the CPU count', run: '[ "$(sed -n 1p /root/system.txt 2>/dev/null | tr -d " ")" = "$(grep -c ^processor /proc/cpuinfo)" ]', fail: 'The first line of /root/system.txt is not the number of CPUs.' },
        { id: 'kernel', label: 'Line 2 is the kernel version', run: '[ "$(sed -n 2p /root/system.txt 2>/dev/null | tr -d " ")" = "$(uname -r)" ]', fail: 'The second line of /root/system.txt is not the kernel version from uname -r.' },
      ],
      solution: 'grep -c ^processor /proc/cpuinfo > /root/system.txt && uname -r >> /root/system.txt',
    },
  ],
};
