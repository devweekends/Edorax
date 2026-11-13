import type { LabLessons } from './types';

export const CONCEPTS: Record<string, LabLessons> = {
  'linux-core-concepts-1': {
    'env-var': {
      learn: [
        'Every process carries a small set of named settings, its environment: `HOME`, `USER`, `PATH`, `LANG` and any you add. When a process starts another, the child gets a copy. That is how an app learns it is in production without the setting being written into its code.',
        'A variable set at the prompt with `export NAME=value` lives only in that shell and what it starts. Close the terminal and it is gone. To set something for every user on every login, put the export in a file under `/etc/profile.d/`; login shells read each `.sh` file there as they start.',
        'A login shell is the one you get when you log in or use `su -`. Testing with `su - USER -c \'echo $NAME\'` shows exactly what a real login sees.',
      ],
      commands: [
        ['env', 'Lists every variable in the current environment.'],
        ['echo $NAME', 'Prints one variable.'],
        ['export NAME=VALUE', 'Sets a variable for this shell and everything it starts.'],
        ["su - USER -c 'COMMAND'", 'Runs a command in a fresh login shell as USER, to test what they see.'],
      ],
    },
    path: {
      learn: [
        'When you type a command name, the shell searches each folder in `PATH`, left to right, and runs the first match. "command not found" usually means the program exists but its folder is not in the list.',
        'You change PATH by adding to it, never by replacing it: `PATH="$PATH:/new/folder"` keeps every existing folder and appends one. Replacing it outright makes even `ls` disappear.',
        'Order matters for safety too. A folder early in PATH wins, so an attacker who can write there can shadow real commands. System folders come first for that reason.',
      ],
      commands: [
        ['echo $PATH', 'Shows the folders searched for commands, separated by colons.'],
        ['command -v NAME', 'Shows which file runs when you type NAME.'],
        ['export PATH="$PATH:FOLDER"', 'Adds FOLDER to the end of the search list.'],
      ],
    },
    runaway: {
      learn: [
        'Every running program is a process with a number, its PID. The kernel shares the CPUs between them. One process stuck in a loop can take a whole CPU and make everything else slow.',
        '`ps` takes a snapshot of processes; `ps aux` shows all of them with owner, CPU and memory use. `top` shows the same live, busiest first; press `q` to leave it. `pgrep NAME` finds PIDs by name.',
        "`kill PID` does not force anything: it sends the signal TERM, a polite request to stop that a program can catch to clean up. `kill -9 PID` sends KILL, which cannot be caught; use it only when TERM fails, because the program gets no chance to save its work.",
      ],
      commands: [
        ['ps aux --sort=-%cpu | head', 'Lists processes using the most CPU first.'],
        ['top', 'Shows processes live, busiest first. q quits.'],
        ['kill PID', 'Asks a process to stop (signal TERM).'],
        ['pkill -f PATTERN', 'Sends TERM to every process whose command line matches.'],
      ],
    },
    reload: {
      learn: [
        'Signals are short messages the kernel delivers to a process. TERM asks it to stop, KILL forces it, INT is what Ctrl+C sends. HUP, short for hang-up, originally meant the terminal had gone away.',
        'Many daemons reuse HUP to mean "read your configuration again". nginx, sshd and many others reload this way without dropping the connections they are serving, which a full restart would do.',
        'Services usually write their PID to a file under `/run`, so scripts and admins can signal them reliably. One trap: a program started with `nohup` ignores HUP, so it cannot be reloaded this way.',
      ],
      commands: [
        ['kill -HUP PID', 'Sends the HUP signal, which many services treat as reload.'],
        ['cat /run/NAME.pid', 'Reads the PID a service recorded for itself.'],
        ['kill -l', 'Lists every signal name.'],
        ['tail -f FILE', 'Follows a log as new lines are written. Ctrl+C stops.'],
      ],
    },
  },

  'linux-core-concepts-2': {
    symlink: {
      learn: [
        "A symbolic link is a tiny file that holds a path to somewhere else. Opening the link opens whatever it points to. If the target is removed, the link stays but dangles, pointing at nothing.",
        'Links let one fixed name point at changing things. Deployments often keep releases side by side and switch a `current` link from one to the next: switching back is one command, which makes rollbacks fast and safe.',
        '`ls -l` shows a link as `name -> target`. `readlink -f` follows every link to the final real path.',
      ],
      commands: [
        ['ln -s TARGET LINK', 'Makes LINK a symbolic link to TARGET.'],
        ['ln -sf TARGET LINK', 'Same, replacing whatever LINK was before.'],
        ['readlink -f PATH', 'Prints the real path PATH leads to.'],
      ],
    },
    hardlink: {
      learn: [
        "On disk, a file's data and details live in an inode, a numbered record. A file name is only a directory entry that points at an inode. `ls -i` shows the inode number beside each name.",
        'A hard link is a second name pointing at the same inode. Both names are equally real: neither is the original. The data stays until the last name is removed, and `ls -l` shows the count of names in its second column.',
        'Hard links cannot cross filesystems or point at folders. Symbolic links can do both, which is why symlinks are more common in everyday use.',
      ],
      commands: [
        ['ln TARGET NEWNAME', 'Gives the same file a second name (a hard link).'],
        ['ls -li FILE...', 'Shows inode numbers and link counts.'],
        ['stat FILE', 'Shows the inode, link count, size and times of a file.'],
      ],
    },
    recover: {
      learn: [
        "Deleting a file removes its name. The kernel frees the data only when no name points at it and no process has it open. A program that is still writing to a deleted log keeps the data alive, and keeps using disk space.",
        '`/proc` is a window into the kernel. Each process has a folder `/proc/PID`; inside, `fd/` holds one entry for every file it has open, numbered by file descriptor. A deleted file still appears there, marked "(deleted)", and reading that entry reads the data.',
        'This explains a classic puzzle: "I deleted the big log, but the disk is still full." The fix is to restart or signal the process that holds it, or to empty it through `/proc`.',
      ],
      commands: [
        ['pgrep -f PATTERN', 'Prints the PIDs of processes whose command line matches.'],
        ['ls -l /proc/PID/fd', 'Lists the files a process has open, including deleted ones.'],
        ['cat /proc/PID/fd/N > FILE', 'Copies what open file number N holds into a new file.'],
      ],
    },
    proc: {
      learn: [
        "Files in `/proc` are not on any disk. The kernel writes them as you read them, so they always show the machine's live state. Most system tools are friendly readers of `/proc`.",
        '`/proc/cpuinfo` describes each processor, `/proc/meminfo` the memory, `/proc/version` the running kernel and `/proc/uptime` how long it has run. `nproc`, `free` and `uname` read the same information for you.',
      ],
      commands: [
        ['grep -c ^processor /proc/cpuinfo', 'Counts the processors the kernel sees.'],
        ['nproc', 'Prints the number of CPUs available.'],
        ['uname -r', 'Prints the kernel release.'],
        ['head /proc/meminfo', 'Shows total and free memory.'],
      ],
    },
  },

  'linux-bash-prompt': {
    prompt: {
      learn: [
        "The prompt is the text Bash prints before every command, and it is stored in the variable `PS1`. A good prompt answers the questions behind most mistakes: who am I, which machine is this, and where am I.",
        'Bash replaces escape codes in PS1 each time it shows the prompt: `\\u` user, `\\h` short host name, `\\w` full current folder, `\\W` its last part, and `\\$`, which prints # for root and $ for everyone else.',
        'Bash reads `~/.bashrc` when it starts an interactive shell. Settings there apply to every new terminal. The last assignment to a variable wins, so a line added at the end replaces earlier ones.',
      ],
      commands: [
        ['echo "$PS1"', 'Shows your current prompt setting.'],
        ['PS1="TEMPLATE"', 'Changes the prompt for this shell, to try a design.'],
        ['echo \'LINE\' >> ~/.bashrc', 'Adds a line to your startup file so it lasts.'],
        ['source ~/.bashrc', 'Reloads the startup file in the current shell.'],
      ],
    },
    aliases: {
      learn: [
        "An alias is a nickname for a command line. When the first word you type is an alias, Bash swaps in the full text before running it. Aliases save typing and prevent typos in long commands you run all day.",
        'Define them as `alias NAME=\'COMMAND\'`, with no spaces around `=`. Single quotes keep the command exactly as written. `alias` alone lists them and `unalias NAME` removes one. Like PS1, they belong in `~/.bashrc` to last.',
      ],
      commands: [
        ["alias NAME='COMMAND'", 'Defines a shortcut.'],
        ['alias', 'Lists every alias.'],
        ['type NAME', 'Says whether NAME is an alias, a function or a program.'],
      ],
    },
    history: {
      learn: [
        'Bash keeps the commands you type. `history` lists them, the up arrow walks back through them, and Ctrl+R searches them. Admins use history to repeat work and to find out what happened on a server.',
        '`HISTSIZE` is how many commands a shell remembers, and `HISTFILESIZE` how many are kept in `~/.bash_history` between sessions. The defaults are small.',
        "`HISTTIMEFORMAT` makes Bash record when each command ran and show it in `history`. It uses strftime codes: `%F` is the date and `%T` the time. Without it, you know what was run but not when.",
      ],
      commands: [
        ['history | tail', 'Shows the most recent commands.'],
        ['HISTSIZE=NUMBER', 'Sets how many commands the shell remembers.'],
        ['HISTTIMEFORMAT="FORMAT "', 'Records and shows the time of each command.'],
        ['Ctrl+R', 'Searches history as you type. Press again for older matches.', 'key'],
      ],
    },
    function: {
      learn: [
        "An alias can only put text at the start of a command. When you need the argument in the middle, or several commands, write a function: `NAME() { COMMANDS; }`. Inside it, `$1` is the first argument and `$@` all of them.",
        'Functions run inside your current shell, not a new one. That is why a function can `cd` and leave you in the new folder, which a script cannot: a script runs in a child shell that exits when it ends.',
        '`&&` runs the next command only if the one before succeeded, so `mkdir -p "$1" && cd "$1"` never tries to enter a folder it failed to create.',
      ],
      commands: [
        ['NAME() { COMMANDS; }', 'Defines a function. Note the spaces inside the braces and the final semicolon.'],
        ['COMMAND1 && COMMAND2', 'Runs the second command only if the first succeeded.'],
        ['declare -f NAME', 'Prints a function\'s definition.'],
      ],
    },
  },

  'linux-vi-editor': {
    typo: {
      learn: [
        "vi, and its modern version vim, is modal. In normal mode, keys are commands: move, delete, copy. In insert mode, keys type text. Pressing `Esc` always brings you back to normal mode, so when in doubt, press Esc.",
        'Move with the arrow keys or `h j k l`. `w` jumps a word forward and `b` back, `0` goes to the start of the line and `$` to the end. `/word` then Enter searches forward; `n` finds the next match.',
        'Commands starting with `:` are typed at the bottom: `:w` writes, `:q` quits, `:wq` does both, and `:q!` quits throwing changes away.',
      ],
      commands: [
        ['vi FILE', 'Opens a file in vi.'],
        ['/TEXT then Enter', 'Jumps to the next place TEXT appears.', 'key'],
        ['cw', 'Changes the word under the cursor: it deletes it and enters insert mode.', 'key'],
        [':wq', 'Writes the file and quits. :q! quits without saving.', 'key'],
      ],
    },
    'delete-lines': {
      learn: [
        "vi commands combine an action with a motion: `d` deletes, `w` is a word, so `dw` deletes a word. Doubling the action works on the whole line: `dd` deletes it and `yy` copies it. A number repeats: `3dd` deletes three lines.",
        'The global command `:g/PATTERN/COMMAND` runs a command on every line that matches. `:g/^#DEBUG/d` deletes every line starting with #DEBUG in one go. `:v/PATTERN/d` is the reverse: it deletes the lines that do not match.',
        '`u` undoes the last change and Ctrl+R redoes it, so experimenting is safe.',
      ],
      commands: [
        ['dd', 'Deletes the current line.', 'key'],
        [':g/PATTERN/d', 'Deletes every line matching PATTERN.', 'key'],
        ['u', 'Undoes the last change.', 'key'],
      ],
    },
    replace: {
      learn: [
        'Substitution is `:s/OLD/NEW/`. On its own it changes the first match on the current line. A range before it says which lines: `%` means every line, and `10,20` lines 10 to 20.',
        'Flags after it change how it matches: `g` replaces every match on a line, not just the first; `c` asks you to confirm each one; `i` ignores case. `:%s/OLD/NEW/g` is the one you will use most.',
        'The same syntax works in `sed`, the stream editor, so learning it in vi pays off in scripts too.',
      ],
      commands: [
        [':%s/OLD/NEW/g', 'Replaces every OLD with NEW in the whole file.', 'key'],
        [':%s/OLD/NEW/gc', 'Same, asking before each change.', 'key'],
        ["sed -i 's/OLD/NEW/g' FILE", 'The same change from the command line, without opening the file.'],
      ],
    },
    'new-file': {
      learn: [
        "`vi NAME` on a file that does not exist opens an empty buffer. Nothing is created until you write it with `:w`, so quitting with `:q!` leaves no trace.",
        'There are several ways into insert mode: `i` inserts before the cursor, `a` after it, `o` opens a new line below and `O` a new line above. Choose by where you want to type.',
        '`/etc/motd`, the message of the day, is shown to people as they log in: a good place for a warning or a note about the machine.',
      ],
      commands: [
        ['i', 'Starts inserting text before the cursor.', 'key'],
        ['o', 'Opens a new line below and starts inserting.', 'key'],
        ['Esc', 'Returns to normal mode.', 'key'],
        [':w', 'Writes the file without quitting.', 'key'],
      ],
    },
  },
};
