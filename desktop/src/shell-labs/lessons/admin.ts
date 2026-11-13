import type { LabLessons } from './types';

export const ADMIN: Record<string, LabLessons> = {
  'linux-users-and-permissions': {
    'user-and-group': {
      learn: [
        "Linux is multi-user: every process runs as some user, and every file belongs to a user and a group. Accounts are listed in `/etc/passwd`, groups in `/etc/group`, and password hashes in `/etc/shadow`, which only root can read.",
        "A user has one primary group, used for the files they create, and can be in any number of extra groups. Groups are how people share: give a folder to a group, and everyone in it gets access.",
        '`useradd` creates the account but, unless told, not the home folder. `-m` makes `/home/NAME`, `-s` sets the login shell and `-G` adds extra groups. `id NAME` shows the result.',
      ],
      commands: [
        ['groupadd GROUP', 'Creates a group.'],
        ['useradd -m -s /bin/bash -G GROUP USER', 'Creates a user with a home folder, Bash as shell and an extra group.'],
        ['usermod -aG GROUP USER', 'Adds an existing user to a group. Forgetting -a removes their other groups.'],
        ['id USER', 'Shows a user\'s id and every group they are in.'],
      ],
    },
    'shared-folder': {
      learn: [
        "Every file has three sets of permissions: for its owner (u), its group (g) and everyone else (o). Each set is read (r), write (w) and execute (x). `ls -l` shows them as nine letters, such as `rwxr-x---`.",
        "As numbers, r is 4, w is 2 and x is 1, added up per set: 7 is rwx, 5 is r-x, 0 is nothing. So 750 means the owner can do everything, the group can read and enter, and others get nothing. On a folder, x means you may enter it.",
        "A fourth digit in front holds special bits. On a folder, setgid (2) makes new files inherit the folder's group instead of their creator's, which keeps a team folder owned by the team.",
      ],
      commands: [
        ['chgrp GROUP PATH', 'Gives a file or folder to a group.'],
        ['chmod MODE PATH', 'Sets permissions, as numbers like 750 or letters like g+w.'],
        ['ls -ld FOLDER', 'Shows a folder\'s own permissions rather than its contents.'],
        ['su -s /bin/bash USER -c "COMMAND"', 'Tests access by running a command as another user.'],
      ],
    },
    'deploy-script': {
      learn: [
        'To run a file as a program, it needs the execute bit; without it the shell says "Permission denied", even for root running it by name. Scripts copied around often lose it.',
        "Write access is the bigger risk. If anyone can edit a script that an admin or a deploy job runs, anyone can make it do anything with that runner's rights. Scripts should be writable by their owner only.",
        '755 is the usual mode for programs: the owner reads, writes and runs; everyone else reads and runs. 700 keeps a script private to its owner.',
      ],
      commands: [
        ['ls -l FILE', 'Shows a file\'s permissions, owner and group.'],
        ['chmod 755 FILE', 'Owner rwx, everyone else r-x: the usual mode for programs.'],
        ['chmod go-w FILE', 'Takes write away from the group and others, leaving the rest alone.'],
      ],
    },
    'full-log': {
      learn: [
        'A full disk breaks almost everything: logins, databases and the apps that keep writing. Logs are the usual culprit, because they grow forever unless something rotates them.',
        "Deleting a log that a service holds open does not free the space: the service keeps writing to the deleted file until it restarts. Emptying the file in place keeps the same file, so the space comes back at once and the service keeps logging.",
        'The safe tools are `truncate -s 0 FILE` or `: > FILE`. In real life, set up `logrotate` so it does not happen again.',
      ],
      commands: [
        ['ls -lhS FOLDER', 'Lists files biggest first, with readable sizes.'],
        ['truncate -s 0 FILE', 'Empties a file but keeps it, its owner and its permissions.'],
        ['df -h', 'Shows free space on each filesystem.'],
      ],
    },
  },

  'linux-account-management': {
    sudo: {
      learn: [
        "Sharing the root password means nobody knows who did what. sudo instead lets a named user run chosen commands as root, asks for their own password, and logs every command they ran.",
        'Rules live in `/etc/sudoers` and in files under `/etc/sudoers.d/`. A rule reads `WHO WHERE=(AS_WHOM) WHAT`: `ALL=(ALL:ALL) ALL` means on any host, as any user or group, any command. Narrower rules are safer, such as only restarting one service.',
        'A syntax error in sudoers can lock every admin out. `visudo` edits with a check before saving, and `visudo -c` checks every file. Files there must not be writable by others; 0440 is the norm.',
      ],
      commands: [
        ['visudo -c', 'Checks every sudoers file for errors.'],
        ['visudo -f /etc/sudoers.d/NAME', 'Edits one rule file safely.'],
        ['sudo -l -U USER', 'Lists what a user may run with sudo.'],
        ['chmod 440 FILE', 'Read-only for owner and group: the mode sudoers files need.'],
      ],
    },
    ageing: {
      learn: [
        "Each account has ageing rules in `/etc/shadow`: when the password was last changed, the minimum and maximum days between changes, and how many days ahead to warn. After the maximum, the user must choose a new password at login.",
        "`chage` changes these rules and `chage -l` shows them in plain words. Many security standards ask for a maximum age, though current advice favours long passphrases and checks against leaked passwords over frequent changes.",
      ],
      commands: [
        ['chage -l USER', 'Shows a user\'s password ageing in plain words.'],
        ['chage -M DAYS USER', 'Sets the maximum days before a password must change.'],
        ['chage -W DAYS USER', 'Sets how many days ahead the user is warned.'],
        ['chage -d 0 USER', 'Forces a new password at the next login.'],
      ],
    },
    'lock-tom': {
      learn: [
        "When someone leaves, stop their access first and tidy up later. Deleting the account at once loses files nobody has looked at yet, and anything they owned, such as cron jobs or shared folders, may break.",
        "Locking puts a `!` in front of the password hash, so no password can match it. But SSH keys do not use the password, so set the shell to `/usr/sbin/nologin` as well: it refuses any interactive login, whatever the method.",
        '`passwd -S USER` shows the state: L for locked, P for a usable password.',
      ],
      commands: [
        ['usermod -L USER', 'Locks the password.'],
        ['usermod -s /usr/sbin/nologin USER', 'Gives the user a shell that refuses logins.'],
        ['passwd -S USER', 'Shows whether the account is locked.'],
        ['userdel -r USER', 'Deletes a user and their home. Only once their files are safe.'],
      ],
    },
    'hand-over': {
      learn: [
        "Files belong to a user by number, the UID. If an account is deleted and a new one later gets the same UID, the newcomer silently owns the old files. Handing work over before deleting avoids that.",
        '`find -user NAME` lists everything a user owns, anywhere. Combined with `-exec chown`, it moves ownership in one pass. Archiving the home folder with tar keeps a copy, owners and permissions included, before it is removed.',
      ],
      commands: [
        ['find PATH -user USER', 'Lists everything under PATH that USER owns.'],
        ['find PATH -user USER -exec chown NEWUSER:GROUP {} +', 'Gives all of those files to someone else.'],
        ['tar -czf ARCHIVE.tar.gz -C /home USER', 'Archives a home folder.'],
      ],
    },
  },

  'linux-ownership-and-access': {
    'hand-over': {
      learn: [
        "Services should run as their own unprivileged user, never as root. If a web app is broken into, the attacker gets only what that user can touch. That user then needs to own the files it must write, such as caches and uploads.",
        '`chown USER:GROUP PATH` changes owner and group together, and `-R` applies it to a whole tree. Only root can give files away: otherwise anyone could hand their files to someone else and use up that person\'s quota.',
      ],
      commands: [
        ['chown USER:GROUP PATH', 'Changes the owner and group.'],
        ['chown -R USER:GROUP FOLDER', 'Does it for the folder and everything inside it.'],
        ['ls -lR FOLDER', 'Lists a tree with owners, to check the result.'],
      ],
    },
    'sticky-drop': {
      learn: [
        "On a folder, write permission means you may create, rename and delete names in it, including other people's files. That is fine in a private folder and a problem in a shared one.",
        "The sticky bit fixes it: in a sticky folder, only a file's owner, the folder's owner or root can delete or rename it. `/tmp` is the classic example, mode 1777. `ls -ld` shows it as a `t` in the last place.",
        "It is the leading 1 in a four-digit mode, or `+t` with letters.",
      ],
      commands: [
        ['chmod +t FOLDER', 'Sets the sticky bit.'],
        ['chmod 1777 FOLDER', 'Open to everyone, and only owners may delete.'],
        ['ls -ld /tmp', 'Shows what a sticky shared folder looks like.'],
      ],
    },
    'acl-reader': {
      learn: [
        "Owner, group and others give exactly three audiences. Real life often needs a fourth: one auditor, one service. Adding them to the group might open other files too. Access control lists (ACLs) add rules for named users or groups on a single file or folder.",
        "ACL rules sit beside the normal mode and do not change it. `ls -l` shows a `+` after the mode when a file has an ACL. To reach a file, a user also needs x on every folder on the way, so ACLs often come in pairs.",
        'The mask entry caps what ACL rules can grant. If a rule seems ignored, look at the mask in `getfacl`.',
      ],
      commands: [
        ['setfacl -m u:USER:PERMS PATH', 'Adds or changes a rule for one user, such as r or rx.'],
        ['getfacl PATH', 'Shows the normal permissions and every ACL rule.'],
        ['setfacl -x u:USER PATH', 'Removes that user\'s rule.'],
      ],
    },
    setuid: {
      learn: [
        "Normally a program runs with the rights of whoever starts it. The setuid bit makes it run as the file's owner instead. That is how `passwd` lets any user update `/etc/shadow`: it is owned by root and setuid.",
        "A setuid root program is a door to root. If it can be tricked into running other commands, as a copy of a shell can, anyone becomes root. Security scans list setuid files for exactly this reason.",
        '`ls -l` shows the bit as an `s` where the owner\'s x would be. `find -perm -4000` finds them all.',
      ],
      commands: [
        ['find PATH -type f -perm -4000', 'Lists setuid files.'],
        ['chmod u-s FILE', 'Removes the setuid bit, keeping the file.'],
        ['ls -l FILE', 'Shows rws instead of rwx when setuid is set.'],
      ],
    },
  },

  'linux-ssh-and-scp': {
    'start-sshd': {
      learn: [
        "SSH gives you a secure, encrypted shell on another machine. The server is `sshd`, listening on TCP port 22 by default. Clients connect with `ssh USER@HOST`.",
        "sshd reads `/etc/ssh/sshd_config`, and on modern systems the files in `/etc/ssh/sshd_config.d/` first. For most settings the first value read wins, so drop-in files override the main file.",
        "`sshd -t` checks the configuration without starting anything, and `sshd -T` prints every setting it would use. Always test before restarting: a broken sshd on a remote server can lock you out.",
      ],
      commands: [
        ['sshd -t', 'Checks the server configuration for errors.'],
        ['sshd -T | grep -i WORD', 'Shows the setting sshd would actually use.'],
        ['/usr/sbin/sshd', 'Starts the SSH server directly. Usually systemctl start ssh.'],
        ['ss -ltn', 'Lists listening TCP ports, to see sshd on its port.'],
      ],
    },
    'key-login': {
      learn: [
        "A key pair is a private key that never leaves your machine and a public key you hand out. The server keeps your public key in `~/.ssh/authorized_keys`. At login it asks you to prove you hold the private key, without the key ever being sent.",
        "Keys beat passwords: they cannot be guessed, and they cannot be phished from a fake login page. `ssh-keygen -t ed25519` makes a modern pair. `ssh-copy-id` installs your public key on a server for you.",
        "sshd's StrictModes refuses keys if `~/.ssh` or `authorized_keys` could be changed by other people, because then anyone could add their own key. `.ssh` must be 700 and `authorized_keys` 600, both owned by the user.",
      ],
      commands: [
        ['ssh-keygen -t ed25519', 'Makes a key pair in ~/.ssh.'],
        ['ssh-copy-id -p PORT USER@HOST', 'Installs your public key on a server.'],
        ['chmod 700 ~/.ssh', 'Keeps the key folder private, as sshd insists.'],
        ['ssh -p PORT USER@HOST', 'Logs in.'],
      ],
    },
    harden: {
      learn: [
        "Every server on the internet is probed for SSH passwords around the clock. Once keys work, password logins give attackers something to guess and you nothing in return.",
        "Root should not log in directly either: people log in as themselves and use sudo, so every action is traced to a person. `PasswordAuthentication no` and `PermitRootLogin no` are the two settings almost every hardening guide starts with.",
        'Changing the file is not enough: the running sshd must reload it. Sending it HUP does that without dropping open sessions. Keep a second session open while you change SSH, in case you lock yourself out.',
      ],
      commands: [
        ['PasswordAuthentication no', 'A line for the sshd config file: only keys and similar methods are accepted.', 'key'],
        ['PermitRootLogin no', 'A line for the sshd config file: root cannot log in directly.', 'key'],
        ['kill -HUP "$(cat /run/sshd.pid)"', 'Makes the running sshd reload its configuration.'],
      ],
    },
    scp: {
      learn: [
        "`scp` copies files over SSH, with the same encryption, keys and port. A remote path is written `USER@HOST:PATH`. Whichever side the remote path is on decides the direction: remote last uploads, remote first downloads.",
        "scp takes the port as a capital `-P`, unlike ssh's lower-case `-p`, a difference that trips everyone up once. `-r` copies folders. For large or repeated copies, `rsync` over SSH sends only what changed.",
      ],
      commands: [
        ['scp -P PORT FILE USER@HOST:FOLDER/', 'Uploads a file.'],
        ['scp -P PORT USER@HOST:FILE FOLDER/', 'Downloads a file.'],
        ['scp -r -P PORT FOLDER USER@HOST:PATH', 'Copies a whole folder.'],
        ['sha256sum FILE', 'Prints a checksum, to prove a copy is identical.'],
      ],
    },
  },
};
