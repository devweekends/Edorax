import type { ShellLab } from '../domain/shell-labs';

// Docker builds a fresh network for the machine on every start, so keep what the learner built
// (dummy interfaces, their addresses and static routes) across a stop, the way a network config
// file would on a real server.
const SAVE = String.raw`: > /root/.edorax-net
for dev in $(ip -o link show type dummy | awk -F': ' '{print $2}' | cut -d@ -f1); do
  echo "link $dev" >> /root/.edorax-net
  ip -o -4 addr show dev "$dev" | awk '{print "addr '"$dev"' " $4}' >> /root/.edorax-net
done
ip -4 route show | grep -v 'proto kernel' | sed 's/^/route /' >> /root/.edorax-net`;

const RESTORE = String.raw`[ -f /root/.edorax-net ] || exit 0
while read -r kind a b; do
  case "$kind" in
    link) ip link add "$a" type dummy 2>/dev/null; ip link set "$a" up ;;
    addr) ip addr add "$b" dev "$a" 2>/dev/null ;;
  esac
done < /root/.edorax-net
grep '^route ' /root/.edorax-net | sed 's/^route //' | while read -r r; do ip route add $r 2>/dev/null; done
true`;

export const linuxNetworking: ShellLab = {
  slug: 'linux-networking',
  topic: 'linux',
  level: 'intermediate',
  tags: ['Networking', 'ip', 'ss'],
  title: 'Networking: interfaces, routes and ports',
  summary: 'Bring up an interface with an address, route traffic to another network, find and stop an unknown service and bind a new one to the right address.',
  scenario:
    'net1 is joining the app network, 10.20.0.0/24, through a new interface, and must reach the database network 10.30.0.0/16 through the router at 10.20.0.1. A security scan also found a service nobody recognises. Use the ip and ss tools that every Linux server has. This machine has no real network, so the interface is a virtual one. You are root.',
  minutes: 90,
  machine: { name: 'net1', image: 'ubuntu:24.04', packages: ['iproute2', 'netcat-openbsd', 'iputils-ping'], capabilities: ['NET_ADMIN'] },
  setup: `set -e

nohup bash -c 'exec -a mystery-svc nc -lk 0.0.0.0 9000' >/dev/null 2>&1 &
sleep 1
`,
  shutdown: SAVE,
  boot: RESTORE,
  steps: [
    {
      id: 'interface',
      goal: 'Create the interface app0 (type dummy), give it 10.20.0.10/24 and bring it up.',
      body: '`ip` manages network interfaces: `ip link` for the interfaces themselves, `ip addr` for their addresses. An interface is down until you set it up. `/24` means the first 24 bits are the network, so app0 can talk directly to 10.20.0.1 to 10.20.0.254.',
      hints: [
        'Three ip commands: create the link, add the address, set it up.',
        '`ip link add app0 type dummy`, `ip addr add 10.20.0.10/24 dev app0`, `ip link set app0 up`. `ip -br addr` shows a summary.',
        'For lab0 at 192.168.50.2/24: `ip link add lab0 type dummy`, `ip addr add 192.168.50.2/24 dev lab0`, `ip link set lab0 up`, then `ip -br addr show lab0`.',
      ],
      checks: [
        { id: 'exists', label: 'app0 exists', run: 'ip link show app0 >/dev/null 2>&1', fail: 'There is no interface app0.' },
        { id: 'address', label: 'app0 has 10.20.0.10/24', run: 'ip -o -4 addr show dev app0 | grep -q "inet 10.20.0.10/24"', fail: 'app0 does not have the address 10.20.0.10/24.' },
        { id: 'up', label: 'app0 is up', run: 'ip link show app0 | grep -q "<.*UP.*>"', fail: 'app0 is down. Set it up.' },
      ],
      solution: 'ip link add app0 type dummy && ip addr add 10.20.0.10/24 dev app0 && ip link set app0 up',
    },
    {
      id: 'route',
      goal: 'Send traffic for 10.30.0.0/16 through the router 10.20.0.1 on app0.',
      body: 'The routing table decides where each packet goes. Addresses on app0\'s own network are reached directly. Anything else needs a route that names a gateway, a router that knows the way. `ip route get ADDRESS` shows which route a packet would take.',
      hints: [
        'Add one route for the whole database network via the router.',
        '`ip route add NETWORK via GATEWAY dev INTERFACE`. Then `ip route get 10.30.4.20` should say via 10.20.0.1 dev app0.',
        'For 172.16.0.0/12 via 192.168.50.1: `ip route add 172.16.0.0/12 via 192.168.50.1 dev lab0`, and `ip route` lists it.',
      ],
      checks: [
        { id: 'route', label: 'The route exists', run: 'ip -4 route show 10.30.0.0/16 | grep -q "via 10.20.0.1 dev app0"', fail: 'There is no route for 10.30.0.0/16 via 10.20.0.1 on app0.' },
        { id: 'used', label: 'Database traffic would use it', run: 'ip route get 10.30.4.20 2>/dev/null | grep -q "via 10.20.0.1 dev app0"', fail: 'ip route get 10.30.4.20 does not go via 10.20.0.1 on app0.' },
      ],
      solution: 'ip route add 10.30.0.0/16 via 10.20.0.1 dev app0',
    },
    {
      id: 'mystery',
      goal: 'Find the unknown service listening on port 9000 and stop it.',
      body: '`ss` lists sockets. `-l` shows only listening ones, `-t` TCP, `-n` numbers instead of names and `-p` the process behind each. A listener on `0.0.0.0` accepts connections on every address the machine has, which is how unexpected services get exposed.',
      hints: [
        'List listening TCP sockets with their processes, find 9000, then stop that process.',
        '`ss -ltnp` shows the PID. `ps -o user,pid,args -p PID` shows who runs it. `kill PID` stops it.',
        'For an unknown port 4444: `ss -ltnp | grep 4444` shows pid=731, `ps -o user,args -p 731`, then `kill 731` and `ss -ltn | grep 4444` prints nothing.',
      ],
      checks: [{ id: 'closed', label: 'Nothing listens on 9000', run: "! ss -ltnH 'sport = :9000' | grep -q LISTEN", fail: 'Something is still listening on port 9000.' }],
      solution: "pkill -f '^mystery-svc'; sleep 1",
    },
    {
      id: 'bind',
      goal: 'Run a TCP listener on port 8080 that accepts connections on 10.20.0.10 only, not on every address.',
      body: 'A service should listen only where it is meant to be reached. Binding to one address, rather than 0.0.0.0, keeps it off every other network. `nc -lk ADDRESS PORT` is a simple listener that keeps accepting connections, enough to test with.',
      hints: [
        'Start nc in the background listening on app0\'s address, then check what ss shows.',
        '`nohup nc -lk 10.20.0.10 8080 >/dev/null 2>&1 &` runs it in the background. `ss -ltn` should show 10.20.0.10:8080, not 0.0.0.0:8080.',
        'For a test listener on 192.168.50.2 port 5000: `nohup nc -lk 192.168.50.2 5000 >/dev/null 2>&1 &`, then `ss -ltn | grep 5000`.',
      ],
      checks: [
        { id: 'bound', label: 'Listening on 10.20.0.10:8080', run: "ss -ltnH 'sport = :8080' | grep -q '10.20.0.10:8080'", fail: 'Nothing listens on 10.20.0.10:8080.' },
        { id: 'not-all', label: 'Not on every address', run: "! ss -ltnH 'sport = :8080' | grep -Eq '(0\\.0\\.0\\.0|\\*|\\[::\\]):8080'", fail: 'A listener on 8080 accepts connections on every address. Bind to 10.20.0.10 only.' },
        { id: 'reachable', label: 'A client can connect', run: 'nc -z -w2 10.20.0.10 8080', fail: 'Connecting to 10.20.0.10:8080 fails.' },
      ],
      solution: 'nohup nc -lk 10.20.0.10 8080 >/dev/null 2>&1 & sleep 1',
    },
  ],
};
