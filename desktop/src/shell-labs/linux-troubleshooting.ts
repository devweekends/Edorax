import type { ShellLab } from '../domain/shell-labs';

const START = String.raw`#!/bin/bash
set -e
. /etc/shop/shop.conf
if [ "$1" = --check ]; then echo "config ok, port $PORT"; exit 0; fi
exec -a shop-server nc -lk 127.0.0.1 "$PORT"
`;

export const linuxTroubleshooting: ShellLab = {
  slug: 'linux-troubleshooting',
  topic: 'linux',
  level: 'intermediate',
  tags: ['Troubleshooting', 'Disk', 'Processes'],
  title: 'Troubleshooting a broken server',
  summary: 'A shop server is down for four reasons at once: a full disk, a config it cannot read, a script that will not run and a port already taken.',
  scenario:
    'It is 2 a.m. and shop1 is down. The shop runs as the user shop from /opt/shop/start.sh, reads /etc/shop/shop.conf and listens on port 8080. Nobody knows what changed. Work through it like an on-call engineer: read the error, find the cause, fix only that, and try again. You are root.',
  minutes: 90,
  machine: { name: 'shop1', image: 'ubuntu:24.04', packages: ['iproute2', 'netcat-openbsd'] },
  setup: `set -e
useradd -r -m -s /bin/bash shop
mkdir -p /etc/shop /opt/shop /tmp/shop-uploads
chown shop:shop /tmp/shop-uploads
echo "PORT=8080" > /etc/shop/shop.conf
chmod 600 /etc/shop/shop.conf
cat > /opt/shop/start.sh <<'SCRIPT'
${START}SCRIPT
sed -i 's/$/\\r/' /opt/shop/start.sh
chmod 755 /opt/shop/start.sh
mkdir -p /tmp/.crash
head -c 30408704 /dev/zero > /tmp/.crash/core.4412
nohup bash -c 'exec -a old-shop nc -lk 127.0.0.1 8080' >/dev/null 2>&1 &
sleep 1
`,
  // /tmp is memory-backed and empties on a restart, as it does on many servers. The shop recreates its folder.
  boot: 'mkdir -p /tmp/shop-uploads && chown shop:shop /tmp/shop-uploads',
  steps: [
    {
      id: 'disk',
      goal: 'The shop cannot save uploads: "No space left on device". Free up /tmp without touching /tmp/shop-uploads.',
      body: 'Start with how full each filesystem is, then find what is using the space. `df -h` shows free space per filesystem. `du` adds up the size of folders, and hidden folders count too.',
      hints: [
        'Which filesystem is full? Then which folder inside it is big?',
        '`df -h /tmp` shows it is full. `du -ah /tmp | sort -h | tail` lists the biggest things last, hidden ones included.',
        'If /var were full: `df -h /var`, then `du -ah /var | sort -h | tail -5` shows an old 2 GB dump, and `rm` that file only.',
      ],
      checks: [
        { id: 'space', label: '/tmp has room again', run: '[ "$(df --output=pcent /tmp | tail -1 | tr -dc 0-9)" -lt 50 ]', fail: '/tmp is still more than half full.' },
        { id: 'uploads', label: 'The upload folder is still there', run: '[ -d /tmp/shop-uploads ] && [ "$(stat -c %U /tmp/shop-uploads)" = shop ]', fail: '/tmp/shop-uploads is gone or no longer belongs to shop. Reset, and delete only what fills the disk.' },
      ],
      solution: 'rm -rf /tmp/.crash',
    },
    {
      id: 'config',
      goal: 'The shop cannot read its config. Let the shop user read /etc/shop/shop.conf, and nobody else.',
      body: 'Run the program as the user it runs as, and read the error. `su -s /bin/bash shop -c COMMAND` does that. A config file may hold secrets, so open it to exactly the people who need it rather than to everyone.',
      hints: [
        'Try reading the file as shop. Then look at its owner, group and mode.',
        '`ls -l /etc/shop/shop.conf` shows root root and rw-------. Give the file to the group shop (`chgrp`) and let the group read it (mode 640).',
        'For /etc/app/secret.env read by user app: `chgrp app /etc/app/secret.env`, `chmod 640 /etc/app/secret.env`, then `su -s /bin/bash app -c "cat /etc/app/secret.env"`.',
      ],
      checks: [
        { id: 'shop-reads', label: 'shop can read the config', run: 'su -s /bin/bash shop -c "cat /etc/shop/shop.conf" 2>/dev/null | grep -q PORT=8080', fail: 'The user shop still cannot read /etc/shop/shop.conf.' },
        { id: 'others-cannot', label: 'Other users cannot', run: '! su -s /bin/bash nobody -c "cat /etc/shop/shop.conf" >/dev/null 2>&1', fail: 'Other users can read the config too. Open it to the shop group only.' },
      ],
      solution: 'chgrp shop /etc/shop/shop.conf && chmod 640 /etc/shop/shop.conf',
    },
    {
      id: 'script',
      goal: 'The start script fails with "bad interpreter". Fix /opt/shop/start.sh so it runs.',
      body: 'Someone edited the script on Windows. Windows ends each line with an extra invisible carriage return, `\\r`, so Linux looks for a program called "/bin/bash\\r", which does not exist. `cat -A` shows those as ^M at the end of each line.',
      hints: [
        'Run the script with --check to see the error, then look at the line endings.',
        '`cat -A /opt/shop/start.sh | head -3` shows ^M$ at the end of lines. `sed -i \'s/\\r$//\' FILE` removes them.',
        'For a broken backup.sh: `cat -A backup.sh | head -2`, then `sed -i \'s/\\r$//\' backup.sh`, and `./backup.sh` runs.',
      ],
      checks: [
        { id: 'endings', label: 'No Windows line endings left', run: '! grep -q $\'\\r\' /opt/shop/start.sh', fail: 'The script still has Windows line endings (\\r).' },
        { id: 'runs', label: 'start.sh --check runs as shop', run: 'su -s /bin/bash shop -c "/opt/shop/start.sh --check" 2>/dev/null | grep -q "config ok"', fail: 'Running /opt/shop/start.sh --check as shop does not print "config ok". Fix the config permissions first.' },
      ],
      solution: "sed -i 's/\\r$//' /opt/shop/start.sh",
    },
    {
      id: 'port',
      goal: 'Something else holds port 8080. Stop it, and start the shop in the background as the shop user.',
      body: 'Only one program can listen on a port. `ss -ltnp` lists listening TCP ports and the process holding each one. An old copy of the shop was left running. Stop it, then start the real shop as its own user so it keeps running after you leave the terminal.',
      hints: [
        'See who listens on 8080, stop that process, then start the shop.',
        '`ss -ltnp | grep 8080` shows the PID. `kill PID` stops it. `su -s /bin/bash shop -c "nohup /opt/shop/start.sh >/dev/null 2>&1 &"` starts the shop in the background.',
        'For an app on 3000: `ss -ltnp | grep 3000`, `kill 2231`, then `su -s /bin/bash app -c "nohup /opt/app/run.sh >/dev/null 2>&1 &"` and `ss -ltnp | grep 3000` again.',
      ],
      checks: [
        { id: 'old-gone', label: 'The old copy is stopped', run: "! pgrep -f '^old-shop' >/dev/null", fail: 'The old process on port 8080 is still running.' },
        { id: 'listening', label: 'The shop listens on 8080', run: "pid=$(pgrep -f '^shop-server' | head -1) && [ -n \"$pid\" ] && ss -ltnH 'sport = :8080' | grep -q 127.0.0.1:8080", fail: 'The shop is not listening on 8080. Start /opt/shop/start.sh after the old process is gone.' },
        { id: 'as-shop', label: 'It runs as the shop user', run: "pid=$(pgrep -f '^shop-server' | head -1) && [ \"$(ps -o user= -p \"$pid\" | tr -d ' ')\" = shop ]", fail: 'The shop is running as root. Start it as the shop user with su.' },
      ],
      solution: "pkill -f '^old-shop'; sleep 1; su -s /bin/bash shop -c 'nohup /opt/shop/start.sh >/dev/null 2>&1 &'; sleep 1",
    },
  ],
};
