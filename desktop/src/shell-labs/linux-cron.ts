import type { ShellLab } from '../domain/shell-labs';

export const linuxCron: ShellLab = {
  slug: 'linux-cron',
  topic: 'linux',
  level: 'beginner',
  tags: ['Cron', 'Automation'],
  title: 'Cron jobs',
  summary: 'Schedule a backup that really runs, set a weekday job for another user, fix a cron file that is silently ignored and keep a log of every run.',
  scenario:
    'cron1 should look after itself. Backups are done by hand when someone remembers, the reports user wants a weekday job, and a clean-up job that "has always been there" has never run once. cron is running; your jobs are checked by whether they actually run. You are root.',
  minutes: 45,
  machine: { name: 'cron1', image: 'ubuntu:24.04', packages: ['cron'] },
  setup: String.raw`set -e
# Containers cannot set a login uid; without this PAM refuses every cron job.
sed -i 's/^session\s\+required\s\+pam_loginuid.so/session optional pam_loginuid.so/' /etc/pam.d/cron
useradd -m -s /bin/bash report
mkdir -p /srv/shop /var/backups/shop
echo "orders" > /srv/shop/orders.db
cat > /usr/local/bin/backup.sh <<'SCRIPT'
#!/bin/bash
tar -czf /var/backups/shop/shop-$(date +%Y%m%d-%H%M).tar.gz -C /srv shop
echo "$(date '+%F %T') backup done"
SCRIPT
chmod 755 /usr/local/bin/backup.sh
printf '#!/bin/bash\necho "daily report $(date +%%F)" >> /home/report/reports.txt\n' > /home/report/daily.sh
chown report:report /home/report/daily.sh && chmod 755 /home/report/daily.sh
cat > /usr/local/bin/cleanup.sh <<'SCRIPT'
#!/bin/bash
find /var/tmp -name "*.tmp" -delete
date > /var/log/cleanup.last
SCRIPT
chmod 755 /usr/local/bin/cleanup.sh
# Broken on purpose: no user column, and writable by the group, so cron ignores it.
echo "* * * * * /usr/local/bin/cleanup.sh" > /etc/cron.d/cleanup
chmod 664 /etc/cron.d/cleanup
cron
`,
  boot: 'pgrep -x cron >/dev/null || cron',
  steps: [
    {
      id: 'backup-job',
      goal: 'Schedule /usr/local/bin/backup.sh in root\'s crontab to run every minute, and wait for the first backup.',
      body: 'A crontab line has five time fields, then the command: minute, hour, day of month, month, day of week. `*` means every. `crontab -e` edits your own crontab and `crontab -l` lists it. Every minute is only for this lab; a real backup might be `0 2 * * *`, 2 a.m. daily.',
      hints: [
        'Add one line to root\'s crontab with five stars and the script path, then watch /var/backups/shop.',
        '`crontab -e` opens an editor. The line is `* * * * * /usr/local/bin/backup.sh`. Within a minute a .tar.gz appears in /var/backups/shop.',
        'For a script /usr/local/bin/sync.sh every 5 minutes: `(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/sync.sh") | crontab -`, then `crontab -l`.',
      ],
      checks: [
        { id: 'scheduled', label: 'root\'s crontab runs backup.sh', run: 'crontab -l -u root 2>/dev/null | grep -v "^\\s*#" | grep -q "/usr/local/bin/backup.sh"', fail: 'root\'s crontab has no line for /usr/local/bin/backup.sh.' },
        { id: 'ran', label: 'A backup was made', run: 'ls /var/backups/shop/shop-*.tar.gz >/dev/null 2>&1', fail: 'No backup in /var/backups/shop yet. Cron starts jobs at the top of each minute; give it up to 60 seconds.' },
      ],
      solution: '(crontab -l 2>/dev/null; echo "* * * * * /usr/local/bin/backup.sh") | crontab - && /usr/local/bin/backup.sh >/dev/null',
    },
    {
      id: 'weekday-job',
      goal: 'As the user report, schedule /home/report/daily.sh for 06:30 every Monday to Friday.',
      body: 'Each user has their own crontab, and jobs run as that user. The day-of-week field takes numbers, 0 or 7 for Sunday and 1 for Monday, and ranges such as 1-5.',
      hints: [
        'Edit report\'s crontab, not root\'s: minute 30, hour 6, any day of month, any month, Monday to Friday.',
        '`crontab -u report -e` edits it as root. The time part is `30 6 * * 1-5`.',
        'For 18:15 on weekends for user ops: `echo "15 18 * * 6,0 /home/ops/weekly.sh" | crontab -u ops -`, then `crontab -l -u ops`.',
      ],
      checks: [{ id: 'scheduled', label: 'report has a weekday 06:30 job', run: String.raw`crontab -l -u report 2>/dev/null | grep -v '^\s*#' | grep -Eq '^30\s+0?6\s+\*\s+\*\s+(1-5|mon-fri|MON-FRI|1,2,3,4,5)\s+.*daily\.sh'`, fail: 'report\'s crontab has no line running daily.sh at 30 6 on days 1-5.' }],
      solution: 'echo "30 6 * * 1-5 /home/report/daily.sh" | crontab -u report -',
    },
    {
      id: 'fix-cleanup',
      goal: 'The clean-up in /etc/cron.d/cleanup never runs. Fix it so it runs every minute as root.',
      body: 'Files in `/etc/cron.d/` are system crontabs. Unlike a user crontab they need a sixth field, the user to run as, between the time and the command. cron also ignores any file there that others can write, for safety, without saying so on the screen.',
      hints: [
        'Two problems: one in the line itself, one in the file\'s permissions.',
        'The line needs root between the stars and the command. `ls -l /etc/cron.d/cleanup` shows it is group-writable; `chmod 644` fixes that. /var/log/cleanup.last appears when it runs.',
        'A working /etc/cron.d/rotate looks like `*/10 * * * * root /usr/local/bin/rotate.sh`, owned by root with mode 644.',
      ],
      checks: [
        { id: 'user-field', label: 'The line runs as root', run: String.raw`grep -Eq '^\*\s+\*\s+\*\s+\*\s+\*\s+root\s+/usr/local/bin/cleanup\.sh' /etc/cron.d/cleanup`, fail: 'The line in /etc/cron.d/cleanup still has no user field, or no longer runs every minute.' },
        { id: 'mode', label: 'Only root can change the file', run: '[ -z "$(find /etc/cron.d/cleanup -perm /022)" ] && [ "$(stat -c %U /etc/cron.d/cleanup)" = root ]', fail: '/etc/cron.d/cleanup can be written by others, so cron ignores it.' },
        { id: 'ran', label: 'The clean-up has run', run: '[ -s /var/log/cleanup.last ]', fail: 'The clean-up has not run yet. Give cron up to a minute after fixing the file.' },
      ],
      solution: 'echo "* * * * * root /usr/local/bin/cleanup.sh" > /etc/cron.d/cleanup && chmod 644 /etc/cron.d/cleanup && /usr/local/bin/cleanup.sh',
    },
    {
      id: 'log-output',
      goal: 'Make the backup job add its output to /var/log/backup.log on every run.',
      body: 'cron has no screen to print to. Without a redirect, a job\'s output is mailed or lost. `>>` appends what the job prints to a log, and `2>&1` sends error messages to the same place.',
      hints: [
        'Change the backup line in root\'s crontab so its output is appended to the log.',
        'End the line with `>> /var/log/backup.log 2>&1`. Within a minute the log has a "backup done" line.',
        'For sync.sh: `*/5 * * * * /usr/local/bin/sync.sh >> /var/log/sync.log 2>&1`.',
      ],
      checks: [
        { id: 'redirect', label: 'The backup line appends to the log', run: String.raw`crontab -l -u root 2>/dev/null | grep -v '^\s*#' | grep 'backup\.sh' | grep -q '>>\s*/var/log/backup\.log'`, fail: 'The backup line in root\'s crontab does not append to /var/log/backup.log.' },
        { id: 'written', label: 'The log has a run in it', run: 'grep -q "backup done" /var/log/backup.log 2>/dev/null', fail: 'Nothing in /var/log/backup.log yet. Wait for the next minute.' },
      ],
      solution: 'crontab -l | sed "s#^\\(.*backup.sh\\)\\s*\\$#\\1 >> /var/log/backup.log 2>\\&1#" | crontab - && /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1',
    },
  ],
};
