import type { LabLessons } from './types';

export const NETWORKING: Record<string, LabLessons> = {
  'linux-networking': {
    interface: {
      learn: [
        "A network interface is where a machine meets a network: a real card such as eth0, Wi-Fi, the loopback `lo` that every machine has, or a virtual one. Each interface can carry one or more IP addresses.",
        "An address like `10.20.0.10/24` holds two facts: the address, and with `/24` how much of it names the network. The first 24 bits, 10.20.0, are the network, so this machine can reach 10.20.0.1 to 10.20.0.254 directly.",
        "`ip` is the modern tool for all of this; the older `ifconfig` is gone from many systems. `ip link` manages interfaces and `ip addr` their addresses. A new interface stays down until you bring it up.",
      ],
      commands: [
        ['ip -br addr', 'A short summary of every interface and its addresses.'],
        ['ip link add NAME type dummy', 'Creates a virtual interface for testing.'],
        ['ip addr add ADDRESS/PREFIX dev NAME', 'Gives an interface an address.'],
        ['ip link set NAME up', 'Brings an interface up.'],
      ],
    },
    route: {
      learn: [
        "For every packet, the kernel looks at the routing table and picks the most specific route that matches the destination. Networks on the machine's own interfaces are reached directly. Everything else needs a gateway, a router that forwards the packet on.",
        'The default route, `default via ...`, catches everything else; it is usually how a machine reaches the internet. Extra routes send particular networks, such as a database network, through a different router.',
        "`ip route get ADDRESS` asks the kernel which way it would send a packet. It is the quickest answer to \"why can't I reach that machine?\"",
      ],
      commands: [
        ['ip route', 'Shows the routing table.'],
        ['ip route add NETWORK/PREFIX via GATEWAY dev NAME', 'Sends a network through a router.'],
        ['ip route get ADDRESS', 'Shows which route a packet to ADDRESS would take.'],
        ['ip route del NETWORK/PREFIX', 'Removes a route.'],
      ],
    },
    mystery: {
      learn: [
        "A program that waits for connections listens on a port: 22 for SSH, 443 for HTTPS, and so on. Every listening port is a door into the machine, so an unexpected one is the first thing a security review asks about.",
        "`ss` (socket statistics) replaced the older `netstat`. `-l` shows listening sockets, `-t` TCP, `-u` UDP, `-n` keeps numbers instead of names, and `-p` shows the process holding each socket.",
        "The address matters as much as the port. `127.0.0.1:PORT` is reachable only from the machine itself; `0.0.0.0:PORT` or `*:PORT` from every network the machine is on.",
      ],
      commands: [
        ['ss -ltnp', 'Lists listening TCP ports and the process behind each.'],
        ['ps -o user,pid,args -p PID', 'Shows who runs a process and how it was started.'],
        ['kill PID', 'Stops a process.'],
      ],
    },
    bind: {
      learn: [
        "When a service starts listening it binds to an address and a port. Binding to `0.0.0.0` means every address the machine has, now and later. Binding to one address keeps the service on that network only.",
        "This is a quiet but strong security control. A database bound to an internal address cannot be reached from the internet even if a firewall rule is wrong.",
        '`nc` (netcat) is the Swiss army knife for testing: `nc -l ADDRESS PORT` listens, `nc -z HOST PORT` checks whether a port accepts connections.',
      ],
      commands: [
        ['nc -lk ADDRESS PORT', 'Listens on one address and keeps accepting connections.'],
        ['nohup COMMAND >/dev/null 2>&1 &', 'Runs a command in the background, surviving the terminal.'],
        ['nc -z -w2 HOST PORT', 'Tests whether a port accepts connections.'],
      ],
    },
  },

  'linux-dns': {
    'pin-a-name': {
      learn: [
        "Programs use names, networks use numbers. Turning a name into an address is name resolution, and on Linux it follows the order in `/etc/nsswitch.conf`. The `hosts:` line usually says `files dns`: first `/etc/hosts`, then DNS servers.",
        "`/etc/hosts` is a plain list: an address, then the names for it. It works with no network and no server, which makes it useful for one-off overrides and tests, and dangerous when forgotten.",
        "`getent hosts NAME` resolves a name exactly the way programs do, following nsswitch. `ping` and browsers do the same. `dig` asks DNS directly and skips /etc/hosts entirely.",
      ],
      commands: [
        ['getent hosts NAME', 'Resolves a name the way programs do.'],
        ['echo "ADDRESS NAME" >> /etc/hosts', 'Pins a name to an address on this machine.'],
        ['grep hosts /etc/nsswitch.conf', 'Shows the order of lookups.'],
      ],
    },
    'stale-entry': {
      learn: [
        "Because `/etc/hosts` comes first, an old entry quietly wins over correct DNS. Services move, the hosts file is forgotten, and calls go to a machine that was switched off. This is one of the classic \"works on one server, not on another\" causes.",
        'When a name resolves strangely, check the hosts file before anything else. Keep one line per name: with duplicates, the first one wins and the rest confuse whoever reads the file next.',
      ],
      commands: [
        ['grep NAME /etc/hosts', 'Finds the lines that mention a name.'],
        ['getent hosts NAME', 'Shows the address in use now.'],
        ['nano /etc/hosts', 'Edits the file. It saves in place, as this file needs.'],
      ],
    },
    'dns-server': {
      learn: [
        "DNS is a distributed database of names. A resolver, the server your machine asks, either knows the answer or asks other servers for it. An A record maps a name to an IPv4 address.",
        "Small networks often run a light DNS server such as dnsmasq to answer for internal names. One record on the server replaces a line copied into every hosts file, and changing it changes it for everyone.",
        "`dig @SERVER NAME` asks one particular server and shows its full answer. `+short` prints only the address. Testing the server directly first separates \"is the server right?\" from \"is the machine using it?\"",
      ],
      commands: [
        ['echo "address=/NAME/ADDRESS" > /etc/dnsmasq.d/FILE.conf', 'A dnsmasq record for one name.'],
        ['dnsmasq', 'Starts the server. `pkill dnsmasq; dnsmasq` restarts it after a change.'],
        ['dig @SERVER NAME +short', 'Asks one DNS server directly.'],
      ],
    },
    'use-the-server': {
      learn: [
        "Programs find their DNS servers in `/etc/resolv.conf`: one `nameserver ADDRESS` line per server, tried in order. Pointing the machine at a new server means changing this file.",
        "On many distributions this file is managed by a service such as systemd-resolved or NetworkManager, and hand edits are overwritten. Check who owns it before changing it on a real server.",
        "With the machine pointed at your server, `getent hosts` and every program now see the records you serve. That is the end-to-end test.",
      ],
      commands: [
        ['cat /etc/resolv.conf', 'Shows which DNS servers the machine uses.'],
        ['echo "nameserver ADDRESS" > /etc/resolv.conf', 'Makes ADDRESS the only DNS server.'],
        ['getent hosts NAME', 'Checks that programs now resolve through it.'],
      ],
    },
  },

  'linux-iptables': {
    'block-redis': {
      learn: [
        "Linux's firewall lives in the kernel, as netfilter; `iptables` is the classic tool that edits it. Rules sit in chains. Every packet arriving for this machine walks the INPUT chain rule by rule until one matches, and that rule's target decides its fate.",
        "ACCEPT lets the packet in. DROP silently discards it, so the sender waits and times out. REJECT refuses it with a reply, so the sender learns at once. If no rule matches, the chain's policy applies, shown as `-P INPUT ACCEPT`.",
        "Databases such as Redis often ship with no password, meant for internal use only. Exposed to the internet, they are found and abused within hours. Closing the port is the first line of defence.",
      ],
      commands: [
        ['iptables -L INPUT -n --line-numbers', 'Lists the INPUT rules, numbered.'],
        ['iptables -A INPUT -p tcp --dport PORT -j TARGET', 'Adds a rule at the end for TCP to PORT.'],
        ['nc -z -w1 HOST PORT', 'Tests whether a connection gets through.'],
      ],
    },
    'admin-only': {
      learn: [
        "Rules are read top to bottom and the first match wins. To open a port for one address and close it for everyone else, the ACCEPT for that address must come before the rule that refuses the rest.",
        "`-s ADDRESS` matches the source of a packet, and accepts networks too, such as `10.0.0.0/8`. Allow-lists like this keep admin panels, SSH and dashboards out of reach of the internet at large.",
        "`-A` appends at the end and `-I` inserts at the top or at a given position, so you can fix the order without starting over.",
      ],
      commands: [
        ['iptables -A INPUT -p tcp --dport PORT -s ADDRESS -j ACCEPT', 'Lets one address in to PORT.'],
        ['iptables -I INPUT N RULE', 'Inserts a rule at position N.'],
        ['iptables -D INPUT N', 'Deletes rule number N.'],
        ['nc -z -w1 -s SOURCE HOST PORT', 'Tests a connection from a chosen source address.'],
      ],
    },
    ban: {
      learn: [
        "Banning an address means dropping everything from it before any other rule can let it in, so a ban goes at the top of the chain. Tools such as fail2ban do this automatically when they see repeated failed logins.",
        "DROP is the usual choice for attackers: they learn nothing, not even that the machine is there. REJECT is kinder to legitimate users who make a mistake, because they get an error at once.",
      ],
      commands: [
        ['iptables -I INPUT -s ADDRESS -j DROP', 'Drops everything from ADDRESS, as the first rule.'],
        ['iptables -S INPUT', 'Prints the rules as the commands that would recreate them.'],
      ],
    },
    persist: {
      learn: [
        "iptables rules live only in the kernel's memory and vanish on reboot. That has embarrassed many admins: a careful firewall, then a reboot for an update, and every port is open again.",
        "`iptables-save` prints the current rules in a format `iptables-restore` can load. On Ubuntu and Debian, the iptables-persistent package loads `/etc/iptables/rules.v4` at boot. Red Hat systems use the iptables-services package or firewalld.",
        'Newer systems use nftables underneath; iptables commands still work through a compatibility layer, and the ideas carry over unchanged.',
      ],
      commands: [
        ['iptables-save', 'Prints every rule in a loadable format.'],
        ['iptables-restore < FILE', 'Loads saved rules.'],
        ['iptables-restore --test < FILE', 'Checks a saved file without applying it.'],
      ],
    },
  },

  'linux-troubleshooting': {
    disk: {
      learn: [
        "Troubleshooting is a loop: read the exact error, form one guess, test it, fix only that, then try again. Changing five things at once means you never learn which one mattered, and you may add new problems.",
        '"No space left on device" is literal. `df -h` shows how full each filesystem is, and which one the failing path is on. `du` then finds what fills it. Hidden folders count, and crash dumps and old logs are common culprits.',
        "/tmp is often a small memory-backed filesystem, tmpfs, separate from the main disk. It can be full while the main disk has plenty of room.",
      ],
      commands: [
        ['df -h PATH', 'Shows how full the filesystem holding PATH is.'],
        ['du -ah PATH | sort -h | tail', 'Lists the biggest files and folders last.'],
        ['ls -la FOLDER', 'Shows everything, hidden names included.'],
      ],
    },
    config: {
      learn: [
        'Most "it works for me" problems are permissions: root can read everything, the service account cannot. Always reproduce a failure as the user the program runs as, never as root.',
        "Open a secret-holding config to exactly who needs it. The usual pattern is root as owner, the service's group as group, and mode 640: the service reads it, only root changes it, others see nothing.",
      ],
      commands: [
        ['su -s /bin/bash USER -c "COMMAND"', 'Runs a command as the service user, to see their error.'],
        ['ls -l FILE', 'Shows owner, group and mode.'],
        ['chgrp GROUP FILE', 'Gives a file to a group.'],
        ['chmod 640 FILE', 'Owner reads and writes, group reads, others nothing.'],
      ],
    },
    script: {
      learn: [
        "Windows ends each line of text with two characters, carriage return and line feed (`\\r\\n`); Linux uses only the line feed. A script edited on Windows carries an invisible `\\r` at the end of each line.",
        'The first victim is the shebang: Linux looks for a program called `/bin/bash\\r`, which does not exist, and reports "bad interpreter". `cat -A` shows the hidden characters, with `^M` for each carriage return.',
        "`sed 's/\\r$//'` or the dos2unix tool fixes it. In Git, `core.autocrlf` keeps it from happening again.",
      ],
      commands: [
        ['cat -A FILE | head', 'Shows hidden characters: ^M is a carriage return, $ a line end.'],
        ["sed -i 's/\\r$//' FILE", 'Removes the carriage returns in place.'],
        ['file FILE', 'Describes a file, including "with CRLF line terminators".'],
      ],
    },
    port: {
      learn: [
        'Only one program can listen on a given address and port. A new service that cannot start with "Address already in use" usually has an old copy of itself, or something else, sitting on its port.',
        "Find the holder with `ss -ltnp`, stop it, and start the right program as its own user. In production a service manager such as systemd does the starting, so it restarts after crashes and at boot.",
        "`nohup` and a trailing `&` keep a program running after you close the terminal. It is fine for tests; real services belong under systemd.",
      ],
      commands: [
        ['ss -ltnp | grep :PORT', 'Shows which process listens on PORT.'],
        ['kill PID', 'Stops a process.'],
        ['su -s /bin/bash USER -c "nohup COMMAND >/dev/null 2>&1 &"', 'Starts a program in the background as USER.'],
      ],
    },
  },
};
