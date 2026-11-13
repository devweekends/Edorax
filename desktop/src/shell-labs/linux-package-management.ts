import type { ShellLab } from '../domain/shell-labs';

export const linuxPackageManagement: ShellLab = {
  slug: 'linux-package-management',
  topic: 'linux',
  level: 'beginner',
  tags: ['Package management', 'apt', 'dpkg'],
  title: 'Package management with apt and dpkg',
  summary: 'Install a package file by hand, set up a local repository so apt solves dependencies for you, pin a version and repair a broken package.',
  scenario:
    'pkg1 sits on a network with no internet, like many production servers. The team keeps approved packages in a local folder, /opt/repo. You need two tools installed, one package frozen at its version, and the hostname command back after someone deleted it. You are root.',
  minutes: 60,
  machine: {
    name: 'pkg1',
    image: 'ubuntu:24.04',
    packages: ['apt-utils'],
    build: `mkdir -p /opt/repo
cd /opt/repo
apt-get update -qq
apt-get download -q tree jq libjq1 libonig5 hostname >/dev/null
apt-ftparchive packages . > Packages
rm -rf /var/lib/apt/lists/*`,
  },
  setup: `set -e
rm -f /usr/bin/hostname
`,
  steps: [
    {
      id: 'dpkg-install',
      goal: 'Install the tree package from its .deb file in /opt/repo.',
      body: 'A `.deb` file is one Debian or Ubuntu package: the program, where its files go, and what else it needs. `dpkg` is the low-level tool that installs a package file and keeps the list of what is installed.',
      hints: [
        'Find the tree .deb in /opt/repo and install that file directly.',
        '`ls /opt/repo` shows the files. `dpkg -i FILE.deb` installs one. `dpkg -l tree` shows ii when it is installed.',
        'For a file htop_3.3_amd64.deb in /root: `dpkg -i /root/htop_3.3_amd64.deb`, then `dpkg -l htop` and `htop --version`.',
      ],
      checks: [
        { id: 'installed', label: 'tree is installed', run: "dpkg-query -W -f='${Status}' tree 2>/dev/null | grep -q 'install ok installed'", fail: 'dpkg does not list tree as installed.' },
        { id: 'runs', label: 'The tree command works', run: 'tree --version >/dev/null 2>&1', fail: 'The tree command does not run.' },
      ],
      solution: 'dpkg -i /opt/repo/tree_*.deb',
    },
    {
      id: 'local-repo',
      goal: 'Add /opt/repo as an apt source and install jq with apt, dependencies included.',
      body: 'jq needs two libraries. `dpkg -i jq*.deb` alone would fail and tell you so. apt reads lists of available packages from its sources, works out the dependencies and installs them in the right order. A source line for a folder is `deb [trusted=yes] file:/opt/repo ./`.',
      hints: [
        'Write a source file in /etc/apt/sources.list.d, refresh the lists, then install jq.',
        'Put the source line in /etc/apt/sources.list.d/local.list. `apt-get update` refreshes, and warnings about the internet sources are expected here. Then `apt-get install -y jq`.',
        'For a folder repo /srv/debs: `echo "deb [trusted=yes] file:/srv/debs ./" > /etc/apt/sources.list.d/debs.list`, `apt-get update`, `apt-get install -y mytool`.',
      ],
      checks: [
        { id: 'source', label: 'apt has /opt/repo as a source', run: 'grep -rhsE "^deb .*file:/+opt/repo" /etc/apt/sources.list /etc/apt/sources.list.d/', fail: 'No apt source line points at file:/opt/repo.' },
        { id: 'jq', label: 'jq and its libraries are installed', run: "jq --version >/dev/null 2>&1 && dpkg-query -W -f='${Status}' libjq1 2>/dev/null | grep -q 'install ok installed'", fail: 'jq is not installed with its libraries.' },
      ],
      solution: 'echo "deb [trusted=yes] file:/opt/repo ./" > /etc/apt/sources.list.d/local.list && apt-get update -q >/dev/null 2>&1; apt-get install -y -q jq >/dev/null',
    },
    {
      id: 'hold',
      goal: 'Freeze jq at its current version, so upgrades leave it alone.',
      body: 'Sometimes an app is tested against one version of a tool and must not move. A hold tells apt to skip a package during upgrades until you release it.',
      hints: [
        'apt-mark can mark a package as held.',
        '`apt-mark hold jq` holds it. `apt-mark showhold` lists held packages, and `apt-mark unhold` releases one.',
        'For nginx: `apt-mark hold nginx`, then `apt-mark showhold` prints nginx.',
      ],
      checks: [{ id: 'held', label: 'jq is held', run: 'apt-mark showhold 2>/dev/null | grep -qx jq', fail: 'jq is not held.' }],
      solution: 'apt-mark hold jq >/dev/null',
    },
    {
      id: 'repair',
      goal: 'The hostname command has been deleted. Find the package it belongs to and reinstall it.',
      body: 'dpkg remembers every file each package installed. When a file goes missing, ask which package owns its path, then reinstall that package to put its files back. `dpkg --verify PACKAGE` reports missing or changed files.',
      hints: [
        'Ask dpkg which package owns /usr/bin/hostname, then reinstall it with apt.',
        '`dpkg -S /usr/bin/hostname` names the package. `apt-get install --reinstall PACKAGE` puts it back from your local repo.',
        'If /usr/bin/xargs vanished: `dpkg -S /usr/bin/xargs` says findutils, then `apt-get install --reinstall findutils` and `dpkg --verify findutils` prints nothing.',
      ],
      checks: [
        { id: 'back', label: 'hostname works again', run: '[ -x /usr/bin/hostname ] && /usr/bin/hostname >/dev/null', fail: '/usr/bin/hostname is still missing.' },
        { id: 'verified', label: 'The package is intact', run: '[ -z "$(dpkg --verify hostname 2>&1 | grep -v " /usr/share/")" ]', fail: 'dpkg --verify hostname still reports a missing or changed program file.' },
      ],
      solution: 'apt-get install -y -q --reinstall hostname >/dev/null',
    },
  ],
};
