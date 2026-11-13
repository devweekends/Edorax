import type { ShellLab } from '../domain/shell-labs';

// Checks start a real interactive shell as dev, so they see exactly what dev would see.
// Single quotes all the way down, so $PS1 and friends expand in dev's shell, not in the check's.
const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
const asDev = (command: string) => `su - dev -c ${quote(`bash -i -c ${quote(command)}`)} 2>/dev/null`;

export const linuxBashPrompt: ShellLab = {
  slug: 'linux-bash-prompt',
  topic: 'linux',
  level: 'beginner',
  tags: ['Bash', 'Prompt', 'Customization'],
  title: 'Bash prompt, aliases and history',
  summary: 'Give a user a prompt that shows where they are, shortcuts for long commands, a history that keeps timestamps and a function of their own.',
  scenario:
    'Dana, the user dev on dev1, keeps running commands on the wrong machine because her prompt is a bare $. She types the same long commands all day and cannot tell when she ran what. Set up her shell in /home/dev/.bashrc, the file Bash reads each time she opens a terminal. You are root; test as her with `su - dev`.',
  minutes: 45,
  machine: { name: 'dev1', image: 'ubuntu:24.04' },
  setup: `set -e
useradd -m -s /bin/bash dev
mkdir -p /var/log/app
echo "started" > /var/log/app/app.log
printf '# ~/.bashrc for dev\\nPS1="$ "\\n' > /home/dev/.bashrc
chown dev:dev /home/dev/.bashrc
`,
  steps: [
    {
      id: 'prompt',
      goal: 'Make dev\'s prompt show her user name, the host name and the current folder.',
      body: 'The prompt is the variable `PS1`. Bash replaces special codes in it each time it prints the prompt: `\\u` is the user, `\\h` the host and `\\w` the current folder. Setting it in `~/.bashrc` makes it last.',
      hints: [
        'Change the PS1 line in /home/dev/.bashrc, then log in as dev to see it.',
        'A common prompt is `PS1="\\u@\\h:\\w\\$ "`, which shows dev@dev1:~$. Edit the file, or append a new PS1 line, since the last one wins.',
        'For a user ops: `echo \'PS1="\\u@\\h:\\w\\$ "\' >> /home/ops/.bashrc`, then `su - ops` shows ops@host:~$.',
      ],
      checks: [{ id: 'codes', label: 'The prompt has user, host and folder', run: `ps1=$(${asDev('printf %s "$PS1"')}); case "$ps1" in *'\\u'*) ;; *) exit 1;; esac; case "$ps1" in *'\\h'*|*'\\H'*) ;; *) exit 1;; esac; case "$ps1" in *'\\w'*|*'\\W'*) ;; *) exit 1;; esac`, fail: 'An interactive shell for dev does not have \\u, \\h and \\w (or \\W) in PS1.' }],
      solution: `echo 'PS1="\\u@\\h:\\w\\$ "' >> /home/dev/.bashrc`,
    },
    {
      id: 'aliases',
      goal: 'Give dev two aliases: ll for ls -alF, and applog for tail -n 50 /var/log/app/app.log.',
      body: 'An alias is a short name the shell swaps for a longer command before running it. Like the prompt, aliases set in `~/.bashrc` are there in every new terminal. `alias` with no arguments lists them.',
      hints: [
        'Add two alias lines to dev\'s .bashrc.',
        'The form is `alias NAME=\'COMMAND\'`, with no spaces around the =. Quote the command because it has spaces.',
        'For gs as git status: `echo "alias gs=\'git status\'" >> /home/ops/.bashrc`, then `su - ops -c "bash -i -c \'alias gs\'"` prints it.',
      ],
      checks: [
        { id: 'll', label: 'll runs ls -alF', run: `${asDev('alias ll')} | grep -q "ls -alF"`, fail: 'dev has no alias ll for ls -alF.' },
        { id: 'applog', label: 'applog shows the app log', run: `${asDev('applog')} | grep -q started`, fail: 'Running applog as dev does not show the end of /var/log/app/app.log.' },
      ],
      solution: `printf "alias ll='ls -alF'\\nalias applog='tail -n 50 /var/log/app/app.log'\\n" >> /home/dev/.bashrc`,
    },
    {
      id: 'history',
      goal: 'Make dev\'s history keep 10000 commands, each with the date and time it ran.',
      body: '`history` lists past commands. `HISTSIZE` sets how many it keeps in memory and `HISTFILESIZE` how many it keeps in `~/.bash_history`. Setting `HISTTIMEFORMAT` makes Bash record and show when each command ran.',
      hints: [
        'Three variables in .bashrc: two sizes and a time format.',
        '`HISTSIZE=10000`, `HISTFILESIZE=10000` and `HISTTIMEFORMAT="%F %T "`, which prints like 2026-11-13 09:30:00.',
        'For 5000 lines: `printf \'HISTSIZE=5000\\nHISTFILESIZE=5000\\nHISTTIMEFORMAT="%%F %%T "\\n\' >> ~/.bashrc` (in printf, %% writes a single %).',
      ],
      checks: [
        { id: 'size', label: 'History keeps 10000 commands', run: `[ "$(${asDev('echo "$HISTSIZE:$HISTFILESIZE"')})" = "10000:10000" ]`, fail: 'HISTSIZE and HISTFILESIZE are not both 10000 in dev\'s interactive shell.' },
        { id: 'time', label: 'History records the time', run: `[ -n "$(${asDev('printf %s "$HISTTIMEFORMAT"')})" ]`, fail: 'HISTTIMEFORMAT is not set for dev, so history has no times.' },
      ],
      solution: `printf 'HISTSIZE=10000\\nHISTFILESIZE=10000\\nHISTTIMEFORMAT="%%F %%T "\\n' >> /home/dev/.bashrc`,
    },
    {
      id: 'function',
      goal: 'Give dev a function mkcd that makes a folder (and its parents) and moves into it.',
      body: 'An alias cannot use arguments in the middle of a command, but a function can: inside it, `$1` is the first argument. A function that changes folder works because it runs in your own shell, not a new one.',
      hints: [
        'Define mkcd in .bashrc using mkdir -p and cd with the argument.',
        '`mkcd() { mkdir -p "$1" && cd "$1"; }`. Quote "$1" so names with spaces work.',
        'A function that backs up a file: `bak() { cp "$1" "$1.bak"; }` in ~/.bashrc, then `bak notes.txt` makes notes.txt.bak.',
      ],
      checks: [{ id: 'works', label: 'mkcd makes a folder and enters it', run: `d=$(mktemp -u /tmp/edorax-mkcd.XXXX); out=$(su - dev -c "bash -i -c 'mkcd $d/inner && pwd'" 2>/dev/null); rm -rf "$d"; [ "$out" = "$d/inner" ]`, fail: 'mkcd /some/new/folder does not create it and leave dev inside it.' }],
      solution: `echo 'mkcd() { mkdir -p "$1" && cd "$1"; }' >> /home/dev/.bashrc`,
    },
  ],
};
