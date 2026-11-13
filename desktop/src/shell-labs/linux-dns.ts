import type { ShellLab } from '../domain/shell-labs';

export const linuxDns: ShellLab = {
  slug: 'linux-dns',
  topic: 'linux',
  title: 'Name resolution and a local DNS server',
  summary: 'Pin a name in the hosts file, fix a stale entry, run a small DNS server and point the machine at it.',
  scenario:
    'app1 cannot find the services it talks to. The database has no name yet, an old hosts entry sends API calls to a machine that was switched off, and the team wants internal names served by DNS instead of copied into every hosts file. Fix how app1 turns names into addresses. You are root, the machine has no internet, and every name here is internal.',
  minutes: 25,
  machine: {
    name: 'app1',
    image: 'ubuntu:24.04',
    packages: ['dnsmasq', 'dnsutils', 'nano'],
    capabilities: ['NET_BIND_SERVICE'],
  },
  setup: `set -e
echo "10.0.0.99   api.internal   # old API server, switched off in March" >> /etc/hosts
# Answer only for local names, only on this machine, and read the drop-in folder.
cat > /etc/dnsmasq.conf <<'CONF'
no-resolv
listen-address=127.0.0.1
bind-interfaces
conf-dir=/etc/dnsmasq.d/,*.conf
CONF
mkdir -p /etc/dnsmasq.d
cat > /root/NOTES.md <<'NOTES'
Internal addresses
  db.internal    10.0.0.5
  api.internal   10.0.0.7   (moved from 10.0.0.99)
  shop.internal  10.0.0.20  (serve it from DNS, not from /etc/hosts)
NOTES
`,
  // Docker rewrites /etc/hosts and /etc/resolv.conf on every start, so keep the learner's versions
  // across a stop. Then, like a service enabled at boot, a configured dnsmasq comes back.
  shutdown: 'cp /etc/hosts /root/.edorax-hosts && cp /etc/resolv.conf /root/.edorax-resolv.conf',
  boot: `[ -f /root/.edorax-hosts ] && cat /root/.edorax-hosts > /etc/hosts
[ -f /root/.edorax-resolv.conf ] && cat /root/.edorax-resolv.conf > /etc/resolv.conf
if ls /etc/dnsmasq.d/*.conf >/dev/null 2>&1 && ! pgrep -x dnsmasq >/dev/null; then dnsmasq; fi
true`,
  steps: [
    {
      id: 'pin-a-name',
      goal: 'Make db.internal resolve to 10.0.0.5 on this machine, using /etc/hosts.',
      body: 'Before asking DNS, Linux looks in `/etc/hosts`: one address, then the names that point to it. It is the quickest way to give one machine a name. The addresses are in `/root/NOTES.md`.',
      hints: [
        'Add one line to /etc/hosts, then ask the system to look the name up.',
        'A hosts line is an address, spaces, then the name. `getent hosts NAME` resolves a name the same way programs do.',
        'For cache.internal at 10.0.0.9: `echo "10.0.0.9 cache.internal" >> /etc/hosts` then `getent hosts cache.internal`. Use >> to append; a single > would wipe the file.',
      ],
      checks: [
        { id: 'resolves', label: 'db.internal resolves to 10.0.0.5', run: '[ "$(getent hosts db.internal | awk \'{print $1}\')" = 10.0.0.5 ]', fail: 'db.internal does not resolve to 10.0.0.5 yet.' },
        { id: 'localhost', label: 'localhost still works', run: 'grep -qE "^127\\.0\\.0\\.1\\s+(.*\\s)?localhost(\\s|$)" /etc/hosts', fail: 'localhost no longer resolves. The hosts file was overwritten; reset the lab, and use >> to append.' },
      ],
      solution: 'echo "10.0.0.5 db.internal" >> /etc/hosts',
    },
    {
      id: 'stale-entry',
      goal: 'Make api.internal resolve to its new address, 10.0.0.7.',
      body: 'Calls to the API time out. Someone pinned api.internal in `/etc/hosts` long ago, and the hosts file wins over everything else, so the machine still goes to the old server. Find the stale line and fix it.',
      hints: [
        'Ask the system where api.internal points now, then find the line responsible.',
        '`getent hosts api.internal` shows the address in use. `grep api /etc/hosts` finds the line. Change the address in that line rather than adding a second one.',
        'For a stale web.internal: `grep web /etc/hosts`, then edit the file with `nano /etc/hosts` and fix the address. Keep only one line for the name. Check with `getent hosts web.internal`.',
      ],
      checks: [
        { id: 'new-address', label: 'api.internal resolves to 10.0.0.7', run: '[ "$(getent hosts api.internal | awk \'{print $1}\')" = 10.0.0.7 ]', fail: 'api.internal still points somewhere else.' },
        { id: 'one-line', label: 'Only one line names api.internal', run: '[ "$(grep -v "^\\s*#" /etc/hosts | grep -cw api.internal)" = 1 ]', fail: 'There is more than one line for api.internal, or none. Keep exactly one.' },
      ],
      solution: "sed 's/^10\\.0\\.0\\.99 /10.0.0.7 /' /etc/hosts > /tmp/hosts && cat /tmp/hosts > /etc/hosts",
    },
    {
      id: 'dns-server',
      goal: 'Run dnsmasq on this machine so that it answers shop.internal with 10.0.0.20.',
      body: 'A hosts file has to be copied to every machine. A DNS server answers for everyone. dnsmasq is a small one: it is installed and set to listen on 127.0.0.1 and to read any `.conf` file in `/etc/dnsmasq.d/`. Give it the record, start it, and ask it directly with `dig`.',
      hints: [
        'Write one config line into a new file in /etc/dnsmasq.d/, start dnsmasq, then query 127.0.0.1.',
        'The dnsmasq line for a name is `address=/NAME/ADDRESS`. Start the server by running `dnsmasq`. `dig @127.0.0.1 NAME +short` asks that server only.',
        'For files.internal at 10.0.0.30: `echo "address=/files.internal/10.0.0.30" > /etc/dnsmasq.d/internal.conf`, then `dnsmasq`, then `dig @127.0.0.1 files.internal +short` prints 10.0.0.30. After changing the file later, restart with `pkill dnsmasq; dnsmasq`.',
      ],
      checks: [
        { id: 'running', label: 'dnsmasq is running', run: 'pgrep -x dnsmasq >/dev/null', fail: 'dnsmasq is not running. Start it with `dnsmasq`.' },
        { id: 'answers', label: 'It answers shop.internal with 10.0.0.20', run: '[ "$(dig @127.0.0.1 shop.internal +short +time=2 +tries=1)" = 10.0.0.20 ]', fail: 'The server on 127.0.0.1 does not answer shop.internal with 10.0.0.20. Check the file in /etc/dnsmasq.d and restart dnsmasq after a change.' },
        { id: 'not-hosts', label: 'shop.internal is not in /etc/hosts', run: '! grep -v "^\\s*#" /etc/hosts | grep -qw shop.internal', fail: 'shop.internal is in /etc/hosts. The point is to serve it from DNS; take it out of the hosts file.' },
      ],
      solution: 'echo "address=/shop.internal/10.0.0.20" > /etc/dnsmasq.d/internal.conf && dnsmasq',
    },
    {
      id: 'use-the-server',
      goal: 'Point the machine at your DNS server, so that every program resolves shop.internal.',
      body: '`dig @127.0.0.1` talks to one server you name. Ordinary programs ask the servers listed in `/etc/resolv.conf`, and that still names a server this machine cannot reach. Make 127.0.0.1 the only nameserver.',
      hints: [
        'Look at /etc/resolv.conf. Which nameserver does it list?',
        'resolv.conf needs one line: `nameserver 127.0.0.1`. Then `getent hosts shop.internal` should answer, which shows the whole system uses the server.',
        'To point a machine at 10.0.0.53: `echo "nameserver 10.0.0.53" > /etc/resolv.conf`, then `getent hosts some.name`. Here a single > is right, because you replace the whole file.',
      ],
      checks: [
        { id: 'nameserver', label: '127.0.0.1 is the only nameserver', run: '[ "$(grep -E "^\\s*nameserver" /etc/resolv.conf | awk \'{print $2}\')" = 127.0.0.1 ]', fail: '/etc/resolv.conf should list exactly one nameserver: 127.0.0.1.' },
        { id: 'system-resolves', label: 'Programs resolve shop.internal', run: '[ "$(timeout 10 getent hosts shop.internal | awk \'{print $1}\')" = 10.0.0.20 ]', fail: 'getent hosts shop.internal does not give 10.0.0.20. Is dnsmasq still running?' },
      ],
      solution: 'echo "nameserver 127.0.0.1" > /etc/resolv.conf',
    },
  ],
};
