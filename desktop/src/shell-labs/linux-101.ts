import type { ShellLab } from '../domain/shell-labs';

export const linux101: ShellLab = {
  slug: 'linux-101',
  topic: 'linux',
  level: 'beginner',
  tags: ['Terminal', 'Files', 'Basics'],
  title: 'Linux 101: first steps in the terminal',
  summary: 'Your first time at a Linux prompt: make folders, write a file, copy, move and delete, with nothing to install.',
  scenario:
    'This is a fresh Linux machine and the terminal on the right is connected to it. You are root, the administrator, so nothing will stop you, and nothing you do here can touch your own computer. A few files landed in /root/Downloads. Tidy them into a project folder. If anything goes wrong, Reset gives you a clean machine.',
  minutes: 30,
  machine: { name: 'box1', image: 'ubuntu:24.04' },
  setup: `set -e
mkdir -p /root/Downloads/tmp-files
echo "Quarterly report: sales up 12%." > /root/Downloads/report-final.txt
echo "Old quarterly report." > /root/Downloads/old-report.txt
for n in 1 2 3; do echo "scratch $n" > /root/Downloads/tmp-files/scratch-$n.txt; done
`,
  steps: [
    {
      id: 'make-folder',
      goal: 'Create the folder /root/projects/hello.',
      body: 'Linux keeps files in folders, also called directories, inside one big tree that starts at `/`. Your home folder as root is `/root`. `pwd` prints where you are, `ls` lists what is there, and `cd` moves you somewhere else.',
      hints: [
        'Make two folders at once: projects, and hello inside it.',
        '`mkdir` makes a folder. `mkdir -p` also makes any missing folders on the way.',
        'For /root/work/demo: `mkdir -p /root/work/demo`, then `ls /root/work` shows demo.',
      ],
      checks: [{ id: 'folder', label: '/root/projects/hello exists', run: '[ -d /root/projects/hello ]', fail: 'There is no folder /root/projects/hello yet.' }],
      solution: 'mkdir -p /root/projects/hello',
    },
    {
      id: 'first-file',
      goal: 'Create notes.txt in that folder, containing the line Hello, Linux.',
      body: '`echo` prints text. The `>` sign sends what a command prints into a file instead of the screen, creating the file or replacing what was in it. `cat` shows a file.',
      hints: [
        'Print the text, and send it into the file instead of the screen.',
        '`echo "some text" > path/to/file` writes the file. Check it with `cat path/to/file`.',
        'For a file greeting.txt in /root/work: `echo "Good morning" > /root/work/greeting.txt` then `cat /root/work/greeting.txt`.',
      ],
      checks: [
        { id: 'exists', label: 'notes.txt exists', run: '[ -f /root/projects/hello/notes.txt ]', fail: 'There is no notes.txt in /root/projects/hello.' },
        { id: 'text', label: 'It says Hello, Linux', run: 'grep -qx "Hello, Linux" /root/projects/hello/notes.txt', fail: 'notes.txt does not contain the line Hello, Linux exactly, with the comma and capital letters.' },
      ],
      solution: 'echo "Hello, Linux" > /root/projects/hello/notes.txt',
    },
    {
      id: 'copy-and-move',
      goal: 'Copy report-final.txt into the project as report.txt, and move old-report.txt into /root/archive.',
      body: 'Copying leaves the original where it was. Moving takes it away. The same command that moves a file also renames it: you give it the old path and the new one.',
      hints: [
        'Two commands, one that copies and one that moves. The archive folder does not exist yet.',
        '`cp SOURCE TARGET` copies. `mv SOURCE TARGET` moves. If TARGET is a folder, the file keeps its name inside it.',
        'For a.txt in /root/in: `cp /root/in/a.txt /root/work/b.txt` copies and renames it; `mkdir /root/old` then `mv /root/in/c.txt /root/old/` moves c.txt.',
      ],
      checks: [
        { id: 'copied', label: 'report.txt is in the project', run: 'cmp -s /root/projects/hello/report.txt <(echo "Quarterly report: sales up 12%.")', fail: 'There is no /root/projects/hello/report.txt with the report in it.' },
        { id: 'original', label: 'The original is still in Downloads', run: '[ -f /root/Downloads/report-final.txt ]', fail: 'report-final.txt is gone from Downloads. Copy, do not move, this one. Reset to get it back.' },
        { id: 'archived', label: 'old-report.txt is in /root/archive', run: '[ -f /root/archive/old-report.txt ] && [ ! -e /root/Downloads/old-report.txt ]', fail: 'old-report.txt should be in /root/archive, and no longer in Downloads.' },
      ],
      solution: 'cp /root/Downloads/report-final.txt /root/projects/hello/report.txt && mkdir -p /root/archive && mv /root/Downloads/old-report.txt /root/archive/',
    },
    {
      id: 'clean-up',
      goal: 'Delete the folder /root/Downloads/tmp-files and everything in it.',
      body: 'Linux has no recycle bin: deleted means gone. Removing a folder that still has files in it needs one extra option, so look before you delete. Keep everything else in Downloads.',
      hints: [
        'Look inside first with `ls`, then remove the folder and its contents in one command.',
        '`rm` removes files. `rm -r` removes a folder and everything inside it.',
        'For /root/old-stuff: `ls /root/old-stuff`, then `rm -r /root/old-stuff`. `ls /root` shows it is gone.',
      ],
      checks: [
        { id: 'gone', label: 'tmp-files is gone', run: '[ ! -e /root/Downloads/tmp-files ]', fail: '/root/Downloads/tmp-files still exists.' },
        { id: 'kept', label: 'The report is still in Downloads', run: '[ -f /root/Downloads/report-final.txt ]', fail: 'report-final.txt is gone. Delete only tmp-files. Reset to get it back.' },
      ],
      solution: 'rm -r /root/Downloads/tmp-files',
    },
  ],
};
