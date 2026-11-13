import type { LabLessons } from './types';

export const FOUNDATIONS: Record<string, LabLessons> = {
  'linux-101': {
    'make-folder': {
      learn: [
        "Everything on Linux lives in one tree of folders that starts at `/`, called the root. There are no drive letters like C: — a USB stick or a second disk simply appears as a folder somewhere in the tree.",
        "A path is the list of folders to walk through, joined by `/`. An absolute path starts at the root, like `/root/projects`. A relative path starts where you are now, like `projects/hello`. The shell always has a current folder; `pwd` (print working directory) tells you which.",
        "Linux is case-sensitive: `Projects` and `projects` are two different folders. Names usually avoid spaces, because the shell splits words on spaces.",
      ],
      commands: [
        ['pwd', 'Prints the folder you are in now.'],
        ['ls PATH', 'Lists what is inside a folder. With no PATH, lists the current folder.'],
        ['cd PATH', 'Moves you into a folder. `cd ..` goes up one level and `cd` alone goes home.'],
        ['mkdir -p PATH', 'Makes a folder, and with -p any missing folders on the way to it.'],
      ],
    },
    'first-file': {
      learn: [
        'Most commands print their result to the screen, which Linux calls standard output. The shell can send that output somewhere else instead. This is called redirection, and it is how you write small files without opening an editor.',
        '`>` sends output into a file, creating it or replacing everything in it. `>>` adds to the end of a file instead. Mixing them up is a classic way to wipe a config file, so pause before every single `>`.',
        'Quotes keep text together. `echo Hello, Linux` and `echo "Hello, Linux"` print the same here, but quotes matter as soon as text contains special characters such as `*`, `$` or `!`.',
      ],
      commands: [
        ['echo "TEXT"', 'Prints the text.'],
        ['echo "TEXT" > FILE', 'Writes the text into FILE, replacing what was there.'],
        ['echo "TEXT" >> FILE', 'Adds the text as a new line at the end of FILE.'],
        ['cat FILE', 'Shows the whole file.'],
      ],
    },
    'copy-and-move': {
      learn: [
        '`cp` makes a second, independent copy: change one and the other stays the same. `mv` does not copy anything; it changes where the file is listed. That is why moving a large file inside the same disk is instant.',
        'Both take a source and a target. If the target is an existing folder, the file goes inside it and keeps its name. If not, the target is the new name, which is how `mv` also renames files.',
        'Neither asks before overwriting a file with the same name. Add `-i` to make them ask, which is a good habit while you learn.',
      ],
      commands: [
        ['cp SOURCE TARGET', 'Copies a file. The original stays where it was.'],
        ['mv SOURCE TARGET', 'Moves or renames a file.'],
        ['cp -i SOURCE TARGET', 'Copies, but asks before replacing an existing file.'],
      ],
    },
    'clean-up': {
      learn: [
        "Linux has no recycle bin on the command line. `rm` removes the name of a file, and the space is reused. There is no undo, which is why careful admins list what they are about to delete first.",
        "`rm` alone refuses to remove folders. `-r` (recursive) removes a folder and everything inside it. `-f` (force) also skips every question and every error, so `rm -rf` deserves a second look every time you type it.",
        'Wildcards make this more dangerous: a stray space in `rm -r / tmp` means two targets, `/` and `tmp`. Always read the whole command before pressing Enter.',
      ],
      commands: [
        ['ls -R FOLDER', 'Lists a folder and every folder inside it, so you see what would go.'],
        ['rm FILE', 'Deletes a file.'],
        ['rm -r FOLDER', 'Deletes a folder and everything inside it.'],
        ['rmdir FOLDER', 'Deletes a folder only if it is already empty. A safe choice.'],
      ],
    },
  },

  'linux-102': {
    'errors-file': {
      learn: [
        'Most of what servers record is plain text, one event per line. Logs, configs and command output can all be searched and cut up with the same small tools, which is a large part of why Linux admins are fast.',
        '`grep` reads text and prints only the lines that contain a pattern. Patterns are regular expressions: most characters match themselves, and a few are special. `$` means the end of a line and `^` the start, so `" 500$"` matches lines that end with a space and 500.',
        'Being precise matters. Searching for plain `500` would also match an address like 10.0.5.500 or a page called /item/500. Anchoring the pattern removes those false matches.',
      ],
      commands: [
        ['grep PATTERN FILE', 'Prints the lines of FILE that contain PATTERN.'],
        ['grep -v PATTERN FILE', 'Prints the lines that do not contain it.'],
        ['grep -i PATTERN FILE', 'Ignores upper and lower case while matching.'],
        ['head -n 5 FILE', 'Shows the first 5 lines, a quick look at a big file.'],
      ],
    },
    count: {
      learn: [
        'The pipe `|` connects two commands: what the first prints becomes what the second reads. Nothing is saved in between, so pipes are fast and leave no clutter behind.',
        "This is the Unix idea in one character: many small tools that each do one thing well, joined together to answer a new question. `wc` (word count) knows nothing about logs; `grep` cannot count. Together they count errors.",
      ],
      commands: [
        ['COMMAND | wc -l', 'Counts the lines another command prints.'],
        ['grep -c PATTERN FILE', 'Counts matching lines directly.'],
        ['wc -l FILE', 'Counts the lines in a file.'],
      ],
    },
    'top-ip': {
      learn: [
        "\"Who sends the most traffic\" is a question you will answer again and again: top clients, top pages, top errors. The answer is always the same pipeline shape: cut out the column, sort, count, sort by count.",
        "`awk` splits each line into fields on spaces; `$1` is the first field, `$3` the third. `uniq -c` only merges lines that are next to each other, which is why the list must be sorted first. `sort -rn` then sorts numbers, biggest first.",
      ],
      commands: [
        ["awk '{print $N}' FILE", 'Prints field number N of every line.'],
        ['sort', 'Sorts lines, so equal ones sit together.'],
        ['uniq -c', 'Collapses repeated neighbouring lines and counts them.'],
        ['sort -rn | head -1', 'Sorts counts biggest first and keeps the top line.'],
      ],
    },
    script: {
      learn: [
        "A shell script is a text file of the same commands you type at the prompt. Its first line, the shebang `#!/bin/bash`, tells Linux which program should run the rest. Turning a pipeline you used once into a script means the next person, or you at 3 a.m., gets the answer with one word.",
        'Inside a script, `$1` is the first argument given after its name, `$2` the second, and so on. Using `"$1"` instead of a fixed path makes the script work on any file. The quotes keep a file name with spaces in one piece.',
        'To run a script by name, it needs the execute permission (`chmod +x`) and must sit in a folder listed in `PATH`, such as `/usr/local/bin`, where locally added programs belong.',
      ],
      commands: [
        ['chmod +x FILE', 'Makes a file executable, so it can be run as a program.'],
        ['echo $PATH', 'Shows the folders the shell searches for commands.'],
        ['bash -n FILE', 'Checks a script for syntax errors without running it.'],
        ['./FILE ARGUMENT', 'Runs a script in the current folder with one argument.'],
      ],
    },
  },

  'linux-basic-commands-1': {
    images: {
      learn: [
        'Wildcards, also called globs, let one pattern stand for many names. `*` matches any run of characters, `?` exactly one character, and `[0-9]` one character from a set. So `photo?.jpg` matches photo1.jpg but not photo10.jpg.',
        'The shell expands a glob into the list of matching names before the command even starts. `mv` never sees `*.jpg`; it sees photo1.jpg photo2.jpg and so on. That is why `ls *.jpg` is a safe preview of exactly what `mv *.jpg` will touch.',
        'Globs do not match hidden files, the ones starting with a dot, unless you ask for them. That protects settings files from careless patterns.',
      ],
      commands: [
        ['ls *.EXT', 'Lists the files whose names end in .EXT, a preview of what a pattern matches.'],
        ['mv PATTERN... FOLDER/', 'Moves every matching file into a folder.'],
        ['mkdir FOLDER', 'Makes a new folder.'],
      ],
    },
    hidden: {
      learn: [
        'Any file or folder whose name starts with a dot is hidden from a plain `ls` and from wildcards. It is a naming convention, not security: anyone who can read the folder can list them with `ls -a`.',
        'Hidden files usually hold configuration: `.bashrc`, `.ssh`, `.git`, `.env`. A `.env` file often contains passwords and API keys, which is exactly why it is worth knowing where they are, and why they must never end up in a public backup or repository.',
        "`ls -l` adds details to each name: type and permissions, owner, size and the time it last changed. `ls -la` combines both, and is what most admins type first in an unfamiliar folder.",
      ],
      commands: [
        ['ls -a FOLDER', 'Lists everything, hidden names included.'],
        ['ls -la FOLDER', 'Lists everything with details: permissions, owner, size, date.'],
        ['cp FILE TARGET', 'Copies a file to a new name or folder.'],
      ],
    },
    backup: {
      learn: [
        "A copy of a folder is only a backup if it is complete. Plain `cp` copies files one at a time and refuses folders. `-r` (recursive) makes it walk into every folder below.",
        "`-a` (archive) is `-r` plus keeping each file's permissions, owner, timestamps and links. Restore from a backup made without it, and scripts may lose their execute bit and files may change owner, which can break a working site.",
        'Take the backup before you change or delete anything. It costs seconds now and can save a day later.',
      ],
      commands: [
        ['cp -r SOURCE TARGET', 'Copies a folder and everything inside it.'],
        ['cp -a SOURCE TARGET', 'Copies a folder exactly: permissions, owners and times too.'],
        ['diff -r FOLDER1 FOLDER2', 'Compares two folder trees and prints any differences.'],
      ],
    },
    clean: {
      learn: [
        "Globs only look in one folder. `find` walks a whole tree and tests every file it meets: by name, type, size, age, owner and more. Tests are joined with AND by default.",
        "`find` prints what matched unless you give it an action. `-delete` removes each match and `-exec COMMAND {} \\;` runs a command on each, where `{}` stands for the file. The safe habit: run find with no action first, read the list, then add the action.",
        'Quote the pattern after `-name`, as in `-name "*.log"`. Without quotes the shell expands it in the current folder before find runs, and you get confusing results.',
      ],
      commands: [
        ['find PATH -name "PATTERN"', 'Lists every file under PATH whose name matches.'],
        ['find PATH -name "PATTERN" -delete', 'Deletes every match. Run it without -delete first.'],
        ['find PATH -type d', 'Lists only folders. `-type f` lists only files.'],
        ['rm -r FOLDER', 'Deletes a folder and its contents.'],
      ],
    },
  },

  'linux-basic-commands-2': {
    'big-files': {
      learn: [
        'When a disk fills up, you need to know what is big, fast. `find` can test size: `-size +100M` means larger than 100 MiB, `-size -1k` smaller than 1 KiB. Units are `k`, `M` and `G`.',
        '`du` (disk usage) adds up how much space files and folders really use. `du -sh *` gives one human-readable total per item in the current folder. Sorting that list with `sort -h` understands sizes like 4K, 12M and 2G.',
      ],
      commands: [
        ['find PATH -type f -size +SIZE', 'Lists files bigger than SIZE, such as 100M.'],
        ['du -sh PATH', 'Shows how much space a file or folder uses, in readable units.'],
        ['du -ah PATH | sort -h | tail', 'Lists everything with sizes and shows the biggest last.'],
        ['df -h', 'Shows how full each filesystem is.'],
      ],
    },
    'which-config': {
      learn: [
        '"Where is this set?" is one of the most common questions on a server. Settings may be spread over dozens of files. `grep -r` searches every file under a folder at once.',
        '`-l` prints only the names of the files that match, which is what you want when the question is where. `-n` adds line numbers when you want to open the file at the right place.',
      ],
      commands: [
        ['grep -r PATTERN FOLDER', 'Searches every file under FOLDER and prints matching lines.'],
        ['grep -rl PATTERN FOLDER', 'Prints only the names of files that match.'],
        ['grep -rn PATTERN FOLDER', 'Prints matching lines with their line numbers.'],
      ],
    },
    archive: {
      learn: [
        '`tar` packs many files and folders into one archive file, keeping names, folders and permissions. Adding gzip compression gives the familiar `.tar.gz` or `.tgz`, the usual way to move or keep logs and backups on Linux.',
        "Its options are letters: `c` create, `x` extract, `t` list, `z` gzip, `v` verbose, and `f` followed by the archive's file name. `-C FOLDER` makes tar work from that folder, so the paths stored inside stay short and tidy.",
        'Always list a new archive with `t` before trusting it or deleting the originals.',
      ],
      commands: [
        ['tar -czf ARCHIVE.tar.gz PATH', 'Creates a gzip-compressed archive of PATH.'],
        ['tar -tzf ARCHIVE.tar.gz', 'Lists what an archive holds without unpacking it.'],
        ['tar -xzf ARCHIVE.tar.gz -C FOLDER', 'Unpacks an archive into FOLDER.'],
      ],
    },
    recent: {
      learn: [
        'Every file records three times: when its contents last changed (mtime), when it was last read (atime), and when its details last changed (ctime). `ls -l` shows the mtime, and `ls -lt` sorts by it, newest first.',
        "`find -mtime N` tests age in whole days: `-mtime -7` means changed less than 7 days ago, `+30` more than 30 days ago. It is how clean-up jobs remove old files and how you collect this week's work.",
        '`-exec COMMAND {} \\;` runs a command on each file find returns. The `\\;` ends the command; the backslash stops the shell from eating the semicolon.',
      ],
      commands: [
        ['ls -lt FOLDER', 'Lists files newest first.'],
        ['find PATH -type f -mtime -DAYS', 'Lists files changed less than DAYS days ago.'],
        ['find PATH ... -exec cp {} FOLDER/ \\;', 'Copies each file find returns into FOLDER.'],
        ['stat FILE', 'Shows all of a file\'s times and details.'],
      ],
    },
  },
};
