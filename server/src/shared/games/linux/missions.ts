// The missions of the Linux Command Explorer. Each one is a small made-up server (orbit-01) and a
// goal. The player is the user "ops". Everything here is fixed data, so every day is the same for
// everyone and every mission can be replayed from its `solution`.
import { hashString, seededRandom } from "../daily.js";
import type { FsSpec } from "./fs.js";
import type { Mission, Proc, ShellState } from "./model.js";

// ---------------------------------------------------------------- helpers

const lines = (...l: string[]): string => l.join("\n") + "\n";
const ran = (s: ShellState, re: RegExp): boolean => s.history.some((h) => re.test(h));
const saw = (s: ShellState, what: string | RegExp): boolean => (typeof what === "string" ? s.shown.includes(what) : what.test(s.shown));
const exists = (s: ShellState, path: string): boolean => s.fs.peek(path) !== null;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The parts every server has. A mission adds to these (and may replace them). */
function base(): FsSpec {
  return {
    "/etc/hostname": "orbit-01\n",
    "/etc/hosts": lines("127.0.0.1 localhost", "10.0.0.10 orbit-01"),
    "/etc/os-release": lines('NAME="Debian GNU/Linux"', 'VERSION="12 (bookworm)"'),
    "/etc/passwd": lines(
      "root:x:0:0:root:/root:/bin/bash",
      "ops:x:1000:1000:Ops:/home/ops:/bin/bash",
      "alice:x:1002:1002:Alice:/home/alice:/bin/bash",
      "bob:x:1003:1003:Bob:/home/bob:/bin/bash",
      "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin",
    ),
    "/home/ops/.bashrc": lines("# ~/.bashrc", "alias ll='ls -l'"),
    "/home/ops/todo.txt": lines("1. read the mission panel", "2. explore with ls and cat", "3. ask for a hint only when stuck"),
    "/root/": { owner: "root", mode: 0o700 },
    "/root/notes.txt": { content: "root only\n", mode: 0o600 },
    "/tmp/": { mode: 0o777 },
    "/var/log/": {},
  };
}

function accessLog(seed: string, count: number): string {
  const r = seededRandom(hashString(seed));
  const ips = ["10.0.0.4", "10.0.0.7", "10.0.1.12", "192.168.1.5", "172.16.0.9"];
  const paths = ["/", "/login", "/api/items", "/api/orders", "/static/app.js", "/health", "/about"];
  const statuses = [200, 200, 200, 200, 304, 404, 500];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * 97;
    const ip = ips[Math.floor(r() * ips.length)]!;
    const path = paths[Math.floor(r() * paths.length)]!;
    const status = statuses[Math.floor(r() * statuses.length)]!;
    out.push(`${ip} - - [01/Jan/2026:${pad2(Math.floor(t / 3600) % 24)}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}] "GET ${path} HTTP/1.1" ${status} ${200 + Math.floor(r() * 9000)}`);
  }
  return out.join("\n") + "\n";
}

/** A login log. `failed` and `accepted` say how many lines each address gets. Lines are shuffled. */
function authLog(seed: string, failed: Array<[string, number]>, accepted: Array<[string, number]>, noise: number): { text: string; failedTotal: number } {
  const r = seededRandom(hashString(seed));
  const users = ["root", "admin", "deploy", "test", "oracle", "ubuntu"];
  const port = () => 30000 + Math.floor(r() * 30000);
  const pid = () => 1000 + Math.floor(r() * 8000);
  const events: string[] = [];
  let failedTotal = 0;
  for (const [ip, n] of failed) {
    for (let i = 0; i < n; i++) {
      const user = users[Math.floor(r() * users.length)]!;
      const invalid = r() < 0.4 ? "invalid user " : "";
      events.push(`orbit-01 sshd[${pid()}]: Failed password for ${invalid}${user} from ${ip} port ${port()} ssh2`);
      failedTotal++;
    }
  }
  for (const [ip, n] of accepted) {
    for (let i = 0; i < n; i++) events.push(`orbit-01 sshd[${pid()}]: Accepted password for deploy from ${ip} port ${port()} ssh2`);
  }
  for (let i = 0; i < noise; i++) {
    const pick = Math.floor(r() * 4);
    if (pick === 0) events.push(`orbit-01 sshd[${pid()}]: Connection closed by 10.0.0.9 port ${port()} [preauth]`);
    else if (pick === 1) events.push(`orbit-01 sshd[${pid()}]: pam_unix(sshd:session): session opened for user ops(uid=1000) by (uid=0)`);
    else if (pick === 2) events.push(`orbit-01 sshd[${pid()}]: Invalid user guest from 198.51.100.200 port ${port()}`);
    else events.push(`orbit-01 CRON[${pid()}]: pam_unix(cron:session): session closed for user root`);
  }
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [events[i], events[j]] = [events[j]!, events[i]!];
  }
  const text = events.map((e, i) => {
    const t = (i * 41) % 86400;
    return `2026-01-01T${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)} ${e}`;
  });
  return { text: text.join("\n") + "\n", failedTotal };
}

const ACCESS_LINES = 214;
const AUTH_EASY = authLog("auth-medium", [["203.0.113.9", 23], ["198.51.100.4", 17], ["192.0.2.88", 11]], [["10.0.0.5", 30]], 60);
const AUTH_HARD = authLog(
  "auth-hard",
  [["203.0.113.77", 91], ["198.51.100.23", 64], ["192.0.2.14", 37], ["203.0.113.5", 22], ["198.51.100.99", 15], ["192.0.2.200", 8]],
  [["10.0.0.5", 120], ["10.0.0.6", 40]],
  80,
);

// ---------------------------------------------------------------- easy

const hiddenNote: Mission = {
  id: "linux-hidden-note",
  difficulty: "easy",
  title: "The hidden note",
  brief: "A file in the app folder is hiding. Find it and read the release word.",
  story: "Priya just joined the team. She needs the release word for tonight's deploy, but nobody can find it. Someone said it is in a hidden file inside the app folder.",
  par: 3,
  hints: [
    "Files whose names start with a dot are hidden. A plain ls does not show them.",
    "ls -a shows hidden files too. Try: ls -a app",
    "Read the hidden file with cat, then answer with: submit WORD",
  ],
  files: {
    ...base(),
    "/home/ops/app/README.md": lines("# Orbit app", "Run main.py to start the app."),
    "/home/ops/app/main.py": lines("print('orbit app starting')"),
    "/home/ops/app/requirements.txt": lines("flask==3.0.0", "gunicorn==21.2.0"),
    "/home/ops/app/.deploy_note": lines("Release word: BLUEFOX-42", "Do not share this word outside the team."),
    "/home/ops/app/static/": {},
    "/home/ops/app/static/logo.txt": "(a tiny logo)\n",
  },
  answer: ["BLUEFOX-42"],
  objectives: [
    { label: "Show the hidden files in the app folder", done: (s) => saw(s, ".deploy_note") },
    { label: "Read the hidden file", done: (s) => saw(s, "BLUEFOX-42") },
    { label: "Submit the release word with submit", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["ls -a app", "cat app/.deploy_note", "submit BLUEFOX-42"],
};

const configPort: Mission = {
  id: "linux-config-port",
  difficulty: "easy",
  title: "Which port?",
  brief: "Read the web app's config file and find the port it listens on.",
  story: "The proxy team needs to point at the web app, but nobody remembers its port. The settings live in a config folder under /etc/webapp.",
  par: 3,
  hints: [
    "Config files usually live in /etc. Try: ls /etc/webapp",
    "Use app.conf (the .old file is outdated). Read it with cat.",
    "Look for the line with listen_port, then: submit NUMBER",
  ],
  files: {
    ...base(),
    "/etc/webapp/app.conf": lines("# webapp settings", "name=orbit-web", "listen_host=0.0.0.0", "listen_port=8472", "workers=4", "log_level=info"),
    "/etc/webapp/app.conf.old": lines("# old settings (do not use)", "name=orbit-web", "listen_host=127.0.0.1", "listen_port=8080", "workers=2"),
    "/etc/webapp/mime.types": lines("text/html html", "text/css css"),
  },
  answer: ["8472"],
  objectives: [
    { label: "Look in the /etc/webapp folder", done: (s) => saw(s, "app.conf") },
    { label: "Read the current config file", done: (s) => saw(s, "listen_port=8472") },
    { label: "Submit the port with submit", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["ls /etc/webapp", "cat /etc/webapp/app.conf", "submit 8472"],
};

const countLines: Mission = {
  id: "linux-count-requests",
  difficulty: "easy",
  title: "How many requests?",
  brief: "Count how many lines the web server's access log has. Each line is one request.",
  story: "The boss asks how many requests the web server handled today. The server writes one line per request into an access log in /var/log/webapp.",
  par: 3,
  hints: [
    "Find the log first: ls /var/log/webapp",
    "wc counts things. wc -l counts lines.",
    "Try: wc -l /var/log/webapp/access.log and then submit the number",
  ],
  files: {
    ...base(),
    "/var/log/webapp/access.log": accessLog("access-easy", ACCESS_LINES),
    "/var/log/webapp/error.log": lines("2026-01-01 03:12:44 error: upstream timed out", "2026-01-01 09:40:02 error: bad gateway"),
  },
  answer: [String(ACCESS_LINES)],
  objectives: [
    { label: "Find the web server logs", done: (s) => saw(s, "access.log") },
    { label: "Count the lines in access.log", done: (s) => saw(s, new RegExp(`\\b${ACCESS_LINES}\\b`)) },
    { label: "Submit the number with submit", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["ls /var/log/webapp", "wc -l /var/log/webapp/access.log", `submit ${ACCESS_LINES}`],
};

const biggestFile: Mission = {
  id: "linux-biggest-file",
  difficulty: "easy",
  title: "The biggest file",
  brief: "The downloads folder is eating the disk. Find the biggest file in it.",
  story: "Your disk is almost full. Most of the space is in the downloads folder. Which single file is the biggest?",
  par: 3,
  hints: [
    "ls -l shows the size of each file in bytes.",
    "Add -S to sort by size, biggest first: ls -lS downloads",
    "Or use ls -lh to see sizes like 870M. Then: submit FILENAME",
  ],
  files: {
    ...base(),
    "/home/ops/downloads/notes.txt": { content: "meeting notes\n", size: 2300 },
    "/home/ops/downloads/invoice-march.pdf": { content: "pdf", size: 480_000 },
    "/home/ops/downloads/photo-001.jpg": { content: "jpg", size: 3_400_000 },
    "/home/ops/downloads/photo-002.jpg": { content: "jpg", size: 2_900_000 },
    "/home/ops/downloads/holiday-video.mp4": { content: "mp4", size: 912_000_000 },
    "/home/ops/downloads/backup-old.zip": { content: "zip", size: 410_000_000 },
    "/home/ops/downloads/setup.iso": { content: "iso", size: 702_000_000 },
    "/home/ops/downloads/music.mp3": { content: "mp3", size: 7_800_000 },
  },
  answer: ["holiday-video.mp4"],
  objectives: [
    { label: "Look at the downloads folder", done: (s) => saw(s, "holiday-video.mp4") },
    { label: "Show the file sizes (try ls -l)", done: (s) => ran(s, /\bls\b[^|;&]*\s-[a-zA-Z]*l|\bdu\b/) },
    { label: "Submit the name of the biggest file", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["ls -lS downloads", "submit holiday-video.mp4"],
};

// ---------------------------------------------------------------- medium

const failedLogins: Mission = {
  id: "linux-failed-logins",
  difficulty: "medium",
  title: "Failed logins",
  brief: "Count the failed password attempts in the login log.",
  story: "Security saw strange traffic last night. The login log is /var/log/auth.log. Each failed password attempt has the words Failed password. How many are there?",
  par: 3,
  hints: [
    "grep prints the lines that match a word: grep 'Failed password' /var/log/auth.log",
    "Count them with grep -c, or send the lines to wc -l with a pipe.",
    "Try: grep -c 'Failed password' /var/log/auth.log then submit NUMBER",
  ],
  files: { ...base(), "/var/log/auth.log": AUTH_EASY.text },
  answer: [String(AUTH_EASY.failedTotal)],
  objectives: [
    { label: "Search auth.log for Failed password", done: (s) => ran(s, /grep/) && ran(s, /auth\.log/) && ran(s, /failed password/i) },
    { label: "Count the matching lines", done: (s) => saw(s, new RegExp(`(^|\\n)\\s*${AUTH_EASY.failedTotal}\\s*(\\n|$)`)) },
    { label: "Submit the count with submit", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["grep -c 'Failed password' /var/log/auth.log", `submit ${AUTH_EASY.failedTotal}`],
};

const OLD_TMP = ["/var/tmp/cache-a.tmp", "/var/tmp/cache-b.tmp", "/var/tmp/session-91.tmp", "/var/tmp/render/frame1.tmp"];
const KEEP_TMP = ["/var/tmp/upload-77.tmp", "/var/tmp/lock-now.tmp", "/var/tmp/render/frame2.tmp", "/var/tmp/report.txt", "/var/tmp/old.log"];

const oldTmp: Mission = {
  id: "linux-old-temp-files",
  difficulty: "medium",
  title: "Clean the temp folder",
  brief: "Delete the .tmp files in /var/tmp that are older than 7 days. Keep everything else.",
  story: "/var/tmp is full of leftovers. The rule: .tmp files older than 7 days can go. Fresh .tmp files are still used by running jobs, and other file types must stay.",
  par: 3,
  hints: [
    "find can test the age of files: -mtime +7 means older than 7 days.",
    "Combine tests: find /var/tmp -name '*.tmp' -mtime +7 (first only look at what it finds).",
    "When the list looks right, add -delete at the end.",
  ],
  files: {
    ...base(),
    "/var/tmp/": { owner: "ops" },
    "/var/tmp/render/": { owner: "ops" },
    "/var/tmp/cache-a.tmp": { content: "x", age: 12 },
    "/var/tmp/cache-b.tmp": { content: "x", age: 30 },
    "/var/tmp/session-91.tmp": { content: "x", age: 9 },
    "/var/tmp/upload-77.tmp": { content: "x", age: 2 },
    "/var/tmp/lock-now.tmp": { content: "x", age: 0 },
    "/var/tmp/report.txt": { content: "quarterly numbers\n", age: 40 },
    "/var/tmp/old.log": { content: "old log\n", age: 60 },
    "/var/tmp/render/frame1.tmp": { content: "x", age: 20 },
    "/var/tmp/render/frame2.tmp": { content: "x", age: 1 },
  },
  objectives: [
    { label: "Find the .tmp files older than 7 days", done: (s) => ran(s, /find[^|;&]*-mtime/) },
    { label: "Delete the old .tmp files", done: (s) => OLD_TMP.every((p) => !exists(s, p)) },
    { label: "Keep the fresh .tmp files and the other files", done: (s) => OLD_TMP.every((p) => !exists(s, p)) && KEEP_TMP.every((p) => exists(s, p)) },
  ],
  goal: (s) => OLD_TMP.every((p) => !exists(s, p)) && KEEP_TMP.every((p) => exists(s, p)),
  solution: ["find /var/tmp -name '*.tmp' -mtime +7", "find /var/tmp -name '*.tmp' -mtime +7 -delete"],
};

const PROCS: Proc[] = [
  { pid: 1, user: "root", cpu: 0, mem: 0.1, vsz: 168000, rss: 11000, stat: "Ss", start: "Jan01", time: "0:03", command: "/sbin/init" },
  { pid: 77, user: "root", cpu: 0, mem: 0.1, vsz: 8500, rss: 2200, stat: "Ss", start: "Jan01", time: "0:00", command: "/usr/sbin/cron -f" },
  { pid: 311, user: "postgres", cpu: 1.2, mem: 3.4, vsz: 320000, rss: 56000, stat: "Ss", start: "Jan01", time: "1:12", command: "postgres: main" },
  { pid: 520, user: "www-data", cpu: 0.3, mem: 1.1, vsz: 98000, rss: 18000, stat: "S", start: "Jan01", time: "0:20", command: "nginx: worker process" },
  { pid: 988, user: "root", cpu: 0, mem: 0.2, vsz: 15400, rss: 6000, stat: "Ss", start: "Jan01", time: "0:00", command: "sshd: /usr/sbin/sshd -D" },
  { pid: 1204, user: "ops", cpu: 0, mem: 0.2, vsz: 9100, rss: 4800, tty: "pts/0", stat: "Ss", start: "00:00", time: "0:00", command: "-bash" },
  { pid: 4242, user: "ops", cpu: 99.8, mem: 12.5, vsz: 2048000, rss: 410000, stat: "Rl", start: "23:41", time: "412:08", command: "/opt/tools/reindex --all --forever", ignoresTerm: true },
];

const runaway: Mission = {
  id: "linux-runaway-process",
  difficulty: "medium",
  title: "Runaway process",
  brief: "One process uses all the CPU. Stop it, but leave the other services running.",
  story: "The server is crawling. Something is using almost the whole CPU. Find it with ps, then stop it. Do not touch the database or the web server.",
  par: 3,
  hints: [
    "ps aux lists every process. Look at the %CPU column and note the PID.",
    "kill PID asks the process to stop. Some programs ignore that polite request.",
    "If it is still there in ps aux, force it with kill -9 PID.",
  ],
  files: base(),
  procs: PROCS,
  objectives: [
    { label: "List the processes and find the one using the CPU", done: (s) => ran(s, /\bps\b|\bpgrep\b/) },
    { label: "Stop the runaway process", done: (s) => !s.procs.some((p) => p.pid === 4242) },
    { label: "Leave the database and the web server running", done: (s) => !s.procs.some((p) => p.pid === 4242) && s.procs.some((p) => p.pid === 311) && s.procs.some((p) => p.pid === 520) },
  ],
  goal: (s) => !s.procs.some((p) => p.pid === 4242) && s.procs.some((p) => p.pid === 311) && s.procs.some((p) => p.pid === 520),
  solution: ["ps aux", "kill 4242", "kill -9 4242"],
};

const NOTES = lines("project notes", "1. ship the report", "2. call the vendor");

const fixPermissions: Mission = {
  id: "linux-script-permissions",
  difficulty: "medium",
  title: "Script will not run",
  brief: "backup.sh says Permission denied. Fix its permissions and run it.",
  story: "The nightly backup script was copied to the server, but it will not start. Fix it, then run it once so the notes are backed up into ~/backup.",
  cwd: "/home/ops/scripts",
  par: 3,
  hints: [
    "Run ./backup.sh and read the error. Then ls -l shows the permission letters (rw-r--r--).",
    "There is no x (execute) in the letters. chmod +x adds it.",
    "chmod +x backup.sh and then ./backup.sh",
  ],
  files: {
    ...base(),
    "/home/ops/scripts/backup.sh": {
      content: lines("#!/bin/bash", 'echo "Starting backup..."', "cp /home/ops/data/notes.txt /home/ops/backup/notes.txt", 'echo "Backup complete"'),
      mode: 0o644,
    },
    "/home/ops/scripts/cleanup.sh": { content: lines("#!/bin/bash", 'echo "Cleaning..."'), mode: 0o755 },
    "/home/ops/data/notes.txt": NOTES,
    "/home/ops/backup/": {},
  },
  objectives: [
    { label: "Check the permissions of backup.sh", done: (s) => ran(s, /\bls\b[^|;&]*-[a-zA-Z]*l/) || saw(s, "Permission denied") },
    { label: "Make backup.sh executable", done: (s) => ((s.fs.peek("/home/ops/scripts/backup.sh")?.mode ?? 0) & 0o100) !== 0 },
    { label: "Run it so the notes are backed up", done: (s) => s.fs.text("/home/ops/backup/notes.txt") === NOTES },
  ],
  goal: (s) => ((s.fs.peek("/home/ops/scripts/backup.sh")?.mode ?? 0) & 0o100) !== 0 && s.fs.text("/home/ops/backup/notes.txt") === NOTES,
  solution: ["ls -l", "chmod +x backup.sh", "./backup.sh"],
};

const fullDisk: Mission = {
  id: "linux-full-disk",
  difficulty: "medium",
  title: "Who fills /var?",
  brief: "The disk is 97 percent full. Find which folder directly under /var uses the most space.",
  story: "An alert says the disk is almost full, and most of it is under /var. Use du to measure the folders and find the culprit. Submit its full path.",
  par: 3,
  hints: [
    "df -h shows how full each disk is.",
    "du -sh PATH prints the total size of one folder. The * matches every folder: du -sh /var/*",
    "Look for the biggest number (G is bigger than M), then submit its path, like /var/xyz",
  ],
  files: {
    ...base(),
    "/var/backups/db-2025-12-01.dump": { content: "dump", size: 1_900_000_000 },
    "/var/backups/db-2025-12-15.dump": { content: "dump", size: 1_850_000_000 },
    "/var/backups/db-2025-12-29.dump": { content: "dump", size: 1_800_000_000 },
    "/var/lib/mysql/ibdata1": { content: "db", size: 900_000_000 },
    "/var/lib/dpkg/status": "package list\n",
    "/var/cache/apt/archives/libfoo.deb": { content: "deb", size: 120_000_000 },
    "/var/cache/apt/archives/libbar.deb": { content: "deb", size: 60_000_000 },
    "/var/log/syslog": { content: "log", size: 150_000_000 },
    "/var/log/app.log": { content: "log", size: 140_000_000 },
    "/var/spool/cron/": { owner: "root", mode: 0o700 },
    "/var/spool/cron/root": { content: "0 3 * * * backup\n", owner: "root", mode: 0o600 },
    "/var/tmp/scratch.txt": "scratch\n",
  },
  df: [
    ["/dev/sda1", "20G", "19G", "600M", "97%", "/"],
    ["tmpfs", "2.0G", "0", "2.0G", "0%", "/dev/shm"],
  ],
  answer: ["/var/backups"],
  pathAnswer: true,
  objectives: [
    { label: "Check how full the disk is", done: (s) => ran(s, /\bdf\b/) },
    { label: "Measure the folders under /var", done: (s) => ran(s, /\bdu\b/) },
    { label: "Submit the path of the biggest folder", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["df -h", "du -sh /var/*", "submit /var/backups"],
};

// ---------------------------------------------------------------- hard

const topAttacker: Mission = {
  id: "linux-top-attacker",
  difficulty: "hard",
  title: "Who is attacking?",
  brief: "Find the IP address with the most failed logins in the login log.",
  story: "Someone is guessing passwords. The log /var/log/auth.log has thousands of lines, and some are normal logins that you must ignore. Which IP address failed the most?",
  par: 3,
  hints: [
    "Keep only the failed lines first: grep 'Failed password' /var/log/auth.log",
    "grep -o -E '([0-9]+\\.){3}[0-9]+' prints only the IP address of each line.",
    "Then: sort | uniq -c | sort -rn | head -3 counts each IP and shows the top ones. Submit the top IP.",
  ],
  files: { ...base(), "/var/log/auth.log": AUTH_HARD.text },
  answer: ["203.0.113.77"],
  objectives: [
    { label: "Keep only the Failed password lines", done: (s) => ran(s, /grep[^|]*failed password/i) },
    { label: "Count how often each IP address appears", done: (s) => ran(s, /uniq\s+-c/) && ran(s, /sort/) },
    { label: "Submit the IP address with the most failures", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: [
    "grep 'Failed password' /var/log/auth.log | grep -o -E '([0-9]+\\.){3}[0-9]+' | sort | uniq -c | sort -rn | head -3",
    "submit 203.0.113.77",
  ],
};

const CONF_START = lines("# orbit-web config", "name=orbit-web", "port=8080", "max_connections=50", "debug=true", "log_level=info");

function confLines(s: ShellState): string[] | null {
  const t = s.fs.text("/home/ops/app/app.conf");
  return t === null ? null : t.split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
}
const hasOnce = (l: string[], key: string, value: string): boolean => l.filter((x) => x.startsWith(key + "=")).length === 1 && l.includes(`${key}=${value}`);

const editConfig: Mission = {
  id: "linux-edit-config",
  difficulty: "hard",
  title: "Tune the config",
  brief: "Edit ~/app/app.conf: max_connections=200, debug=false, and a new line cache_ttl=300. Keep every other setting.",
  story: "Tonight the app goes to production. The config must change: more connections, debug off, and a cache time. There is no editor here, so use redirects and filters. Careful: > replaces a whole file.",
  par: 4,
  hints: [
    "echo 'cache_ttl=300' >> app.conf adds a line. One > would erase the file, so use >> to add.",
    "sed -i 's/old/new/' FILE changes text inside the file. Try it for max_connections=50.",
    "Or rebuild the file: grep -v removes lines, > writes to a new file, then mv it over the old one. Never write > onto the file you are reading.",
  ],
  files: { ...base(), "/home/ops/app/app.conf": CONF_START, "/home/ops/app/main.py": "print('hello')\n" },
  objectives: [
    { label: "max_connections is 200 (and only once)", done: (s) => { const l = confLines(s); return !!l && hasOnce(l, "max_connections", "200"); } },
    { label: "debug is false (and only once)", done: (s) => { const l = confLines(s); return !!l && hasOnce(l, "debug", "false"); } },
    {
      label: "cache_ttl=300 is added and the other settings are kept",
      done: (s) => { const l = confLines(s); return !!l && hasOnce(l, "cache_ttl", "300") && l.includes("name=orbit-web") && l.includes("port=8080") && l.includes("log_level=info"); },
    },
  ],
  goal: (s) => {
    const l = confLines(s);
    return !!l && hasOnce(l, "max_connections", "200") && hasOnce(l, "debug", "false") && hasOnce(l, "cache_ttl", "300") && l.includes("name=orbit-web") && l.includes("port=8080") && l.includes("log_level=info");
  },
  solution: ["cd app", "sed -i 's/max_connections=50/max_connections=200/' app.conf", "sed -i 's/debug=true/debug=false/' app.conf", "echo cache_ttl=300 >> app.conf"],
};

const trail: Mission = {
  id: "linux-follow-the-trail",
  difficulty: "hard",
  title: "Follow the trail",
  brief: "Alice left a trail of notes across users and folders. Follow it to the current vault code.",
  story: "Alice left the company and her notes are scattered. Start with mission.txt in your home folder and follow the trail. Some doors are locked, and some notes are old or wrong. You are in the dev group.",
  groups: ["dev"],
  par: 7,
  hints: [
    "Read mission.txt first. Each note tells you where the next one is.",
    "grep -r WORD FOLDER searches inside all files of a folder. Use it for the word HANDOVER under /srv. Two files match: trust the one from Bob.",
    "In Bob's vault, grep -r CODE /home/bob/.vault shows every code with its file. Ignore the ones marked expired or draft.",
  ],
  files: {
    ...base(),
    "/home/ops/mission.txt": lines("Mission: find the current vault code.", "Alice started an audit trail before she left.", "Her first note is /home/alice/notes/note1.txt. Read it and follow the trail."),
    "/home/alice/notes/note1.txt": lines("Audit trail, step 1.", "I handed this over to Bob. His handover note is somewhere under /srv.", "It contains the word HANDOVER. Use grep -r to find it."),
    "/srv/shared/projects/alpha/readme.txt": "Alpha project. Nothing here.\n",
    "/srv/shared/projects/beta/todo.txt": "TODO: renew certificates\n",
    "/srv/shared/archive/old-handover.txt": lines("Old HANDOVER from 2023. Ignore this one.", "The vault used to be in /home/carol/vault."),
    "/srv/shared/handover/bob-note.txt": { content: lines("HANDOVER note from Bob.", "I moved the vault code into my private vault folder: /home/bob/.vault", "Ignore any file marked expired or draft."), owner: "bob", group: "dev", mode: 0o640 },
    "/home/bob/": { owner: "bob", group: "dev", mode: 0o750 },
    "/home/bob/.vault/": { owner: "bob", group: "dev", mode: 0o750 },
    "/home/bob/.vault/code-2023.txt": { content: "VAULT CODE: OLD-0001 (expired)\n", owner: "bob", group: "dev", mode: 0o640, age: 400 },
    "/home/bob/.vault/code-current.txt": { content: "VAULT CODE: ORBIT-7731\n", owner: "bob", group: "dev", mode: 0o640, age: 3 },
    "/home/bob/.vault/code-new.txt": { content: "VAULT CODE: NEXT-0000 (draft, not approved)\n", owner: "bob", group: "dev", mode: 0o640, age: 1 },
    "/home/carol/": { owner: "carol", mode: 0o700 },
    "/home/carol/vault/secret.txt": { content: "carol private\n", owner: "carol", mode: 0o600 },
  },
  answer: ["ORBIT-7731"],
  objectives: [
    { label: "Read Alice's first note", done: (s) => saw(s, "Audit trail, step 1") },
    { label: "Find and read Bob's handover note", done: (s) => saw(s, "HANDOVER note from Bob") },
    { label: "Open Bob's vault and find the valid code", done: (s) => saw(s, "VAULT CODE: ORBIT-7731") },
    { label: "Submit the vault code with submit", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: [
    "cat mission.txt",
    "cat /home/alice/notes/note1.txt",
    "grep -r HANDOVER /srv",
    "cat /srv/shared/handover/bob-note.txt",
    "grep -r CODE /home/bob/.vault",
    "submit ORBIT-7731",
  ],
};

const LIVE_KEY = "acme_live_51Hx9QzLmN3pRtUvWxYz2A4b";

const leakedSecret: Mission = {
  id: "linux-leaked-secret",
  difficulty: "hard",
  title: "The leaked key",
  brief: "A live payment key was committed by mistake. Find the file that holds it.",
  story: "The payment provider warns that a live key leaked into the code. Live keys start with acme_live_ followed by 24 letters and digits. Search /srv/app, ignore test keys and placeholders, and submit the path of the file with the real key.",
  par: 3,
  hints: [
    "grep -r searches every file in a folder. Try: grep -r acme_live_ /srv/app",
    "Some hits are only examples. The real key has 24 letters and digits right after acme_live_.",
    "A stricter search: grep -rE 'acme_live_[A-Za-z0-9]{24}' /srv/app. Then: submit THE-PATH",
  ],
  files: {
    ...base(),
    "/srv/app/src/main.py": lines("import os", 'API_KEY = os.environ["API_KEY"]', "def run():", "    print('running')"),
    "/srv/app/src/config.py": lines('SECRET_KEY = "changeme"', 'PAY_KEY = "acme_test_4eC39HqLyjWDarjtT1zdp7dc"'),
    "/srv/app/tests/fixtures.py": lines('LIVE_KEY_PLACEHOLDER = "acme_live_REPLACE_ME_BEFORE_USE"'),
    "/srv/app/docs/payments.md": lines("# Payments", "Live keys look like acme_live_<24 characters>. Never commit them."),
    "/srv/app/.env.example": lines("DB_URL=postgres://localhost/app", "PAY_KEY=acme_test_xxxxxxxxxxxxxxxxxxxxxxxx", "SECRET_KEY=changeme"),
    "/srv/app/old/deploy.env.bak": lines("# backup of the old deploy settings", "DB_URL=postgres://db.internal/app", `PAY_KEY=${LIVE_KEY}`, "DEBUG=false"),
    "/srv/secrets/": { owner: "root", mode: 0o700 },
    "/srv/secrets/vault.txt": { content: "locked\n", owner: "root", mode: 0o600 },
  },
  answer: ["/srv/app/old/deploy.env.bak"],
  pathAnswer: true,
  objectives: [
    { label: "Search the code for acme_live_", done: (s) => ran(s, /grep[^|;&]*sk_live/) },
    { label: "Spot the real key among the placeholders", done: (s) => saw(s, LIVE_KEY) },
    { label: "Submit the path of the file with the key", done: (s) => s.answerOk },
  ],
  goal: (s) => s.answerOk,
  solution: ["grep -rE 'acme_live_[A-Za-z0-9]{24}' /srv/app", "submit /srv/app/old/deploy.env.bak"],
};

const PROD_YML = lines("version: 8", "replicas: 4", "debug: false");

const restoreFile: Mission = {
  id: "linux-restore-backup",
  difficulty: "hard",
  title: "Oops, deleted",
  brief: "prod.yml was deleted from ~/site/config. Restore the newest copy from the backups.",
  story: "A cleanup script removed ~/site/config/prod.yml. The backups are in /backups (daily and weekly, with the date in the folder name). Restore the newest copy that still has the file, and do not damage the backups.",
  par: 3,
  hints: [
    "find /backups -name prod.yml shows every copy of the file.",
    "The date is in the folder name. The newest daily folder that has the file is the best copy. The 12-31 backup was taken after the deletion.",
    "cp SOURCE ~/site/config/ puts a copy back. Use cat to check it says version 8.",
  ],
  files: {
    ...base(),
    "/home/ops/site/index.html": lines("<h1>Orbit</h1>"),
    "/home/ops/site/config/app.yml": lines("name: orbit", "port: 80"),
    "/backups/weekly/2025-12-21/site/config/prod.yml": { content: lines("version: 3", "replicas: 2"), age: 11 },
    "/backups/daily/2025-12-27/site/config/prod.yml": { content: lines("version: 5", "replicas: 3"), age: 5 },
    "/backups/daily/2025-12-28/site/config/prod.yml": { content: lines("version: 6", "replicas: 3"), age: 4 },
    "/backups/daily/2025-12-29/site/config/prod.yml": { content: lines("version: 7", "replicas: 4"), age: 3 },
    "/backups/daily/2025-12-30/site/config/prod.yml": { content: PROD_YML, age: 2 },
    "/backups/daily/2025-12-31/site/config/app.yml": { content: lines("name: orbit", "port: 80"), age: 1 },
  },
  objectives: [
    { label: "Find the copies of prod.yml in /backups", done: (s) => saw(s, "2025-12-30/site/config/prod.yml") || saw(s, "2025-12-30") },
    { label: "Put prod.yml back in ~/site/config", done: (s) => exists(s, "/home/ops/site/config/prod.yml") },
    {
      label: "It is the newest version, and the backups are untouched",
      done: (s) => s.fs.text("/home/ops/site/config/prod.yml") === PROD_YML && s.fs.text("/backups/daily/2025-12-30/site/config/prod.yml") === PROD_YML,
    },
  ],
  goal: (s) => s.fs.text("/home/ops/site/config/prod.yml") === PROD_YML && s.fs.text("/backups/daily/2025-12-30/site/config/prod.yml") === PROD_YML,
  solution: ["find /backups -name prod.yml", "cp /backups/daily/2025-12-30/site/config/prod.yml ~/site/config/"],
};

/** The pool. A day shows one mission per difficulty; each tier rotates through its missions. */
export const MISSIONS: Mission[] = [
  hiddenNote, configPort, countLines, biggestFile,
  failedLogins, oldTmp, runaway, fixPermissions, fullDisk,
  topAttacker, editConfig, trail, leakedSecret, restoreFile,
];

const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

export function missionById(id: unknown): Mission | null {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}
