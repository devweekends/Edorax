import type { ShellLab } from '../domain/shell-labs';

// The web shop (8080), its admin panel (9090) and Redis (6379), started at every boot like real services.
const SERVICES = String.raw`for svc in web:8080 admin:9090 redis:6379; do
  name=${'$'}{svc%%:*}; port=${'$'}{svc##*:}
  pgrep -f "^$name-service" >/dev/null || nohup bash -c "exec -a $name-service nc -lk 0.0.0.0 $port" >/dev/null 2>&1 &
done
sleep 1`;

// From a client address on this machine to a port: 0 when the connection is accepted.
const reach = (from: string, port: number) => `nc -z -w1 -s ${from} 127.0.0.1 ${port} 2>/dev/null`;

export const linuxIptables: ShellLab = {
  slug: 'linux-iptables',
  topic: 'linux',
  level: 'intermediate',
  tags: ['IPTables', 'Firewall', 'Security'],
  title: 'Firewall rules with iptables',
  summary: 'Close a database to the world, open an admin panel to one address, ban an attacker and make the rules survive a reboot. Every check makes real connections.',
  scenario:
    'fw1 runs a web shop on 8080, its admin panel on 9090 and Redis on 6379, and has no firewall at all. The office admin connects from 127.0.0.5; an attacker has been probing from 127.0.0.66. On this machine every 127.x address is local, so the checks connect from those addresses to test your rules for real. You are root.',
  minutes: 90,
  machine: { name: 'fw1', image: 'ubuntu:24.04', packages: ['iptables', 'netcat-openbsd', 'iproute2'], capabilities: ['NET_ADMIN'] },
  setup: `set -e
mkdir -p /etc/iptables
${SERVICES}
`,
  // Like iptables-persistent: saved rules load at boot, then the services start.
  boot: `[ -f /etc/iptables/rules.v4 ] && iptables-restore < /etc/iptables/rules.v4
${SERVICES}
true`,
  steps: [
    {
      id: 'block-redis',
      goal: 'Make Redis on port 6379 unreachable for everyone, while it keeps running.',
      body: 'iptables rules sit in chains. Every packet arriving for this machine goes through the INPUT chain, rule by rule, until one matches; its target, such as ACCEPT, DROP or REJECT, decides what happens. Redis has no password here, so nothing should reach it.',
      hints: [
        'One rule in INPUT for TCP to port 6379 that refuses the connection.',
        '`iptables -A INPUT -p tcp --dport PORT -j REJECT` adds a rule at the end. `iptables -L INPUT -n --line-numbers` lists the chain. `nc -z -w1 127.0.0.1 6379` tests it.',
        'To close MySQL on 3306: `iptables -A INPUT -p tcp --dport 3306 -j DROP`, then `nc -z -w1 127.0.0.1 3306` fails. REJECT answers at once; DROP stays silent.',
      ],
      checks: [
        { id: 'closed', label: 'Port 6379 refuses connections', run: `! ${reach('127.0.0.1', 6379)} && ! ${reach('127.0.0.5', 6379)}`, fail: 'A connection to port 6379 still gets through.' },
        { id: 'running', label: 'Redis is still running', run: "ss -ltnH 'sport = :6379' | grep -q LISTEN", fail: 'Redis stopped. Block it with the firewall; do not stop the service. Reset to bring it back.' },
        { id: 'web-open', label: 'The shop is still reachable', run: reach('127.0.0.7', 8080), fail: 'Port 8080 is blocked too. Only Redis should be closed.' },
      ],
      solution: 'iptables -A INPUT -p tcp --dport 6379 -j REJECT',
    },
    {
      id: 'admin-only',
      goal: 'Let only the office admin, 127.0.0.5, reach the admin panel on port 9090.',
      body: 'Order matters: the first matching rule wins. To open a port for one address and close it for the rest, the ACCEPT for that address has to come before the rule that refuses everyone else. `-s` matches the source address.',
      hints: [
        'Two rules for port 9090: accept from the admin, then refuse all others, in that order.',
        '`iptables -A INPUT -p tcp --dport 9090 -s 127.0.0.5 -j ACCEPT`, then `iptables -A INPUT -p tcp --dport 9090 -j REJECT`. `nc -z -w1 -s 127.0.0.5 127.0.0.1 9090` tests as the admin.',
        'For SSH on 22 from 10.0.0.9 only: `iptables -A INPUT -p tcp --dport 22 -s 10.0.0.9 -j ACCEPT` then `iptables -A INPUT -p tcp --dport 22 -j DROP`. Use `-I` to insert a rule at the top if the order is wrong.',
      ],
      checks: [
        { id: 'admin-in', label: 'The admin can connect', run: reach('127.0.0.5', 9090), fail: '127.0.0.5 cannot reach port 9090.' },
        { id: 'others-out', label: 'Nobody else can', run: `! ${reach('127.0.0.1', 9090)} && ! ${reach('127.0.0.20', 9090)}`, fail: 'Addresses other than 127.0.0.5 still reach port 9090.' },
      ],
      solution: 'iptables -A INPUT -p tcp --dport 9090 -s 127.0.0.5 -j ACCEPT && iptables -A INPUT -p tcp --dport 9090 -j REJECT',
    },
    {
      id: 'ban',
      goal: 'Block every connection from the attacker, 127.0.0.66, to any port. Everyone else keeps the shop.',
      body: 'A ban should stop an address before any other rule can let it in. Insert it at the top of the chain instead of adding it at the end.',
      hints: [
        'One rule matching the source address only, at the top of INPUT.',
        '`iptables -I INPUT 1 -s ADDRESS -j DROP` inserts a rule as number 1. Then `iptables -L INPUT -n --line-numbers`.',
        'To ban 203.0.113.9: `iptables -I INPUT -s 203.0.113.9 -j DROP`. `-I` without a number also inserts at the top.',
      ],
      checks: [
        { id: 'banned', label: 'The attacker cannot reach the shop', run: `! ${reach('127.0.0.66', 8080)}`, fail: '127.0.0.66 can still connect to port 8080.' },
        { id: 'customers', label: 'Customers still can', run: reach('127.0.0.7', 8080), fail: 'Other addresses cannot reach the shop on 8080 any more.' },
      ],
      solution: 'iptables -I INPUT 1 -s 127.0.0.66 -j DROP',
    },
    {
      id: 'persist',
      goal: 'Save the rules to /etc/iptables/rules.v4, which this machine loads at boot.',
      body: 'Rules live in the kernel and vanish on a restart. `iptables-save` prints the current rules in a format `iptables-restore` can load again. On Ubuntu, the iptables-persistent package loads `/etc/iptables/rules.v4` at boot, and this machine does the same. Stop and Resume the lab to see it work.',
      hints: [
        'Write the output of iptables-save into the file.',
        'Redirect what `iptables-save` prints into the file with `>`. `iptables-restore --test < FILE` checks a saved file without applying it.',
        'IPv6 rules work the same way with their own tools: `ip6tables-save > /etc/iptables/rules.v6`, and after a reboot `ip6tables -L -n` shows them again.',
      ],
      checks: [
        { id: 'valid', label: 'rules.v4 is a valid rule file', run: 'iptables-restore --test < /etc/iptables/rules.v4 2>/dev/null', fail: '/etc/iptables/rules.v4 is missing or iptables-restore cannot read it.' },
        { id: 'matches', label: 'It holds the rules in force now', run: String.raw`[ -n "$(iptables -S INPUT | grep '^-A')" ] && diff <(iptables -S INPUT | grep '^-A') <(grep '^-A INPUT' /etc/iptables/rules.v4) >/dev/null`, fail: 'The saved file does not hold the INPUT rules that are in force now. Save again after your last change.' },
      ],
      solution: 'iptables-save > /etc/iptables/rules.v4',
    },
  ],
};
