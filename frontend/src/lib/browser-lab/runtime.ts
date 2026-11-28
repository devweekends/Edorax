// Runs a shell lab in the browser. The machine is a real Linux kernel compiled to WebAssembly
// (unkernel) with a Debian system, so nothing is installed and no server runs the lab.
// It does what the desktop app's ShellLabRuntime does with Docker: start the machine, run the
// lab's setup, open a terminal, and run the checks as root inside the machine.
import type { KernelHandle, Pty } from "unkernel/web";
import { prepareScript, wrapped } from "./prepare";
import type { BrowserLab, BrowserLabStep, BrowserLabStepResult } from "./types";

type Sdk = typeof import("unkernel/web");

/** The SDK and the kernel, from `pnpm labs:assets`. Always served by this site, so the module loads same-origin. */
const ASSETS = "/unkernel";
/**
 * The two disk images (debian.erofs and labs-data.img). They are large and read in ranges, so
 * production serves them from a bucket: set NEXT_PUBLIC_BROWSER_LAB_IMAGES to its URL. The bucket
 * must allow range requests from this site (CORS: GET, the Range header).
 */
const IMAGES = (process.env.NEXT_PUBLIC_BROWSER_LAB_IMAGES ?? ASSETS).replace(/\/$/, "");
/** Seconds one check may take, as in the desktop app. */
const CHECK_SECONDS = 12;
const SETUP_MS = 420_000;
const MARK = "__EDORAX_RESULT__";

export type BrowserLabStage = "support" | "download" | "boot" | "setup" | "ready";

export class BrowserLabUnsupportedError extends Error {
  constructor(readonly problems: string[]) {
    super("This browser cannot run shell labs.");
    this.name = "BrowserLabUnsupportedError";
  }
}

let sdkPromise: Promise<Sdk> | null = null;
/** The SDK is a plain ES module in public/, loaded as it is so it finds the kernel file next to it. */
function loadSdk(): Promise<Sdk> {
  const url = `${ASSETS}/web.mjs`;
  sdkPromise ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<Sdk>;
  return sdkPromise;
}

function absolute(path: string): string {
  return new URL(path, window.location.href).href;
}

export class BrowserLabRuntime {
  private vm: KernelHandle | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** How the kernel runs: in a Web Worker, or on the page's own thread when a worker cannot start. */
  mode: "worker" | "page" | null = null;

  constructor(private readonly lab: BrowserLab) {}

  get running(): boolean {
    return this.vm !== null;
  }

  /** One command at a time, so a check never runs in the middle of the setup. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async sh(script: string, timeoutMs: number): Promise<{ code: number; output: string }> {
    if (!this.vm) throw new Error("The lab machine is not running.");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const result = await this.vm.exec("bash", ["-c", `${script}\n`], { user: "root", cwd: "/root", signal: abort.signal });
      return { code: result.exitCode ?? 1, output: result.stdout + result.stderr };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Starts the machine and prepares the lab. Safe to call again after stop(). */
  async start(onStage: (stage: BrowserLabStage) => void): Promise<void> {
    if (this.vm) return;
    onStage("support");
    const sdk = await loadSdk();
    const support = await sdk.checkSupport();
    if (!support.ok) throw new BrowserLabUnsupportedError(support.problems);

    onStage("download");
    const distro = absolute(`${IMAGES}/debian.erofs`);
    const packages = absolute(`${IMAGES}/labs-data.img`);
    const memoryMiB = Math.min(2048, Math.max(768, (this.lab.machine.memoryMb ?? 256) * 2));
    const common = { distro, memoryMiB, memoryFallbackMiB: [768, 512], onProgress: (progress: { stage: string }) => progress.stage === "start" && onStage("boot") };
    try {
      // The overlay of the package disk stays in memory, so every start is a clean machine.
      this.vm = await sdk.createKernel({ ...common, worker: true, disks: [{ kind: "http", url: packages }] });
      this.mode = "worker";
    } catch (error) {
      if (error instanceof Error && /support|worker/i.test(error.message) === false) throw error;
      this.vm = await sdk.createKernel({ ...common, disks: [await sdk.openHttpDisk(packages, { persist: false })] });
      this.mode = "page";
    }
    void this.vm.exited.then(() => {
      this.vm = null;
    });

    onStage("setup");
    await this.sh(prepareScript(this.lab.machine.name), 30_000);
    if (this.lab.setup) {
      const setup = await this.sh(wrapped(this.lab.setup), SETUP_MS);
      if (setup.code !== 0) {
        await this.stop();
        throw new Error(`The lab could not be prepared. ${setup.output.trim().split("\n").slice(-3).join(" ")}`);
      }
    }
    if (this.lab.boot) await this.sh(wrapped(this.lab.boot), 60_000);
    onStage("ready");
  }

  /** A login shell as root on its own terminal, as the desktop app opens. */
  async openTerminal(cols: number, rows: number): Promise<Pty> {
    if (!this.vm) throw new Error("The lab machine is not running.");
    return this.vm.spawn("bash", ["-l"], { user: "root", cwd: "/root", cols, rows, env: { KW_AUTO_APT: "0" } });
  }

  /** Runs each script in its own bash with its own time limit. Returns which ones exited 0. */
  private async runEach(scripts: string[]): Promise<boolean[]> {
    if (!scripts.length) return [];
    const body = scripts.map((script, index) => `timeout ${CHECK_SECONDS} ${wrapped(script)} </dev/null >/dev/null 2>&1; echo "${MARK} ${index} $?"`).join("\n");
    const { output } = await this.sh(body, (CHECK_SECONDS * scripts.length + 10) * 1000).catch(() => ({ output: "" }));
    const passed = scripts.map(() => false);
    for (const line of output.split("\n")) {
      const match = new RegExp(`^${MARK} (\\d+) (\\d+)$`).exec(line.trim());
      if (match) passed[Number(match[1])] = match[2] === "0";
    }
    return passed;
  }

  /**
   * The checks of these steps against the machine as it is now. A failing step is also asked about
   * its listed mistakes, unless `mistakes` is false (the page's quiet live check, every few seconds).
   */
  check(steps: BrowserLabStep[], options: { mistakes?: boolean } = {}): Promise<BrowserLabStepResult[]> {
    return this.serial(async () => {
      const all = steps.flatMap((step) => (step.checks ?? []).map((check) => ({ step, check })));
      const passed = await this.runEach(all.map(({ check }) => check.run));
      const results: BrowserLabStepResult[] = steps.map((step) => {
        const checks = (step.checks ?? []).map((check) => {
          const ok = passed[all.findIndex((item) => item.check === check)] === true;
          return { id: check.id, label: check.label, passed: ok, message: ok ? "" : check.fail };
        });
        return { stepId: step.id, passed: !step.quiz && checks.length > 0 && checks.every((check) => check.passed), checks };
      });
      const asked = (options.mistakes === false ? [] : results)
        .filter((result) => !result.passed)
        .flatMap((result) => (steps.find((step) => step.id === result.stepId)?.mistakes ?? []).map((mistake) => ({ result, mistake })));
      if (asked.length) {
        const hit = await this.runEach(asked.map(({ mistake }) => mistake.when));
        asked.forEach(({ result, mistake }, index) => {
          if (!result.mistake && hit[index]) result.mistake = mistake.say;
        });
      }
      return results;
    });
  }

  async stop(): Promise<void> {
    const vm = this.vm;
    this.vm = null;
    this.mode = null;
    if (vm) await vm.stop().catch(() => undefined);
  }
}
