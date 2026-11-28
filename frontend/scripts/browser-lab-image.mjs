// Builds public/unkernel/labs-data.img: a disk with the packages the browser shell labs need.
// It boots Debian in unkernel under Node (with network, about 5 minutes), installs the packages
// with apt, and powers off. The browser attaches this disk read-only with an in-memory overlay,
// so every lab start is a clean machine with the packages already there. The labs have no network.
//
// Keep PACKAGES the same as BROWSER_LAB_PACKAGES in server/src/services/shell-labs-public.ts:
// the server offers a lab in the browser only when all its packages are in this image.
// Needs Node 24. Run: pnpm labs:image
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = [
  "acl", "apt-utils", "cron", "curl", "dnsmasq", "dnsutils", "file", "iproute2", "iputils-ping", "logrotate", "lsof",
  "nano", "netcat-openbsd", "openssh-client", "openssh-server", "plocate", "procps", "psmisc", "python3", "sudo", "vim",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "unkernel");
const target = join(out, "labs-data.img");
const part = `${target}.part`;
const cli = join(dirname(createRequire(import.meta.url).resolve("unkernel/package.json")), "dist", "cli.mjs");

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("unkernel needs Node 24 or newer");
mkdirSync(out, { recursive: true });
rmSync(part, { force: true });

const install = [
  "apt-get update >/tmp/apt.log 2>&1",
  `DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${PACKAGES.join(" ")} >>/tmp/apt.log 2>&1`,
  "echo EDORAX-APT-EXIT $?",
  "apt-get clean",
  "rm -rf /var/lib/apt/lists/*",
  "tail -3 /tmp/apt.log",
  "sync",
  "poweroff",
].join("; ");

console.log(`Installing ${PACKAGES.length} packages into a new image. This takes about 5 minutes.`);
const run = spawnSync(process.execPath, [cli, "--distro", "debian", "--mem", "2048", "--data", part, "--timeout", "1500", "--input", `{8}sudo sh -c '${install}'\\n`], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
if (run.status !== 0 || !/EDORAX-APT-EXIT 0\b/.test(output) || !existsSync(part)) {
  rmSync(part, { force: true });
  console.error(output.split("\n").slice(-25).join("\n"));
  throw new Error("The image was not built");
}
renameSync(part, target);
console.log(`Saved ${target}. The file is sparse: about 4 GB in size, about 260 MB of real data.`);
