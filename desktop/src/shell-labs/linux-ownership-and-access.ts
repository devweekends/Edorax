import type { ShellLab } from '../domain/shell-labs';

export const linuxOwnershipAndAccess: ShellLab = {
  slug: 'linux-ownership-and-access',
  topic: 'linux',
  title: 'Ownership, sticky bits and access lists',
  summary: 'Hand a web app to its service account, protect a shared upload folder, grant one reader with an ACL and remove a dangerous setuid program.',
  scenario:
    'files1 serves a web app and a shared drop folder. The app was copied in as root, so the service cannot write its own cache. People keep deleting each other\'s uploads. An auditor needs to read one report and nothing else. And a security scan found a program that gives root to anyone who runs it. Fix access on files1. You are root on this machine, and nothing here touches your computer.',
  minutes: 25,
  machine: { name: 'files1', image: 'ubuntu:24.04', packages: ['acl'] },
  setup: `set -e
useradd -m -s /bin/bash deploy
useradd -m -s /bin/bash alice
useradd -m -s /bin/bash bob
useradd -m -s /bin/bash auditor
mkdir -p /srv/webapp/public /srv/webapp/cache /srv/webapp/config
echo "<h1>Shop</h1>" > /srv/webapp/public/index.html
echo "port=8080" > /srv/webapp/config/app.ini
echo "cached" > /srv/webapp/cache/home.html
chown -R root:root /srv/webapp
mkdir -p /srv/drop
chmod 0777 /srv/drop
su -s /bin/bash bob -c 'echo "bob photo" > /srv/drop/bob-photo.txt'
mkdir -p /var/log/billing
echo "month,total" > /var/log/billing/report.csv
echo "2026-10,48210" >> /var/log/billing/report.csv
echo "card numbers, never share" > /var/log/billing/secrets.csv
chown root:root /var/log/billing /var/log/billing/*.csv
chmod 750 /var/log/billing
chmod 640 /var/log/billing/report.csv /var/log/billing/secrets.csv
cp /bin/bash /usr/local/bin/backup-helper
chmod 4755 /usr/local/bin/backup-helper
`,
  steps: [
    {
      id: 'hand-over',
      goal: 'Make everything in /srv/webapp belong to user deploy and group www-data.',
      body: 'Every file has an owner and a group. The web app runs as `deploy`, in the group `www-data`, but everything under `/srv/webapp` still belongs to root, so the app cannot write its cache. Change the owner and group of the folder and everything inside it, in one command.',
      hints: [
        'One command changes both the owner and the group, and it can go into every folder below.',
        '`chown USER:GROUP PATH` sets both. `-R` applies it to everything inside. `ls -lR /srv/webapp` shows the result.',
        'For /srv/api run by apiuser in group api: `chown -R apiuser:api /srv/api`, then `ls -lR /srv/api`. Every line should show apiuser api.',
      ],
      checks: [
        { id: 'all-owned', label: 'Every file belongs to deploy:www-data', run: '[ -z "$(find /srv/webapp \\( ! -user deploy -o ! -group www-data \\) -print -quit)" ]', fail: 'Some files or folders in /srv/webapp still belong to someone else. Did you use -R?' },
        { id: 'can-write', label: 'deploy can write the cache', run: "su -s /bin/bash deploy -c 'touch /srv/webapp/cache/.edorax-check' && rm -f /srv/webapp/cache/.edorax-check", fail: 'deploy still cannot create a file in /srv/webapp/cache.' },
      ],
      solution: 'chown -R deploy:www-data /srv/webapp',
    },
    {
      id: 'sticky-drop',
      goal: 'Keep /srv/drop open to everyone, but stop people deleting files they do not own.',
      body: 'Anyone may put files in `/srv/drop`, which is right. But write permission on a folder also means permission to delete anything in it, so alice can delete bob\'s photo. The sticky bit fixes that: in a sticky folder, only a file\'s owner (or root) can delete or rename it. `/tmp` works this way.',
      hints: [
        'Keep the rwx for everyone and add one special bit. Look at `ls -ld /tmp` to see what you are aiming for.',
        'The sticky bit is the leading 1 in a four digit mode, or `+t` with letters. `ls -ld` shows it as a t at the end.',
        'For a shared folder /srv/inbox: `chmod 1777 /srv/inbox` (or `chmod +t /srv/inbox`), then `ls -ld /srv/inbox` shows drwxrwxrwt.',
      ],
      checks: [
        { id: 'sticky', label: 'The sticky bit is set', run: '[ -k /srv/drop ]', fail: 'The sticky bit is not set on /srv/drop.' },
        { id: 'still-open', label: 'Everyone can still add files', run: "su -s /bin/bash alice -c 'touch /srv/drop/.edorax-check' && rm -f /srv/drop/.edorax-check", fail: 'alice can no longer create files in /srv/drop. It must stay open to everyone.' },
        { id: 'protected', label: "alice cannot delete bob's file", run: "rm -f /srv/drop/.edorax-probe; su -s /bin/bash bob -c 'touch /srv/drop/.edorax-probe' || exit 1; su -s /bin/bash alice -c 'rm -f /srv/drop/.edorax-probe' 2>/dev/null; [ -f /srv/drop/.edorax-probe ]; status=$?; rm -f /srv/drop/.edorax-probe; exit $status", fail: "alice can still delete files that bob owns." },
      ],
      solution: 'chmod 1777 /srv/drop',
    },
    {
      id: 'acl-reader',
      goal: 'Let user auditor read /var/log/billing/report.csv, and nothing else in that folder.',
      body: 'Owner, group and others is sometimes not enough. Adding the auditor to a group would also open `secrets.csv`. An access control list (ACL) adds a rule for one named user on one file or folder, and leaves the normal owner, group and mode alone. The auditor needs to enter the folder and read one file.',
      hints: [
        'Two ACL entries: one on the folder so auditor can enter it, one on the report so auditor can read it.',
        '`setfacl -m u:NAME:PERMS PATH` adds a rule. A folder needs x to be entered; a file needs r to be read. `getfacl PATH` shows the rules.',
        'For user viewer and /data/q3/summary.txt: `setfacl -m u:viewer:x /data/q3` then `setfacl -m u:viewer:r /data/q3/summary.txt`. Test it with `su viewer -c "cat /data/q3/summary.txt"`.',
      ],
      checks: [
        { id: 'reads', label: 'auditor can read the report', run: "su -s /bin/bash auditor -c 'cat /var/log/billing/report.csv' 2>/dev/null | grep -q 48210", fail: 'auditor cannot read report.csv yet. Remember the folder needs an entry too.' },
        { id: 'no-secrets', label: 'auditor cannot read secrets.csv', run: "! su -s /bin/bash auditor -c 'cat /var/log/billing/secrets.csv' >/dev/null 2>&1", fail: 'auditor can read secrets.csv. Give access to the one report only.' },
        { id: 'no-write', label: 'auditor cannot change the report', run: "! su -s /bin/bash auditor -c 'echo x >> /var/log/billing/report.csv' 2>/dev/null", fail: 'auditor can write to report.csv. Read access is enough.' },
        { id: 'mode-kept', label: 'Owner, group and mode are unchanged', run: '[ "$(stat -c %U:%G /var/log/billing/report.csv)" = root:root ] && [ "$(stat -c %U:%G /var/log/billing)" = root:root ] && [ -z "$(find /var/log/billing/report.csv -perm /o=r)" ]', fail: 'The report or folder changed owner, or became readable by everyone. Use an ACL instead.' },
      ],
      solution: 'setfacl -m u:auditor:x /var/log/billing && setfacl -m u:auditor:r /var/log/billing/report.csv',
    },
    {
      id: 'setuid',
      goal: 'Find the setuid program in /usr/local and remove its setuid bit, without deleting it.',
      body: 'A program with the setuid bit runs as its owner, not as the person who started it. That is how `passwd` can change a file only root may write. A copy of a shell with that bit, owned by root, gives root to anyone. One is hidden in `/usr/local`. Find it by its permissions and take the bit away.',
      hints: [
        '`find` can search by permission bits. Then one chmod removes the bit.',
        '`find /usr/local -perm -4000` lists setuid files. `chmod u-s FILE` removes the bit and keeps the file.',
        'For a scan of /opt: `find /opt -type f -perm -4000 -ls` shows the file with an s in its mode, then `chmod u-s /opt/tools/runner`. `ls -l` shows rwx instead of rws.',
      ],
      checks: [
        { id: 'none-left', label: 'No setuid files in /usr/local', run: '[ -z "$(find /usr/local -perm -4000 -print -quit)" ]', fail: 'There is still a setuid file under /usr/local.' },
        { id: 'kept', label: 'The program is still there', run: '[ -x /usr/local/bin/backup-helper ]', fail: 'backup-helper was deleted or can no longer run. Remove only the setuid bit; reset the lab to get it back.' },
        { id: 'passwd', label: 'passwd still works for users', run: '[ -u /usr/bin/passwd ]', fail: '/usr/bin/passwd lost its setuid bit, so users cannot change their passwords. Only change files under /usr/local.' },
      ],
      solution: 'chmod u-s /usr/local/bin/backup-helper',
    },
  ],
};
