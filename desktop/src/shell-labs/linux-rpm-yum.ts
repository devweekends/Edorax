import type { ShellLab } from '../domain/shell-labs';

export const linuxRpmYum: ShellLab = {
  slug: 'linux-rpm-yum',
  topic: 'linux',
  level: 'beginner',
  tags: ['RPM', 'YUM', 'Package management'],
  title: 'Packages on Red Hat systems: rpm and dnf (yum)',
  summary: 'On a Rocky Linux server, install packages by hand and through a local repository, find and repair a damaged package and query versions.',
  scenario:
    'rhel1 runs Rocky Linux, a free rebuild of Red Hat Enterprise Linux, where packages are .rpm files and yum (now called dnf) installs them. It has no internet, so its online repositories cannot work. Approved packages are in /opt/rpms. Last night\'s backups also failed with "tar: command not found or broken". You are root.',
  minutes: 60,
  machine: {
    name: 'rhel1',
    image: 'rockylinux:9.3',
    packages: ['procps-ng'],
    // The repaired package must not carry file capabilities (shadow-utils does): writing those
    // needs CAP_SETFCAP, which lab machines do not get. tar has none.
    build: `dnf -y -q upgrade tar
dnf -y -q install createrepo_c dnf-plugins-core
mkdir -p /opt/rpms
dnf download -q --arch "$(uname -m)" --arch noarch --destdir /opt/rpms tree jq oniguruma tar
createrepo_c -q /opt/rpms
dnf clean all -q`,
  },
  setup: `set -e
printf 'garbage\\n' > /usr/bin/tar
`,
  steps: [
    {
      id: 'rpm-install',
      goal: 'Install jq from the .rpm files in /opt/rpms with rpm, dependency included.',
      body: '`rpm` installs package files directly, like dpkg on Ubuntu. It checks dependencies but does not fetch them: if jq needs a library, rpm stops and names it, and you install both together.',
      hints: [
        'Try installing the jq file and read what rpm says is missing. Then install both files in one command.',
        '`rpm -ivh FILE.rpm` installs with progress. jq needs oniguruma; give both files to one rpm command. `rpm -q jq` confirms.',
        'For an app needing libfoo: `rpm -ivh /root/libfoo-1.2.rpm /root/app-3.0.rpm`, then `rpm -q app`.',
      ],
      checks: [
        { id: 'installed', label: 'jq is installed', run: 'rpm -q jq >/dev/null 2>&1', fail: 'rpm -q jq says jq is not installed.' },
        { id: 'runs', label: 'jq works', run: 'echo \'{"ok":true}\' | jq -e .ok >/dev/null 2>&1', fail: 'jq is installed but does not run.' },
      ],
      solution: `rpm -ivh /opt/rpms/oniguruma-*.$(uname -m).rpm /opt/rpms/jq-*.$(uname -m).rpm`,
    },
    {
      id: 'local-repo',
      goal: 'Make /opt/rpms the only enabled repository, then install tree with dnf.',
      body: 'dnf reads repository definitions from `/etc/yum.repos.d/*.repo`. A repository can be a folder: `baseurl=file:///opt/rpms`. The online repositories cannot be reached from here and make dnf fail, so disable them. `dnf repolist` shows which are enabled.',
      hints: [
        'Write a .repo file for the folder, disable the other repositories, then dnf install tree.',
        'A repo file has `[local]`, `name=Local`, `baseurl=file:///opt/rpms`, `enabled=1` and `gpgcheck=0`. `dnf config-manager --set-disabled baseos appstream extras` disables the online ones.',
        'For a folder /srv/rpms: write /etc/yum.repos.d/mirror.repo with [mirror], baseurl=file:///srv/rpms, enabled=1, gpgcheck=0, then `dnf repolist` and `dnf install -y htop`.',
      ],
      checks: [
        { id: 'only-local', label: 'Only the local repository is enabled', run: String.raw`ids=$(dnf -q repolist --enabled 2>/dev/null | awk 'NR>1{print $1}'); [ "$(echo "$ids" | sed '/^$/d' | wc -l)" = 1 ] && grep -lrsE '^\s*baseurl\s*=\s*file:///?opt/rpms/?\s*$' /etc/yum.repos.d | xargs -r grep -qx "\[$ids\]"`, fail: 'dnf repolist should list exactly one enabled repository, with baseurl file:///opt/rpms.' },
        { id: 'tree', label: 'tree is installed', run: 'rpm -q tree >/dev/null 2>&1 && tree --version >/dev/null 2>&1', fail: 'tree is not installed.' },
      ],
      solution: `printf '[local]\\nname=Local\\nbaseurl=file:///opt/rpms\\nenabled=1\\ngpgcheck=0\\n' > /etc/yum.repos.d/local.repo && dnf config-manager --set-disabled baseos appstream extras && dnf install -y -q tree`,
    },
    {
      id: 'repair',
      goal: 'The tar program is damaged. Find which package\'s files changed, and reinstall that package.',
      body: 'rpm records the size, checksum, permissions and owner of every file it installs. `rpm -V PACKAGE` compares them with the disk and prints a line for each file that differs; `5` means the checksum changed. `rpm -qf FILE` tells you which package a file belongs to.',
      hints: [
        'Find the package that owns /usr/bin/tar, verify it, then reinstall it from your repository.',
        '`rpm -qf FILE` names the package. `rpm -V PACKAGE` shows the damaged file. `dnf reinstall -y PACKAGE` puts the original files back.',
        'If /usr/bin/gzip were damaged: `rpm -qf /usr/bin/gzip` says gzip, `rpm -V gzip` prints S.5....T. /usr/bin/gzip, then `dnf reinstall -y gzip` and `rpm -V gzip` prints nothing.',
      ],
      checks: [
        { id: 'works', label: 'tar works again', run: 'tar --version >/dev/null 2>&1', fail: 'tar still does not run.' },
        { id: 'verified', label: 'The tar package verifies clean', run: '[ -z "$(rpm -V tar 2>/dev/null | grep -v " c ")" ]', fail: 'rpm -V tar still reports changed files.' },
      ],
      solution: 'dnf reinstall -y -q tar',
    },
    {
      id: 'query',
      goal: 'Write the installed version of jq, only the version number, into /root/jq-version.txt.',
      body: 'rpm can print any field it knows about a package with a query format: `--qf \'%{VERSION}\\n\'` prints just the version. `rpm -qi PACKAGE` shows every field, and `rpm -ql PACKAGE` lists the files it installed.',
      hints: [
        'Query jq with a format that prints only its version.',
        '`rpm -q --qf \'%{VERSION}\\n\' jq` prints for example 1.6. Redirect it into the file.',
        'For tree\'s release field: `rpm -q --qf \'%{RELEASE}\\n\' tree > /root/tree-release.txt`.',
      ],
      checks: [{ id: 'version', label: 'jq-version.txt has the version', run: '[ "$(tr -d \' \\n\' < /root/jq-version.txt 2>/dev/null)" = "$(rpm -q --qf \'%{VERSION}\' jq 2>/dev/null)" ] && rpm -q jq >/dev/null', fail: '/root/jq-version.txt does not contain only the installed jq version.' }],
      solution: "rpm -q --qf '%{VERSION}\\n' jq > /root/jq-version.txt",
    },
  ],
};
