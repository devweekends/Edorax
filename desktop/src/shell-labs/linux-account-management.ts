import type { ShellLab } from '../domain/shell-labs';

export const linuxAccountManagement: ShellLab = {
  slug: 'linux-account-management',
  topic: 'linux',
  level: 'beginner',
  tags: ['Accounts', 'sudo', 'Security'],
  title: 'Account management: sudo, password rules and leavers',
  summary: 'Give an admin sudo safely, set password ageing, lock out a leaver without losing their work, and hand their files over.',
  scenario:
    'ops1 is shared by the operations team. Nadia has been promoted and needs admin rights. Policy says passwords expire every 90 days. Tom left the company yesterday: his account must stop working today, but his files are still needed. You are root.',
  minutes: 60,
  machine: { name: 'ops1', image: 'ubuntu:24.04', packages: ['sudo'] },
  setup: `set -e
useradd -m -s /bin/bash nadia
useradd -m -s /bin/bash tom
echo "nadia:Nadia-2026" | chpasswd
echo "tom:Tom-2026" | chpasswd
mkdir -p /srv/shared /home/tom/projects
echo "Q4 plan draft" > /home/tom/projects/q4-plan.md
echo "vendor contacts" > /home/tom/contacts.txt
echo "tom's report" > /srv/shared/tom-report.txt
echo "tom's budget" > /srv/shared/tom-budget.xlsx
echo "team notes" > /srv/shared/notes.txt
chown -R tom:tom /home/tom /srv/shared/tom-report.txt /srv/shared/tom-budget.xlsx
`,
  steps: [
    {
      id: 'sudo',
      goal: 'Let nadia run any command as root with sudo, using a file in /etc/sudoers.d.',
      body: 'sudo lets a user run one command as root and records who did it, which is safer than sharing the root password. Its rules live in `/etc/sudoers`; one file per rule in `/etc/sudoers.d/` keeps them tidy. A broken sudoers file can lock everyone out, so always check it with `visudo -c`.',
      hints: [
        'Write one rule for nadia in a new file under /etc/sudoers.d, then check the syntax.',
        'The rule is `nadia ALL=(ALL:ALL) ALL`. Files there must be mode 0440. `visudo -c` checks every file. `sudo -l -U nadia` shows what she may run.',
        'For a user maria: `echo "maria ALL=(ALL:ALL) ALL" > /etc/sudoers.d/maria`, `chmod 440 /etc/sudoers.d/maria`, `visudo -c`, then `sudo -l -U maria`. (In this lab machine sudo cannot actually switch user, so test with -l.)',
      ],
      checks: [
        { id: 'valid', label: 'The sudo rules are valid', run: 'visudo -c >/dev/null 2>&1', fail: 'visudo -c reports an error in the sudoers files. Fix it before anything else.' },
        { id: 'nadia', label: 'nadia may run anything as root', run: 'sudo -l -U nadia 2>/dev/null | grep -Eq "\\(ALL( : ALL)?\\) ALL"', fail: 'sudo -l -U nadia does not show that she may run all commands.' },
        { id: 'not-tom', label: 'tom has no sudo rights', run: '! sudo -l -U tom 2>/dev/null | grep -q "may run"', fail: 'tom has sudo rights. Only nadia should.' },
      ],
      solution: 'echo "nadia ALL=(ALL:ALL) ALL" > /etc/sudoers.d/nadia && chmod 440 /etc/sudoers.d/nadia',
    },
    {
      id: 'ageing',
      goal: 'Make nadia\'s password expire every 90 days, with a warning 7 days before.',
      body: 'Password ageing is stored per user in `/etc/shadow`. `chage` changes it and `chage -l` shows it in plain words: when the password was set, when it expires and how early the user is warned.',
      hints: [
        'One chage command with a maximum age and a warning period.',
        '`chage -M DAYS -W DAYS USER` sets the maximum age and the warning period. Check with `chage -l USER`.',
        'For 60 days with 5 days\' warning for omar: `chage -M 60 -W 5 omar`, then `chage -l omar` shows Maximum number of days 60.',
      ],
      checks: [{ id: 'policy', label: 'nadia: 90 days, warned 7 days before', run: '[ "$(getent shadow nadia | cut -d: -f5,6)" = "90:7" ]', fail: 'nadia\'s password does not expire after 90 days with a 7 day warning.' }],
      solution: 'chage -M 90 -W 7 nadia',
    },
    {
      id: 'lock-tom',
      goal: 'Lock tom\'s account and give him a shell that refuses logins. Keep his home folder.',
      body: 'Deleting a leaver straight away loses their files and breaks anything they own. First stop them logging in: lock the password, and set the shell to `nologin`, which refuses any interactive login, even with an SSH key.',
      hints: [
        'Two changes: lock the password, and change the login shell.',
        '`usermod -L tom` (or `passwd -l tom`) locks the password. `usermod -s /usr/sbin/nologin tom` changes the shell. `passwd -S tom` shows L when locked.',
        'For a leaver jo: `usermod -L -s /usr/sbin/nologin jo`, then `passwd -S jo` shows jo L and `getent passwd jo` ends in /usr/sbin/nologin.',
      ],
      checks: [
        { id: 'locked', label: 'tom\'s password is locked', run: '[ "$(passwd -S tom | awk \'{print $2}\')" = L ]', fail: 'tom\'s password is not locked.' },
        { id: 'nologin', label: 'tom\'s shell refuses logins', run: 'case "$(getent passwd tom | cut -d: -f7)" in */nologin|*/false) ;; *) exit 1;; esac', fail: 'tom can still get a shell. Set it to /usr/sbin/nologin.' },
        { id: 'kept', label: 'tom\'s files are still there', run: '[ -f /home/tom/projects/q4-plan.md ] && id tom >/dev/null 2>&1', fail: 'tom\'s account or home folder is gone. Lock it, do not delete it. Reset to get it back.' },
      ],
      solution: 'usermod -L -s /usr/sbin/nologin tom',
    },
    {
      id: 'hand-over',
      goal: 'Give tom\'s files in /srv/shared to nadia, and archive his home folder into /root/tom-home.tar.gz.',
      body: 'Before an account is finally removed, its work has to find a new owner. `find` can list everything one user owns, and `tar` keeps a copy of the home folder with owners and permissions recorded.',
      hints: [
        'Change the owner of tom\'s shared files, then tar up /home/tom.',
        '`find /srv/shared -user tom` lists his files. `chown nadia:nadia FILE` changes the owner; find\'s `-exec chown nadia:nadia {} +` does them all. `tar -czf ARCHIVE -C /home tom` archives his home.',
        'For a leaver jo: `find /srv -user jo -exec chown kim:kim {} +`, then `tar -czf /root/jo-home.tar.gz -C /home jo` and `tar -tzf /root/jo-home.tar.gz` to check.',
      ],
      checks: [
        { id: 'none-left', label: 'tom owns nothing in /srv/shared', run: '[ -z "$(find /srv/shared -user tom)" ]', fail: 'Some files in /srv/shared still belong to tom.' },
        { id: 'nadia', label: 'nadia owns his report and budget', run: '[ "$(stat -c %U /srv/shared/tom-report.txt):$(stat -c %U /srv/shared/tom-budget.xlsx)" = nadia:nadia ]', fail: 'tom-report.txt and tom-budget.xlsx should now belong to nadia.' },
        { id: 'others', label: 'Other shared files are unchanged', run: '[ "$(stat -c %U /srv/shared/notes.txt)" = root ]', fail: 'notes.txt changed owner. Only tom\'s files should move to nadia.' },
        { id: 'archive', label: 'tom\'s home is archived', run: 'tar -tzf /root/tom-home.tar.gz 2>/dev/null | grep -q "q4-plan.md$" && tar -tzf /root/tom-home.tar.gz | grep -q "contacts.txt$"', fail: '/root/tom-home.tar.gz is missing or does not hold the files from /home/tom.' },
      ],
      solution: 'find /srv/shared -user tom -exec chown nadia:nadia {} + && tar -czf /root/tom-home.tar.gz -C /home tom',
    },
  ],
};
