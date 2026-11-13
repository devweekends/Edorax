import type { LabLessons } from './types';

export const OPERATIONS: Record<string, LabLessons> = {
  'linux-cron': {
    'backup-job': {
      learn: [
        "cron is the scheduler that has run Unix jobs since the 1970s. A daemon wakes every minute, reads every crontab, and starts the jobs whose time matches.",
        "A crontab line is five time fields, then the command: minute (0-59), hour (0-23), day of month (1-31), month (1-12) and day of week (0-7, where 0 and 7 are Sunday). `*` means every value, `*/15` every 15th, `1-5` a range and `1,15` a list. So `0 2 * * *` is 2:00 every day.",
        'Each user edits their own table with `crontab -e`. cron runs jobs with a minimal environment and a short PATH, so scripts should use full paths to everything.',
      ],
      commands: [
        ['crontab -e', 'Edits your crontab in an editor.'],
        ['crontab -l', 'Lists your crontab.'],
        ['MINUTE HOUR DAY MONTH WEEKDAY COMMAND', 'The shape of a crontab line.', 'key'],
        ['ls -l FOLDER', 'Watches for the files a job creates.'],
      ],
    },
    'weekday-job': {
      learn: [
        "Every user has their own crontab, and their jobs run as them, with their permissions. Root can manage anyone's table with `-u USER`, which is how you set up jobs for service accounts.",
        'Day-of-week ranges make weekday schedules simple: `1-5` is Monday to Friday. When you set both day of month and day of week, cron runs the job when either matches, a surprise worth knowing.',
        'Tools such as crontab.guru explain any schedule in words, a quick way to check one before relying on it.',
      ],
      commands: [
        ['crontab -u USER -e', 'Edits another user\'s crontab, as root.'],
        ['crontab -u USER -l', 'Lists another user\'s crontab.'],
        ['echo "LINE" | crontab -u USER -', 'Replaces a crontab in one command, without an editor.'],
      ],
    },
    'fix-cleanup': {
      learn: [
        "Besides user crontabs, cron reads system files in `/etc/cron.d/` and `/etc/crontab`. Their lines have a sixth field, the user to run as, between the time and the command. A user crontab line copied there without it silently fails.",
        "cron also ignores files in `/etc/cron.d/` that other users could change, and files whose names contain a dot. It skips them without a word on the screen, so a broken job just never runs.",
        'Ready-made folders such as `/etc/cron.daily/` run every executable script inside them once a day, with no schedule line at all.',
      ],
      commands: [
        ['MIN HOUR DAY MONTH WEEKDAY USER COMMAND', 'The shape of a line in /etc/cron.d.', 'key'],
        ['ls -l /etc/cron.d', 'Shows the files, with permissions cron cares about.'],
        ['chmod 644 FILE', 'Writable by its owner only, readable by all: what cron needs.'],
      ],
    },
    'log-output': {
      learn: [
        "A cron job has no terminal. Whatever it prints is mailed to the owner if mail is set up, and lost if not, which is why many broken jobs go unnoticed for months.",
        'Redirect output to a log: `>> FILE` appends normal output, and `2>&1` sends errors (stream 2) to the same place as normal output (stream 1). Order matters: the file redirect comes first.',
        'A log with a timestamp per run answers the two questions you will be asked: did it run, and did it work.',
      ],
      commands: [
        ['COMMAND >> FILE 2>&1', 'Appends both output and errors to a log.'],
        ['tail -f FILE', 'Follows a log as new lines arrive.'],
        ['grep CRON /var/log/syslog', 'Where cron records which jobs it started, on many systems.'],
      ],
    },
  },

  'linux-package-management': {
    'dpkg-install': {
      learn: [
        "Software on Linux comes in packages: an archive of files plus information about where they go, which version this is, and what else it needs. Debian and Ubuntu use `.deb` packages.",
        '`dpkg` is the low-level tool. It installs a package file, records every file it put down, and removes them again. It checks dependencies but never fetches them.',
        "`dpkg -l` lists installed packages; `ii` at the start of a line means installed and fine.",
      ],
      commands: [
        ['dpkg -i FILE.deb', 'Installs a package file.'],
        ['dpkg -l NAME', 'Shows whether a package is installed, and its version.'],
        ['dpkg -L NAME', 'Lists every file a package installed.'],
        ['dpkg -r NAME', 'Removes a package.'],
      ],
    },
    'local-repo': {
      learn: [
        "`apt` sits on top of dpkg. It reads package lists from repositories, works out dependencies, downloads what is missing and installs everything in the right order.",
        'Sources are lines in `/etc/apt/sources.list` and in files under `/etc/apt/sources.list.d/`. A repository can be a web server or a local folder with a `Packages` index. `[trusted=yes]` skips signature checks, acceptable only for a folder you control.',
        '`apt-get update` refreshes the lists from every source; then `install` uses them. Servers without internet often use a local mirror like this one.',
      ],
      commands: [
        ['echo "deb [trusted=yes] file:FOLDER ./" > /etc/apt/sources.list.d/NAME.list', 'Adds a folder as a package source.'],
        ['apt-get update', 'Refreshes package lists from every source.'],
        ['apt-get install -y NAME', 'Installs a package and its dependencies.'],
        ['apt-cache policy NAME', 'Shows which versions are available and from where.'],
      ],
    },
    hold: {
      learn: [
        'Upgrades are usually good, but sometimes an app is tested against one exact version of a tool. A hold tells apt to leave a package alone during upgrades until you release it.',
        'Holds are easy to forget, and forgotten holds leave security fixes uninstalled. Note why you held something, and check `apt-mark showhold` now and then.',
      ],
      commands: [
        ['apt-mark hold NAME', 'Freezes a package at its current version.'],
        ['apt-mark showhold', 'Lists held packages.'],
        ['apt-mark unhold NAME', 'Releases a hold.'],
      ],
    },
    repair: {
      learn: [
        "dpkg keeps a list of every file each package installed, with a checksum. When a program goes missing or acts strangely, ask which package owns it, then check that package against its record.",
        "`dpkg -S PATH` names the owner of a file. `dpkg --verify NAME` reports files that are missing or changed. Reinstalling the package puts its original files back without touching your configuration.",
        'In container images, documentation such as man pages is often left out on purpose, so verify may list those as missing. That is expected.',
      ],
      commands: [
        ['dpkg -S PATH', 'Names the package that owns a file.'],
        ['dpkg --verify NAME', 'Reports missing or changed files in a package.'],
        ['apt-get install --reinstall NAME', 'Reinstalls a package, restoring its files.'],
      ],
    },
  },

  'linux-rpm-yum': {
    'rpm-install': {
      learn: [
        "Red Hat Enterprise Linux and its rebuilds, Rocky Linux, AlmaLinux and Fedora, use `.rpm` packages. The ideas match Debian's: `rpm` is the low-level tool, like dpkg, and `dnf`, formerly yum, is the high-level one, like apt.",
        "`rpm` installs package files and refuses when a dependency is missing, naming exactly what is needed. You can install several files in one command, and rpm orders them itself.",
        'Package names carry version, release and architecture: `jq-1.6-19.el9.x86_64.rpm` is jq version 1.6, release 19, for EL9 on 64-bit Intel or AMD.',
      ],
      commands: [
        ['rpm -ivh FILE.rpm...', 'Installs package files, verbose with a progress bar.'],
        ['rpm -q NAME', 'Shows whether a package is installed, and its version.'],
        ['rpm -qa', 'Lists every installed package.'],
        ['rpm -e NAME', 'Removes a package.'],
      ],
    },
    'local-repo': {
      learn: [
        "dnf reads repository definitions from `.repo` files in `/etc/yum.repos.d/`. Each section starts with an id in brackets and sets a `name`, a `baseurl`, whether it is `enabled`, and whether to check signatures with `gpgcheck`.",
        "If any enabled repository cannot be reached, dnf may stop with an error. On an offline server, disable the online ones and point dnf at a local mirror. `dnf config-manager` turns repositories on and off without editing files.",
        '`dnf repolist` shows enabled repositories, `dnf install` resolves dependencies like apt, and `dnf history` records every transaction, so one can be undone.',
      ],
      commands: [
        ['dnf repolist', 'Lists enabled repositories.'],
        ['dnf config-manager --set-disabled ID...', 'Disables repositories by id.'],
        ['dnf install -y NAME', 'Installs a package and its dependencies.'],
        ['cat /etc/yum.repos.d/FILE.repo', 'Shows a repository definition.'],
      ],
    },
    repair: {
      learn: [
        "rpm records each installed file's size, checksum, permissions, owner and time. `rpm -V NAME` compares them with the disk and prints one line per difference. In its codes, `S` is size, `5` checksum, `M` mode and `T` time; a `c` marks config files, which you are expected to change.",
        "`rpm -Va` verifies everything, a quick way to spot tampering after a break-in. When a program's files are damaged, `dnf reinstall` puts the original files back from the repository.",
      ],
      commands: [
        ['rpm -qf PATH', 'Names the package that owns a file.'],
        ['rpm -V NAME', 'Lists files that differ from what the package installed.'],
        ['dnf reinstall -y NAME', 'Reinstalls a package, restoring its files.'],
      ],
    },
    query: {
      learn: [
        "rpm's database knows everything about installed packages. `-qi` shows a summary, `-ql` the files, `-qR` what it requires, and `--changelog` its history of fixes.",
        "`--qf` (query format) prints just the fields you ask for, using tags such as `%{NAME}`, `%{VERSION}` and `%{RELEASE}`. Scripts and inventories use it to collect exact versions across many servers.",
      ],
      commands: [
        ['rpm -qi NAME', 'Shows a package\'s details.'],
        ['rpm -ql NAME', 'Lists the files a package installed.'],
        ["rpm -q --qf '%{FIELD}\\n' NAME", 'Prints one field, such as VERSION.'],
      ],
    },
  },
};
