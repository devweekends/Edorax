import type { ShellLab } from '../domain/shell-labs';

export const linuxSshAndScp: ShellLab = {
  slug: 'linux-ssh-and-scp',
  topic: 'linux',
  level: 'beginner',
  tags: ['SSH', 'SCP', 'Remote access'],
  title: 'SSH keys, a hardened server and scp',
  summary: 'Start an SSH server on a custom port, log in with a key, turn off passwords and root login, then copy files both ways with scp.',
  scenario:
    'web1 is a new server. Team policy says SSH listens on port 2222, people log in with keys, never passwords, and nobody logs in as root. The release has to go up to the deploy account, and yesterday\'s deploy log has to come back for review. Here you are root, and the deploy account lives on the same machine, so `localhost` plays the part of the remote server. The machine has no network and cannot reach your computer.',
  minutes: 30,
  machine: {
    name: 'web1',
    image: 'ubuntu:24.04',
    packages: ['openssh-server', 'openssh-client', 'nano'],
    capabilities: ['SYS_CHROOT', 'AUDIT_WRITE'],
  },
  setup: `set -e
useradd -m -s /bin/bash deploy
echo "deploy:Deploy-2026" | chpasswd
# Containers cannot set a login uid; keep PAM from refusing every login because of it.
sed -i 's/^session\\s\\+required\\s\\+pam_loginuid.so/session optional pam_loginuid.so/' /etc/pam.d/sshd
mkdir -p /run/sshd
# A broken earlier attempt: the key folder is open to everyone, so sshd will not trust it.
install -d -m 777 -o deploy -g deploy /home/deploy/.ssh
install -d -o deploy -g deploy /home/deploy/releases /home/deploy/logs
printf '2026-11-12 09:14 deploy 1.9.0 ok\\n2026-11-12 17:40 deploy 1.9.1 failed: migration timeout\\n' > /home/deploy/logs/deploy.log
chown deploy:deploy /home/deploy/logs/deploy.log
mkdir -p /root/release
head -c 65536 /dev/urandom > /root/release/app-2.0.tar.gz
sha256sum /root/release/app-2.0.tar.gz | awk '{print $1}' > /root/.edorax-release-sum
chmod 600 /root/.edorax-release-sum
`,
  // Like a service enabled at boot: once sshd is set to port 2222, it comes back after a restart.
  boot: 'if sshd -T 2>/dev/null | grep -qx "port 2222" && ! pgrep -x sshd >/dev/null; then mkdir -p /run/sshd; /usr/sbin/sshd; fi',
  steps: [
    {
      id: 'start-sshd',
      goal: 'Run the SSH server, listening on port 2222.',
      body: 'The OpenSSH server, `sshd`, is installed but not running, and it would listen on the default port 22. Its settings are in `/etc/ssh/sshd_config`; files in `/etc/ssh/sshd_config.d/` are read first and win. There is no service manager on this machine, so start the server by running it.',
      hints: [
        'Set the port in the config, check the config, then start the server.',
        'The setting is `Port 2222`. `sshd -t` checks the config and prints nothing when it is fine. Start the server with its full path, `/usr/sbin/sshd`.',
        'For port 2200: `echo "Port 2200" > /etc/ssh/sshd_config.d/10-port.conf`, then `sshd -t`, then `/usr/sbin/sshd`. `ssh -p 2200 localhost` should now ask about the host key.',
      ],
      checks: [
        { id: 'running', label: 'sshd is running', run: 'pgrep -x sshd >/dev/null', fail: 'sshd is not running. Start it with /usr/sbin/sshd.' },
        { id: 'port', label: 'It listens on port 2222', run: "timeout 3 bash -c 'exec 3<>/dev/tcp/127.0.0.1/2222; head -c 4 <&3' | grep -q SSH", fail: 'Nothing answers SSH on port 2222. Set Port 2222, then restart sshd: `pkill sshd; /usr/sbin/sshd`.' },
      ],
      solution: 'echo "Port 2222" > /etc/ssh/sshd_config.d/10-port.conf && /usr/sbin/sshd',
    },
    {
      id: 'key-login',
      goal: 'Log in as deploy@localhost on port 2222 with a key pair, without a password.',
      body: 'A key pair is two files: the private key stays with you, the public key goes into `~/.ssh/authorized_keys` of the account you log in to. sshd is strict: if that folder or file can be changed by other people, it ignores the key. Someone already made `/home/deploy/.ssh`, and got that wrong.',
      hints: [
        'Make a key pair as root, put the public half in deploy\'s authorized_keys, and fix the permissions sshd insists on.',
        '`ssh-keygen -t ed25519` makes the pair. `ssh-copy-id -p 2222 deploy@localhost` installs it with deploy\'s password, Deploy-2026. `~/.ssh` must be 700 and authorized_keys 600, both owned by deploy.',
        'For user ops on port 2200: `ssh-keygen -t ed25519 -N ""`, `chmod 700 /home/ops/.ssh`, `ssh-copy-id -p 2200 ops@localhost`, then `ssh -p 2200 ops@localhost` logs in without asking for a password.',
      ],
      checks: [
        { id: 'folder', label: "deploy's .ssh is private", run: '[ "$(stat -c %a:%U /home/deploy/.ssh)" = 700:deploy ]', fail: '/home/deploy/.ssh should be mode 700 and owned by deploy.' },
        { id: 'key-works', label: 'root logs in as deploy with a key', run: 'timeout 10 ssh -p 2222 -o BatchMode=yes -o PasswordAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5 deploy@localhost true', fail: 'A key login as deploy@localhost on port 2222 does not work yet. Check the key is in authorized_keys and the permissions.' },
      ],
      solution:
        'install -d -m 700 /root/.ssh && ssh-keygen -q -t ed25519 -N "" -f /root/.ssh/id_ed25519 && chmod 700 /home/deploy/.ssh && install -m 600 -o deploy -g deploy /root/.ssh/id_ed25519.pub /home/deploy/.ssh/authorized_keys',
    },
    {
      id: 'harden',
      goal: 'Turn off password logins and root logins, and make the running server use the change.',
      body: 'Keys now work, so passwords are only a way in for people guessing them. Root should never log in directly either: log in as yourself and use sudo. Change both settings, then tell the running sshd to read its config again. Editing the file alone changes nothing until sshd reloads.',
      hints: [
        'Two settings in the config, a config check, then a signal to the running server.',
        'The settings are `PasswordAuthentication no` and `PermitRootLogin no`. `sshd -T` prints the settings sshd would use. `kill -HUP` with the number in /run/sshd.pid makes it reload.',
        'On another server: `printf "PasswordAuthentication no\\nPermitRootLogin no\\n" > /etc/ssh/sshd_config.d/20-hardening.conf`, `sshd -t`, `kill -HUP $(cat /run/sshd.pid)`. A password-only login now says Permission denied (publickey).',
      ],
      checks: [
        { id: 'config', label: 'The config refuses passwords and root', run: 'sshd -T 2>/dev/null | grep -qx "passwordauthentication no" && sshd -T 2>/dev/null | grep -qx "permitrootlogin no"', fail: 'sshd -T still shows password logins or root login allowed.' },
        { id: 'live', label: 'The running server refuses passwords', run: "out=$(timeout 10 ssh -p 2222 -o BatchMode=yes -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5 deploy@localhost true 2>&1); echo \"$out\" | grep -q 'Permission denied (publickey)'", fail: 'The running sshd still offers password logins. Reload it: kill -HUP $(cat /run/sshd.pid).' },
        { id: 'key-still', label: 'Key login still works', run: 'timeout 10 ssh -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5 deploy@localhost true', fail: 'Key login stopped working. Do not lock yourself out: keep PubkeyAuthentication on.' },
      ],
      solution:
        'printf "PasswordAuthentication no\\nPermitRootLogin no\\n" > /etc/ssh/sshd_config.d/20-hardening.conf && kill -HUP "$(cat /run/sshd.pid)" && sleep 1',
    },
    {
      id: 'scp',
      goal: 'Copy the release up to /home/deploy/releases with scp, and bring deploy.log back to /root.',
      body: 'scp copies files over SSH, with the same keys and the same port. The remote side is written `user@host:path`. Upload `/root/release/app-2.0.tar.gz` into deploy\'s releases folder, then download `/home/deploy/logs/deploy.log` to `/root`. Files that arrive by scp belong to the account you logged in as, which is how the checks can tell.',
      hints: [
        'Two scp commands: one with the remote side last (upload), one with the remote side first (download).',
        'scp takes the port as a capital `-P`, unlike ssh. `scp -P 2222 LOCAL deploy@localhost:REMOTE` uploads; swap the two to download.',
        'For a site.zip going to ops: `scp -P 2200 /root/site.zip ops@localhost:/home/ops/sites/`, then `scp -P 2200 ops@localhost:/home/ops/error.log /root/`. `ls -l` on each side shows the files.',
      ],
      checks: [
        { id: 'uploaded', label: 'The release arrived intact, owned by deploy', run: 'f=/home/deploy/releases/app-2.0.tar.gz; [ -f "$f" ] && [ "$(stat -c %U "$f")" = deploy ] && [ "$(sha256sum "$f" | awk \'{print $1}\')" = "$(cat /root/.edorax-release-sum)" ]', fail: 'app-2.0.tar.gz is not in /home/deploy/releases, is not owned by deploy, or is not the same file. Copy it with scp as deploy.' },
        { id: 'downloaded', label: 'deploy.log is in /root', run: 'grep -q "migration timeout" /root/deploy.log 2>/dev/null', fail: '/root/deploy.log is missing. Download it with scp from deploy@localhost.' },
      ],
      solution:
        'scp -q -P 2222 -o BatchMode=yes -o StrictHostKeyChecking=accept-new /root/release/app-2.0.tar.gz deploy@localhost:/home/deploy/releases/ && scp -q -P 2222 -o BatchMode=yes deploy@localhost:/home/deploy/logs/deploy.log /root/',
    },
  ],
};
