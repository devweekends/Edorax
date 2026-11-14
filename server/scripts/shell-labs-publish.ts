/** Shell labs: validate and publish the labs of the private content repository.
 *
 * --check    validates <root>/labs/shell without a database connection.
 * --publish  validates every lab first, then imports them in one transaction.
 *            Prints how many labs were added, updated, unchanged and deactivated.
 * The root is BUILDMENT_CONTENT_ROOT or --root <path>. Any validation problem
 * exits non-zero and changes nothing.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readShellLabSource, shellLabsDirForRoot } from "./shell-labs-source.js";

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--publish") ? "publish" : args.includes("--check") ? "check" : null;
  if (!mode) throw new Error("Usage: shell-labs-publish.ts --check | --publish [--root <content checkout>]");

  const dir = shellLabsDirForRoot(args);
  const source = readShellLabSource(dir);
  if (source.problems.length) {
    console.error(`Shell labs: ${source.problems.length} problem(s) in ${dir}\n${source.problems.map((line) => `  - ${line}`).join("\n")}`);
    process.exitCode = 1;
    return;
  }
  if (mode === "check") {
    console.log(`Shell labs: ${source.labs.length} labs OK in ${dir}`);
    return;
  }

  // Loaded only when publishing, so --check never needs a database.
  const { importShellLabs } = await import("../src/services/shell-labs.service.js");
  const { prisma } = await import("../src/db/prisma.js");
  try {
    const result = await importShellLabs(source.labs);
    console.log(
      `Shell labs published from ${dir}: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged, ${result.deactivated} deactivated`
    );
    console.log(`Version: ${result.version}`);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
