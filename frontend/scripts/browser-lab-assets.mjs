// Puts the files the browser shell labs need into public/unkernel/ (not in git):
//   web.mjs, _chunks/   the unkernel SDK, loaded by the page as it is (never bundled)
//   unkernel.wasm       the Linux kernel, compiled to WebAssembly
//   debian.erofs        the Debian system the labs run on (downloaded once, checked by SHA-256)
// The package image (labs-data.img) is made by `pnpm labs:image`.
// Run: pnpm labs:assets
import { createHash } from "node:crypto";
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "unkernel");
const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve("unkernel/package.json"));
const { version } = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
const release = `https://github.com/pithings/unkernel/releases/download/v${version}`;

mkdirSync(join(out, "_chunks"), { recursive: true });
for (const file of ["web.mjs", "unkernel.wasm", "_chunks/core.mjs", "_chunks/vk-host.mjs", "_chunks/vk-shader.mjs"]) {
  cpSync(join(packageDir, "dist", file), join(out, file));
}
for (const file of ["LICENSE", "LICENSE-MIT", "THIRD-PARTY.md"]) cpSync(join(packageDir, file), join(out, file));
writeFileSync(join(out, "version.json"), JSON.stringify({ unkernel: version }) + "\n");

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

const index = await (await fetch(`${release}/distros.json`)).json();
const debian = index.distros.find((item) => item.name === "debian");
if (!debian) throw new Error(`The unkernel release v${version} lists no Debian image`);
const target = join(out, "debian.erofs");
if (existsSync(target) && statSync(target).size === debian.size && (await sha256(target)) === debian.sha256) {
  console.log(`debian.erofs is up to date (${debian.image})`);
} else {
  console.log(`Downloading ${debian.file} (${Math.round(debian.size / 1e6)} MB) ...`);
  const response = await fetch(`${release}/${debian.file}`);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const part = `${target}.part`;
  writeFileSync(part, Buffer.from(await response.arrayBuffer()));
  const got = await sha256(part);
  if (got !== debian.sha256) {
    rmSync(part, { force: true });
    throw new Error(`debian.erofs has the wrong SHA-256: ${got}`);
  }
  renameSync(part, target);
  console.log(`Saved debian.erofs (${debian.image})`);
}
console.log(`Browser lab files are in ${out}`);
