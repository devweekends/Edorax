// Proves which shell labs work in the browser runtime, without a browser: it boots the same
// kernel, Debian image and package image under Node, runs the lab's setup, then each step's
// solution and checks. A lab passes when every check fails to pass by accident and passes
// after the solution.
//
// Usage: pnpm labs:verify --root <Edorax Core checkout> [slug ...]
// Without slugs it runs every Linux lab with one machine. Needs Node 24, `pnpm labs:assets`
// and `pnpm labs:image` first.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { createKernel, openDisk } from "unkernel/node";
import { prepareScript, wrapped } from "../src/lib/browser-lab/prepare.ts";

const args = process.argv.slice(2);
const rootAt = args.indexOf("--root");
const contentRoot = rootAt >= 0 ? args[rootAt + 1] : process.env.BUILDMENT_CONTENT_ROOT;
const only = args.filter((arg, index) => !arg.startsWith("--") && index !== rootAt + 1);
if (!contentRoot) throw new Error("Pass --root <Edorax Core checkout> or set BUILDMENT_CONTENT_ROOT");

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "unkernel");
const distro = join(assets, "debian.erofs");
const image = join(assets, "labs-data.img");
const scratch = join(assets, ".verify.img");
for (const file of [distro, image]) if (!existsSync(file)) throw new Error(`${file} is missing. Run pnpm labs:assets and pnpm labs:image first.`);

const labsDir = join(contentRoot, "labs", "shell");
const index = load(readFileSync(join(labsDir, "index.yaml"), "utf8"));
const slugs = Array.isArray(index) ? index : (index.labs ?? []);
const labs = slugs
  .map((slug) => load(readFileSync(join(labsDir, `${slug}.yaml`), "utf8")))
  .filter((lab) => (only.length ? only.includes(lab.slug) : lab.topic === "linux" && !lab.machines?.length && !lab.machine.vm));

async function verify(lab) {
  // A sparse copy, so the lab's writes never reach the image the website serves.
  execFileSync("cp", ["--sparse=always", image, scratch]);
  const vm = await createKernel({ distro, disks: [await openDisk(scratch)], memoryMiB: 1024 });
  const sh = (script, ms) => {
    const run = vm.exec("bash", ["-c", `${script}\n`], { user: "root", cwd: "/root" }).then((result) => result.exitCode ?? 1);
    return Promise.race([run, new Promise((resolve) => setTimeout(() => resolve(124), ms))]);
  };
  const problems = [];
  try {
    await sh(prepareScript(lab.machine.name), 30_000);
    if (lab.setup && (await sh(wrapped(lab.setup), 420_000)) !== 0) problems.push("setup failed");
    if (lab.boot) await sh(wrapped(lab.boot), 60_000);
    for (const step of problems.length ? [] : lab.steps) {
      if (step.quiz) continue;
      let early = true;
      for (const check of step.checks) early &&= (await sh(`${wrapped(check.run)} </dev/null >/dev/null 2>&1`, 30_000)) === 0;
      if (early) problems.push(`${step.id}: passes before the work is done`);
      await sh(`${wrapped(step.solution)} </dev/null`, 120_000);
      for (const check of step.checks) {
        if ((await sh(`${wrapped(check.run)} </dev/null >/dev/null 2>&1`, 30_000)) !== 0) problems.push(`${step.id}: check ${check.id} fails after the solution`);
      }
    }
  } catch (error) {
    problems.push(String(error));
  }
  await vm.stop().catch(() => undefined);
  rmSync(scratch, { force: true });
  return problems;
}

let failed = 0;
for (const lab of labs) {
  const problems = await verify(lab);
  if (problems.length) failed += 1;
  console.log(`${problems.length ? "FAIL" : "PASS"} ${lab.slug}${problems.length ? `\n  - ${problems.join("\n  - ")}` : ""}`);
}
console.log(`${labs.length - failed} of ${labs.length} labs pass in the browser runtime`);
process.exit(failed ? 1 : 0);
