#!/usr/bin/env node
// Fixes the failed migration 20261107120000_course_organization_access on Heroku.
// Usage (from anywhere): node fix-migrations.js <heroku-app-name>
// Requires: Heroku CLI logged in, git, and a "heroku" git remote in the repo.

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");

const app = process.argv[2];
if (!app) {
  console.error("usage: node fix-migrations.js <heroku-app-name>");
  process.exit(1);
}

const MIGRATION = "20261107120000_course_organization_access";
const REPO_ROOT = path.resolve(__dirname, "..");
const FOLDER = path.join(REPO_ROOT, "server", "prisma", "migrations", MIGRATION);
const REMOTE = "heroku";
const BRANCH = "main";

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  // shell:true lets Windows resolve heroku/git/npx from PATH (they are .cmd shims there).
  return execFileSync(cmd, args, { stdio: "inherit", cwd: REPO_ROOT, shell: process.platform === "win32" });
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  if (!(await confirm(`Run the fix against Heroku app "${app}"?`))) {
    console.log("Cancelled.");
    return;
  }

  console.log("\n==> 1. Mark the failed migration as rolled back in production");
  run("heroku", ["run", "--app", app, "--", "npx", "prisma", "migrate", "resolve", "--rolled-back", MIGRATION]);

  console.log("\n==> 2. Remove the duplicate migration folder and deploy the change");
  if (existsSync(FOLDER)) {
    run("git", ["rm", "-r", path.relative(REPO_ROOT, FOLDER)]);
    run("git", ["commit", "-m", `Remove duplicate migration ${MIGRATION}`]);
    run("git", ["push", REMOTE, `HEAD:${BRANCH}`]);
  } else {
    console.log(`Folder ${FOLDER} is already gone, skipping.`);
  }

  console.log("\n==> 3. Apply the remaining migrations");
  run("heroku", ["run", "--app", app, "--", "npx", "prisma", "migrate", "deploy"]);

  console.log("\n==> 4. Restart and check the API boots");
  run("heroku", ["restart", "--app", app]);
  run("heroku", ["logs", "--app", app, "--num", "100"]);
}

main().catch((error) => {
  console.error("\nFailed:", error.message);
  process.exit(1);
});
