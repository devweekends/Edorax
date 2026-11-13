import type { ShellLab } from '../domain/shell-labs';

// worker.sh logs "pid N reloaded config" when it gets SIGHUP, so a check can tell a reload from a restart.
const WORKER = String.raw`#!/bin/bash
echo $$ > /run/worker.pid
trap 'echo "pid $$ reloaded config: $(cat /etc/worker.conf)" >> /var/log/worker.log' HUP
echo "pid $$ started" >> /var/log/worker.log
while true; do sleep 1; done
`;

const CRUNCHER = String.raw`#!/bin/bash
while true; do :; done
`;

export const linuxCoreConcepts1: ShellLab = {
  slug: 'linux-core-concepts-1',
  topic: 'linux',
  level: 'beginner',
  tags: ['Processes', 'Signals', 'Environment'],
  title: 'Core concepts 1: environment, processes and signals',
  summary: 'Set a variable and a PATH for every user, find and stop the process eating the CPU, and make a service reload its config without a restart.',
  scenario:
    'jobs1 runs background jobs for the team. A new deploy tool was copied in but nobody can run it by name, the app needs to know it is in production, something is eating the CPU, and the worker has to pick up a config change without dropping its work. You are root.',
  minutes: 60,
  machine: { name: 'jobs1', image: 'ubuntu:24.04' },
  setup: `set -e
useradd -m -s /bin/bash dev
mkdir -p /opt/tools/bin /opt/jobs
printf '#!/bin/bash\\necho "deploytool 3.1 ready"\\n' > /opt/tools/bin/deploytool
chmod 755 /opt/tools/bin/deploytool
cat > /opt/jobs/worker.sh <<'SCRIPT'
${WORKER}SCRIPT
cat > /opt/jobs/cruncher.sh <<'SCRIPT'
${CRUNCHER}SCRIPT
chmod 755 /opt/jobs/*.sh
echo "batch_size=50" > /etc/worker.conf
setsid /opt/jobs/worker.sh </dev/null >/dev/null 2>&1 &
nohup nice -n 19 /opt/jobs/cruncher.sh >/dev/null 2>&1 &
sleep 1
`,
  // A restart brings the worker back, like a service enabled at boot. The runaway job does not return.
  boot: "pgrep -f '^/bin/bash /opt/jobs/worker.sh' >/dev/null || { setsid /opt/jobs/worker.sh </dev/null >/dev/null 2>&1 & sleep 1; }",
  steps: [
    {
      id: 'env-var',
      goal: 'Make APP_ENV=production set in every login shell, for every user.',
      body: 'Environment variables are settings that programs inherit from the shell that starts them. A variable set at the prompt lasts only for that session. Files in `/etc/profile.d/` run for every user each time they log in.',
      hints: [
        'Write a small file in /etc/profile.d that exports the variable, then open a new login shell to test.',
        'The file needs one line: `export APP_ENV=production`. Name it something like /etc/profile.d/app.sh. `bash -l -c \'echo $APP_ENV\'` tests a login shell.',
        'For REGION=eu: `echo "export REGION=eu" > /etc/profile.d/region.sh`, then `su - dev -c \'echo $REGION\'` prints eu.',
      ],
      checks: [
        { id: 'root', label: 'root\'s login shell has it', run: '[ "$(bash -l -c \'echo $APP_ENV\' 2>/dev/null)" = production ]', fail: 'A new login shell for root does not have APP_ENV=production.' },
        { id: 'dev', label: 'dev\'s login shell has it', run: '[ "$(su - dev -c \'echo $APP_ENV\' 2>/dev/null)" = production ]', fail: 'A login shell for the user dev does not have APP_ENV=production. Set it for everyone, not only in root\'s files.' },
      ],
      solution: 'echo "export APP_ENV=production" > /etc/profile.d/app.sh',
    },
    {
      id: 'path',
      goal: 'Make deploytool runnable by name, for every user, without typing its folder.',
      body: 'When you type a command, the shell looks for it in each folder listed in `PATH`, in order. deploytool lives in `/opt/tools/bin`, which is not in that list, so `deploytool` says "command not found".',
      hints: [
        'Add the folder to PATH for every login, the same way you set APP_ENV.',
        '`export PATH="$PATH:/opt/tools/bin"` keeps the old list and adds one folder. Put it in a file in /etc/profile.d. `command -v deploytool` shows where it is found.',
        'For /opt/bin: `echo \'export PATH="$PATH:/opt/bin"\' > /etc/profile.d/opt.sh` (single quotes, so $PATH is written literally), then `su - dev -c "command -v mytool"`.',
      ],
      checks: [
        { id: 'found', label: 'dev finds deploytool by name', run: '[ "$(su - dev -c \'command -v deploytool\' 2>/dev/null)" = /opt/tools/bin/deploytool ]', fail: 'A login shell for dev cannot find deploytool by name.' },
        { id: 'not-broken', label: 'Normal commands still work', run: 'su - dev -c "ls / >/dev/null && id >/dev/null"', fail: 'Basic commands stopped working for dev. Keep the old PATH: add to it with $PATH, do not replace it.' },
      ],
      solution: `echo 'export PATH="$PATH:/opt/tools/bin"' > /etc/profile.d/tools.sh`,
    },
    {
      id: 'runaway',
      goal: 'Find the process using all the CPU and stop it. Leave the worker running.',
      body: 'Every running program is a process with a number, its PID. `ps aux` lists them all, and `top` shows them live, busiest first. `kill PID` asks a process to stop; it sends a signal called TERM.',
      hints: [
        'Use top or ps to find the busy one and its PID, then kill only that one.',
        '`ps aux --sort=-%cpu | head -5` shows the busiest processes. `kill PID` stops one; `pkill -f NAME` stops by name.',
        'If a script called miner.sh was eating the CPU: `ps aux --sort=-%cpu | head -3` shows its PID, say 412, then `kill 412`. `ps aux | grep miner` confirms it is gone.',
      ],
      checks: [
        { id: 'stopped', label: 'The CPU hog is stopped', run: "! pgrep -f '^/bin/bash /opt/jobs/cruncher.sh' >/dev/null", fail: 'The process using the CPU is still running.' },
        { id: 'worker', label: 'The worker is still running', run: "pgrep -f '^/bin/bash /opt/jobs/worker.sh' >/dev/null", fail: 'The worker was stopped too. Only the CPU hog should go. Reset, or start it again with setsid /opt/jobs/worker.sh &.' },
      ],
      solution: "pkill -f '^/bin/bash /opt/jobs/cruncher.sh'",
    },
    {
      id: 'reload',
      goal: 'Change batch_size to 200 in /etc/worker.conf and make the running worker reload it, without restarting it.',
      body: 'Signals are short messages to a process. Many services treat HUP as "read your config again", so they pick up changes without stopping. The worker writes its PID to `/run/worker.pid` and logs to `/var/log/worker.log`.',
      hints: [
        'Edit the config, then send the worker a HUP signal by its PID.',
        '`kill -HUP PID` sends the signal. `cat /run/worker.pid` gives the PID. `tail /var/log/worker.log` shows whether it reloaded.',
        'For a service with PID file /run/app.pid: `echo "level=debug" > /etc/app.conf`, `kill -HUP "$(cat /run/app.pid)"`, then `tail -2 /var/log/app.log`.',
      ],
      checks: [
        { id: 'config', label: 'The config says batch_size=200', run: 'grep -qx "batch_size=200" /etc/worker.conf', fail: '/etc/worker.conf does not say batch_size=200.' },
        { id: 'reloaded', label: 'The running worker reloaded it', run: 'pid=$(cat /run/worker.pid 2>/dev/null) && kill -0 "$pid" 2>/dev/null && grep -q "pid $pid reloaded config: batch_size=200" /var/log/worker.log', fail: 'The running worker has not reloaded batch_size=200. Send it HUP after changing the file; restarting it does not count.' },
      ],
      solution: 'echo "batch_size=200" > /etc/worker.conf && kill -HUP "$(cat /run/worker.pid)" && sleep 2',
    },
  ],
};
