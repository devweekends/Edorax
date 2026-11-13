// Runs one shell lab machine in the learner's local Docker. The learner is root
// inside the container, which is the point of a Linux lab, so the container is
// what keeps their computer safe: no network, no host mounts, no Docker socket,
// a small set of capabilities, and CPU, memory and process limits. Reset removes
// the container, so every attempt starts from the same broken server.
import type Docker from 'dockerode';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { PassThrough, type Duplex } from 'node:stream';
import { SHELL_LAB_EXTRA_CAPABILITIES, type ShellLab, type ShellLabStatus, type ShellMachine, type ShellStartProgress, type ShellStepResult } from '../domain/shell-labs';

const LABEL = 'com.edorax.shell-lab';
const OUTPUT_LIMIT = 64 * 1024;
/** Longest one check may take. A check that hangs (a server that never answers) counts as failed. */
const CHECK_SECONDS = 12;
const RESULT_MARK = '@@edorax-check';
const missing = (error: unknown) => (error as { statusCode?: number })?.statusCode === 404;
/** Progress sent to the app, without the lab slug (the caller adds it). */
export type StartProgress = Omit<ShellStartProgress, 'slug'>;
const PROGRESS_EVERY_MS = 150;

/** Bytes as the learner reads them: 12.3 MB. */
function megabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

/**
 * Tells the app which step of a first start is running and how far it is. A step either has
 * a measured percent (a download, a package install) or only a live line and a timer.
 */
class StartReporter {
  private step = -1;
  private stepStartedAt = Date.now();
  private lastSent = 0;
  /** The last percent of this step, kept so a plain output line does not turn the bar back into a moving one. */
  private percent: number | undefined;
  constructor(
    private readonly plan: string[],
    private readonly send: (progress: StartProgress) => void,
  ) {}

  begin(label: string) {
    const next = this.plan.indexOf(label, this.step + 1);
    this.step = next === -1 ? Math.min(this.step + 1, this.plan.length - 1) : next;
    this.stepStartedAt = Date.now();
    this.lastSent = 0;
    this.percent = undefined;
    this.update({});
  }

  update(part: { percent?: number; detail?: string }) {
    if (part.percent !== undefined) this.percent = part.percent;
    const now = Date.now();
    if (now - this.lastSent < PROGRESS_EVERY_MS && part.percent !== 100) return;
    this.lastSent = now;
    this.send({ plan: this.plan, step: Math.max(this.step, 0), stepStartedAt: this.stepStartedAt, percent: this.percent, ...(part.detail ? { detail: part.detail } : {}) });
  }

  /** A line a script printed. Carriage returns (progress bars) count as line ends. */
  line(raw: string) {
    const text = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
    if (text) this.update({ detail: text.slice(0, 120) });
  }
}

/** Splits a stream into lines for a callback, treating \r like \n, and keeps a partial line for the next chunk. */
function lineSplitter(onLine: (line: string) => void) {
  let rest = '';
  return (chunk: string) => {
    const parts = (rest + chunk).split(/[\r\n]+/);
    rest = parts.pop() ?? '';
    for (const part of parts) onLine(part);
  };
}

export function shellLabName(scope: string) {
  return `edorax-shell-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`;
}

/** Capabilities a Linux admin lab needs: change owners and modes, switch users, stop processes. */
export const SHELL_LAB_CAPABILITIES = ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'SETUID', 'SETGID', 'KILL'];

/**
 * The image a lab machine runs: the pinned base image, or for a lab with packages or a build
 * script, a local image built from it once. The tag is a hash of all three, so any change builds anew.
 */
export function shellLabImage(lab: ShellLab, machine: ShellMachine = lab.machine) {
  const packages = [...new Set(machine.packages ?? [])].sort();
  const build = machine.build?.trim() ?? '';
  if (!packages.length && !build) return machine.image;
  const identity = `${machine.image}\n${packages.join('\n')}${build ? `\n--build--\n${build}` : ''}`;
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 20);
  return `edorax-shell-lab:${hash}`;
}

/** The private network of a lab with more than one machine. It has no way out: machines reach each other, nothing else. */
export function shellNetworkName(scope: string) {
  return `${shellLabName(scope)}-net`;
}

/** Container settings for one machine of a lab. With no `machine` argument, the main machine. */
export function shellContainerOptions(lab: ShellLab, scope: string, machine: ShellMachine = lab.machine) {
  const lead = shellLabName(scope);
  const main = machine === lab.machine;
  const name = main ? lead : `${lead}-${machine.name}`;
  const multi = (lab.machines?.length ?? 0) > 0;
  const network = shellNetworkName(scope);
  const extra = (machine.capabilities ?? []).filter((cap) => SHELL_LAB_EXTRA_CAPABILITIES.includes(cap));
  return {
    name,
    Image: shellLabImage(lab, machine),
    Hostname: machine.name,
    // Every machine carries the lead container's name as its owner label, so one check proves ownership of all of them.
    Labels: { [LABEL]: lead, 'com.edorax.shell-lab.slug': lab.slug, 'com.edorax.shell-lab.machine': machine.name },
    WorkingDir: '/root',
    Cmd: ['sleep', 'infinity'],
    ...(multi ? { NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: [machine.name] } } } } : {}),
    HostConfig: {
      // A tiny init as PID 1 reaps exited processes, so daemons a learner starts and stops
      // (sshd, dnsmasq) do not pile up as zombies against the process limit.
      Init: true,
      Memory: (machine.memoryMb ?? 256) * 1024 * 1024,
      MemorySwap: (machine.memoryMb ?? 256) * 1024 * 1024,
      NanoCpus: Math.round((machine.cpus ?? 1) * 1_000_000_000),
      PidsLimit: machine.pids ?? 128,
      CapDrop: ['ALL'],
      CapAdd: [...SHELL_LAB_CAPABILITIES, ...extra],
      SecurityOpt: machine.sudo ? [] : ['no-new-privileges:true'],
      NetworkMode: multi ? network : 'none',
      // exec: learners write small scripts in /tmp and run them, and Docker mounts a tmpfs noexec by default.
      Tmpfs: { '/tmp': 'rw,exec,nosuid,size=32m' },
    },
  };
}

export class ShellLabRuntime {
  private tail: Promise<unknown> = Promise.resolve();
  private terminal?: { id: string; exec: Docker.Exec; stream: Duplex };
  private readonly name: string;

  constructor(
    private readonly docker: Docker,
    private readonly lab: ShellLab,
    private readonly scope: string,
    private readonly emit: (event: { id: string; data: string }) => void = () => {},
    private readonly progress: (progress: StartProgress) => void = () => {},
  ) {
    this.name = shellLabName(scope);
  }

  // One mutation at a time, so rapid clicks cannot create two machines.
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }

  /** Every machine of the lab: the main one first, then the extras. */
  private machines(): { spec: ShellMachine; container: string; main: boolean; setup?: string; boot?: string; shutdown?: string }[] {
    return [
      { spec: this.lab.machine, container: this.name, main: true, setup: this.lab.setup, boot: this.lab.boot, shutdown: this.lab.shutdown },
      ...(this.lab.machines ?? []).map((extra) => ({ spec: extra as ShellMachine, container: `${this.name}-${extra.name}`, main: false, setup: extra.setup, boot: extra.boot, shutdown: extra.shutdown })),
    ];
  }

  private async inspectOwned(container: string) {
    const handle = this.docker.getContainer(container);
    try {
      const info = await handle.inspect();
      if (info.Config.Labels?.[LABEL] !== this.name) throw new Error('A container with the lab name already exists and is not owned by Edorax.');
      return { container: handle, info };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  /** The main machine, or null when it does not exist. */
  private owned() {
    return this.inspectOwned(this.name);
  }

  /** Every machine that exists, keyed by lab machine name. */
  private async allOwned() {
    const found = new Map<string, NonNullable<Awaited<ReturnType<ShellLabRuntime['inspectOwned']>>>>();
    for (const machine of this.machines()) {
      const resource = await this.inspectOwned(machine.container);
      if (resource) found.set(machine.spec.name, resource);
    }
    return found;
  }

  async status(): Promise<ShellLabStatus> {
    try {
      await this.docker.ping();
    } catch {
      return {
        available: false,
        created: false,
        running: false,
        message: 'Docker is not running. Open Docker Desktop, wait for it to start, then try again.',
      };
    }
    try {
      const found = await this.allOwned();
      const total = this.machines().length;
      const created = found.has(this.lab.machine.name);
      const running = created && found.size === total && [...found.values()].every((resource) => resource.info.State.Running);
      const label = total > 1 ? `${this.lab.machine.name} and ${total - 1} more machine${total > 2 ? 's' : ''}` : this.lab.machine.name;
      return {
        available: true,
        created,
        running,
        message: running ? `${label} ${total > 1 ? 'are' : 'is'} running` : created ? `${label} ${total > 1 ? 'are' : 'is'} stopped` : 'Not started yet',
      };
    } catch (error) {
      return { available: false, created: false, running: false, message: error instanceof Error ? error.message : 'Could not read the lab.' };
    }
  }

  private async hasImage(image: string) {
    try {
      await this.docker.getImage(image).inspect();
      return true;
    } catch (error) {
      if (!missing(error)) throw error;
      return false;
    }
  }

  /** What a first start must fetch or build, one entry per image that is not on this computer yet. */
  private async imageWork() {
    const machines = this.machines();
    const multi = machines.length > 1;
    const targets = new Set<string>();
    const bases = new Set<string>();
    const work: { spec: ShellMachine; target: string; tag: string; pullBase: boolean; install: boolean; build: boolean }[] = [];
    for (const machine of machines) {
      const target = shellLabImage(this.lab, machine.spec);
      if (targets.has(target) || (await this.hasImage(target))) continue;
      targets.add(target);
      const base = machine.spec.image;
      const pullBase = !bases.has(base) && !(await this.hasImage(base));
      bases.add(base);
      const baked = target !== base;
      work.push({
        spec: machine.spec,
        target,
        tag: multi ? ` (${machine.spec.name})` : '',
        pullBase,
        install: baked && Boolean(machine.spec.packages?.length),
        build: baked && Boolean(machine.spec.build?.trim()),
      });
    }
    return work;
  }

  /** The steps a first start will show, in order. */
  private planLabels(work: Awaited<ReturnType<ShellLabRuntime['imageWork']>>) {
    const labels: string[] = [];
    for (const item of work) {
      if (item.pullBase) labels.push(`Download the base system${item.tag}`);
      if (item.install) labels.push(`Install the tools${item.tag}`);
      if (item.build) labels.push(`Build the lab tools${item.tag}`);
    }
    const machines = this.machines();
    labels.push(machines.length > 1 ? 'Start the machines' : 'Start the machine');
    if (machines.some((machine) => machine.setup)) labels.push('Prepare the lab');
    return labels;
  }

  private async pull(work: Awaited<ReturnType<ShellLabRuntime['imageWork']>>, report: StartReporter) {
    for (const item of work) {
      if (item.pullBase) {
        report.begin(`Download the base system${item.tag}`);
        await this.pullBase(item.spec.image, report);
      }
      // A base image another machine's build already pulled is simply there now.
      if (item.target !== item.spec.image) await this.bake(item.target, item.spec, item.tag, report);
    }
  }

  /** Pull an image and report how many bytes of its layers have arrived. */
  private async pullBase(image: string, report: StartReporter) {
    const stream = await this.docker.pull(image);
    const layers = new Map<string, { current: number; total: number }>();
    let best = 0;
    await new Promise<void>((resolve, reject) =>
      this.docker.modem.followProgress(
        stream,
        (error: unknown) => (error ? reject(error) : resolve()),
        (event: { id?: string; status?: string; progressDetail?: { current?: number; total?: number } }) => {
          if (!event.id) return;
          const detail = event.progressDetail;
          if (event.status === 'Downloading' && detail?.total) layers.set(event.id, { current: detail.current ?? 0, total: detail.total });
          else if (/complete|Already exists/.test(event.status ?? '')) {
            const layer = layers.get(event.id);
            if (layer) layers.set(event.id, { current: layer.total, total: layer.total });
          }
          let current = 0;
          let total = 0;
          for (const layer of layers.values()) {
            current += layer.current;
            total += layer.total;
          }
          if (!total) return;
          // The total grows as layers are discovered; never let the bar move backwards.
          best = Math.max(best, Math.min(99, Math.round((current / total) * 100)));
          report.update({ percent: best, detail: `${megabytes(current)} of ${megabytes(total)}` });
        },
      ),
    );
    report.update({ percent: 100 });
  }

  /**
   * Install a machine's packages in a throwaway container that has network, and save the result
   * as the lab image. Runs once per package list; the lab machines themselves never have outside network.
   */
  private async bake(target: string, spec: ShellMachine, tag: string, report: StartReporter) {
    const [repo, version] = target.split(':');
    const packages = [...new Set(spec.packages ?? [])].sort();
    const builder = await this.docker.createContainer({
      Image: spec.image,
      Cmd: ['sleep', 'infinity'],
      Labels: { [`${LABEL}.builder`]: target },
    });
    try {
      await builder.start();
      const list = packages.join(' ');
      // apt: policy-rc.d stops packages starting their services during install; a daemon left
      // running would hold this command's output open and the build would never finish.
      // The script prints EDORAX_TOTAL (how many packages will be installed) so the app can show a percent.
      // dnf images (Rocky, Alma) have no service manager running, so nothing starts there.
      const install = !packages.length
        ? ''
        : `set -o pipefail
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  printf '#!/bin/sh\\nexit 101\\n' > /usr/sbin/policy-rc.d; chmod +x /usr/sbin/policy-rc.d
  echo "EDORAX_STAGE Reading the package list"
  apt-get update -q </dev/null >/dev/null 2>&1 || { echo "apt-get update failed"; exit 1; }
  echo "EDORAX_TOTAL $(apt-get -s install -y --no-install-recommends ${list} </dev/null 2>/dev/null | grep -c '^Inst ')"
  { apt-get install -y -q --no-install-recommends ${list}; } </dev/null 2>&1 | tee /tmp/install.log || { tail -20 /tmp/install.log; exit 1; }
  rm -f /usr/sbin/policy-rc.d; rm -rf /var/lib/apt/lists/*
elif command -v dnf >/dev/null; then
  dnf install -y -q --setopt=install_weak_deps=False ${list} </dev/null 2>&1 | tee /tmp/install.log || { tail -20 /tmp/install.log; exit 1; }
  dnf clean all -q >/dev/null 2>&1 || true
else
  echo "The image has neither apt-get nor dnf."; exit 1
fi
rm -f /tmp/install.log`;
      const build = spec.build?.trim();
      const encoded = build ? Buffer.from(build).toString('base64') : '';
      const failure = (output: string) =>
        new Error(`The lab tools could not be installed. Check your internet connection and try again. ${output.trim().slice(-400)}`);

      if (install) {
        report.begin(`Install the tools${tag}`);
        let total = 0;
        let steps = 0;
        const reading = lineSplitter((line) => {
          const total_ = /^EDORAX_TOTAL (\d+)/.exec(line);
          if (total_) {
            total = Number(total_[1]);
            report.update({ percent: 0, detail: `${total} packages` });
            return;
          }
          const stage = /^EDORAX_STAGE (.+)/.exec(line);
          if (stage) return report.update({ detail: stage[1] });
          // Each package shows up twice: once as "Get:" (download) and once as "Setting up" (install).
          if (total && /^(Get:\d+|Setting up )/.test(line)) {
            steps += 1;
            const percent = Math.min(99, Math.round((steps / (total * 2)) * 100));
            report.update({ percent, detail: line.replace(/^Get:\d+\s+\S+\s+\S+\s+\S+\s+/, 'Downloading ').replace(/^Setting up /, 'Installing ').slice(0, 80) });
          } else if (total && /^Unpacking /.test(line)) report.update({ detail: line.replace(/^Unpacking /, 'Unpacking ').slice(0, 80) });
        });
        const result = await this.run(builder, install, 1_200_000, reading);
        if (result.code) throw failure(result.output);
        report.update({ percent: 100 });
      }
      if (build) {
        report.begin(`Build the lab tools${tag}`);
        const result = await this.run(
          builder,
          `printf %s '${encoded}' | base64 -d > /tmp/edorax-build.sh; bash -e /tmp/edorax-build.sh </dev/null 2>&1 | tee /tmp/build.log; status=\${PIPESTATUS[0]}; rm -f /tmp/edorax-build.sh; [ $status = 0 ] || tail -20 /tmp/build.log; rm -f /tmp/build.log; exit $status`,
          1_200_000,
          lineSplitter((line) => report.line(line)),
        );
        if (result.code) throw failure(result.output);
      }
      await builder.commit({ repo, tag: version, changes: ['CMD ["sleep", "infinity"]'] });
    } finally {
      await builder.remove({ force: true }).catch(() => {});
    }
  }

  /** Run a bash script as root in the machine. Only lab-authored scripts come here. */
  private async run(container: Docker.Container, script: string, timeoutMs = 20_000, onText?: (chunk: string) => void) {
    const execution = await container.exec({
      Cmd: ['bash', '-c', script],
      User: 'root',
      WorkingDir: '/root',
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await execution.start({ hijack: true, stdin: false });
    const output = new PassThrough();
    const decoder = new StringDecoder('utf8');
    let text = '';
    output.on('data', (chunk: Buffer) => {
      const piece = decoder.write(chunk);
      text = (text + piece).slice(-OUTPUT_LIMIT);
      onText?.(piece);
    });
    this.docker.modem.demuxStream(stream, output, output);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error('The lab command took too long.'));
      }, timeoutMs);
      stream.once('end', () => {
        clearTimeout(timer);
        resolve();
      });
      stream.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return { code: (await execution.inspect()).ExitCode ?? 1, output: text };
  }

  private async running() {
    const resource = await this.owned();
    if (!resource?.info.State.Running) throw new Error('The lab machine is stopped. Select Start to continue.');
    return resource.container;
  }

  /** Every machine, running, by lab machine name. Throws when any is missing or stopped. */
  private async runningAll() {
    const found = await this.allOwned();
    const out = new Map<string, Docker.Container>();
    for (const machine of this.machines()) {
      const resource = found.get(machine.spec.name);
      if (!resource?.info.State.Running) throw new Error('The lab machine is stopped. Select Start to continue.');
      out.set(machine.spec.name, resource.container);
    }
    return out;
  }

  private async removeAll() {
    const machines = this.machines();
    for (const machine of [...machines].reverse()) {
      const resource = await this.inspectOwned(machine.container);
      if (resource) await resource.container.remove({ force: true }).catch(() => {});
    }
    if (machines.length > 1) await this.docker.getNetwork(shellNetworkName(this.scope)).remove().catch(() => {});
  }

  start() {
    return this.serial(async () => {
      const found = await this.allOwned();
      if (!found.has(this.lab.machine.name)) {
        // A leftover extra machine without the main one is a broken lab: start clean.
        if (found.size) await this.removeAll();
        const work = await this.imageWork();
        const report = new StartReporter(this.planLabels(work), this.progress);
        await this.pull(work, report);
        const machines = this.machines();
        report.begin(machines.length > 1 ? 'Start the machines' : 'Start the machine');
        try {
          if (machines.length > 1)
            await this.docker.createNetwork({ Name: shellNetworkName(this.scope), Driver: 'bridge', Internal: true, Labels: { [LABEL]: this.name } });
          const created: { machine: (typeof machines)[number]; container: Docker.Container }[] = [];
          for (const machine of machines) {
            const container = await this.docker.createContainer(shellContainerOptions(this.lab, this.scope, machine.spec));
            await container.start();
            created.push({ machine, container });
          }
          // Setup runs once, on fresh machines. Resuming never runs it again. Extra machines go first,
          // so the main machine's setup can already reach them.
          if (machines.some((item) => item.setup)) report.begin('Prepare the lab');
          for (const { machine, container } of [...created.slice(1), created[0]]) {
            if (!machine.setup) continue;
            const result = await this.run(container, machine.setup, 420_000, lineSplitter((line) => report.line(line))).catch((error: unknown) => ({
              code: 1,
              output: error instanceof Error ? error.message : String(error),
            }));
            if (result.code) throw new Error(`The lab could not be prepared${machine.main ? '' : ` (machine ${machine.spec.name})`}. ${result.output.trim().slice(-500)}`);
          }
        } catch (error) {
          await this.removeAll();
          throw error;
        }
        return;
      }
      const machines = this.machines();
      const stopped = machines.filter((machine) => !found.get(machine.spec.name)?.info.State.Running);
      for (const machine of machines) {
        const resource = found.get(machine.spec.name);
        if (resource && !resource.info.State.Running) await resource.container.start();
      }
      // Best effort: a boot script that fails leaves the machine running, as a real boot would.
      for (const machine of [...stopped.filter((item) => !item.main), ...stopped.filter((item) => item.main)]) {
        const resource = await this.inspectOwned(machine.container);
        if (resource && machine.boot) await this.run(resource.container, machine.boot, 90_000).catch(() => {});
      }
    });
  }

  stop() {
    return this.serial(async () => {
      this.disconnect();
      const found = await this.allOwned();
      for (const machine of [...this.machines()].reverse()) {
        const resource = found.get(machine.spec.name);
        if (!resource?.info.State.Running) continue;
        if (machine.shutdown) await this.run(resource.container, machine.shutdown, 15_000).catch(() => {});
        await resource.container.stop({ t: 1 });
      }
    });
  }

  reset() {
    return this.serial(async () => {
      this.disconnect();
      await this.removeAll();
    });
  }

  check(stepId: unknown): Promise<ShellStepResult> {
    const step = this.lab.steps.find((item) => item.id === stepId);
    if (!step) return Promise.reject(new Error('Unknown lab step.'));
    return this.serial(async () => (await this.evaluate(await this.runningAll(), [step]))[0]);
  }

  /**
   * Every step's checks against the machines as they are now. The lab page polls this while the
   * machines run, so steps tick off the moment the machines really do what the step asks.
   * Resolves to null when the lab is not running, so polling a stopped lab is not an error.
   */
  checkAll(): Promise<ShellStepResult[] | null> {
    return this.serial(async () => {
      const found = await this.allOwned();
      const all = new Map<string, Docker.Container>();
      for (const machine of this.machines()) {
        const resource = found.get(machine.spec.name);
        if (!resource?.info.State.Running) return null;
        all.set(machine.spec.name, resource.container);
      }
      return this.evaluate(all, this.lab.steps);
    });
  }

  /** Runs scripts on one machine, one bash per script with its own time limit. Returns the exit code of each, by index. */
  private async runEach(container: Docker.Container, scripts: string[], mark: string): Promise<Map<number, number>> {
    const body = scripts
      .map((script, index) => {
        const encoded = Buffer.from(script).toString('base64');
        return `timeout ${CHECK_SECONDS} bash -c "$(printf %s '${encoded}' | base64 -d)" </dev/null >/dev/null 2>&1; echo "${mark} ${index} $?"`;
      })
      .join('\n');
    const { output } = await this.run(container, body, (CHECK_SECONDS * scripts.length + 10) * 1000).catch(() => ({ code: 1, output: '' }));
    const codes = new Map<number, number>();
    for (const line of output.split('\n')) {
      const match = new RegExp(`^${mark} (\\d+) (\\d+)$`).exec(line.trim());
      if (match) codes.set(Number(match[1]), Number(match[2]));
    }
    return codes;
  }

  /**
   * Run checks with one exec per machine, so live checking stays cheap. Each check runs in its own
   * bash with its own time limit, so one that exits early or hangs cannot affect the others.
   */
  private async evaluate(containers: Map<string, Docker.Container>, steps: ShellLab['steps']): Promise<ShellStepResult[]> {
    const lead = this.lab.machine.name;
    const all = steps.flatMap((step) => step.checks.map((check) => ({ step, check, on: check.on ?? lead })));
    const passedAll = new Map<number, boolean>();
    for (const [machine, container] of containers) {
      const mine = all.map((item, index) => ({ item, index })).filter(({ item }) => item.on === machine);
      if (!mine.length) continue;
      const codes = await this.runEach(container, mine.map(({ item }) => item.check.run), RESULT_MARK);
      mine.forEach(({ index }, position) => passedAll.set(index, codes.get(position) === 0));
    }
    const results: ShellStepResult[] = steps.map((step) => {
      const checks = step.checks.map((check) => {
        const passed = passedAll.get(all.findIndex((item) => item.check === check)) === true;
        return { id: check.id, label: check.label, passed, message: passed ? '' : check.fail };
      });
      return { stepId: step.id, passed: checks.every((check) => check.passed), checks };
    });
    // Only a failing step is asked about its listed mistakes, so a passing lab costs nothing extra.
    const failing = results.filter((result) => !result.passed && steps.find((step) => step.id === result.stepId)?.mistakes?.length);
    if (failing.length) {
      const asked = failing.flatMap((result) => (steps.find((step) => step.id === result.stepId)?.mistakes ?? []).map((mistake) => ({ result, mistake, on: mistake.on ?? lead })));
      const hit = new Map<number, boolean>();
      for (const [machine, container] of containers) {
        const mine = asked.map((item, index) => ({ item, index })).filter(({ item }) => item.on === machine);
        if (!mine.length) continue;
        const codes = await this.runEach(container, mine.map(({ item }) => item.mistake.when), `${RESULT_MARK}m`);
        mine.forEach(({ index }, position) => hit.set(index, codes.get(position) === 0));
      }
      asked.forEach(({ result, mistake }, index) => {
        if (!result.mistake && hit.get(index)) result.mistake = mistake.say;
      });
    }
    return results;
  }

  private disconnect() {
    const old = this.terminal;
    old?.stream.destroy();
    this.terminal = undefined;
    // Closing the connection does not end the shell inside the machine, so each reconnect would
    // leave one more bash behind until the process limit is reached. Ask the old shell to hang up.
    if (old) void this.hangUp(old.id);
  }

  /** Best effort: sends the old terminal's shell a hang-up signal, as closing a real terminal window does. */
  private async hangUp(id: string) {
    try {
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return;
      const container = this.docker.getContainer(this.name);
      const execution = await container.exec({
        Cmd: ['bash', '-c', `p=/run/edorax-term-${id}; [ -f $p ] && kill -HUP "$(cat $p)" 2>/dev/null; rm -f $p`],
        User: 'root',
        AttachStdout: false,
        AttachStderr: false,
      });
      await execution.start({ Detach: true });
    } catch {
      /* The machine may be stopped already, which ends every shell. */
    }
  }

  dispose() {
    this.disconnect();
  }

  openTerminal(id: unknown) {
    return this.serial(async () => {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid terminal session.');
      this.disconnect();
      const container = await this.running();
      const execution = await container.exec({
        // The shell writes its own process id first, so hangUp can find it later, then replaces itself with bash.
        Cmd: ['bash', '-c', `echo $$ > /run/edorax-term-${id}; exec bash -l`],
        User: 'root',
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/root',
        Env: ['TERM=xterm-256color'],
      });
      const stream = await execution.start({ hijack: true, stdin: true, Tty: true });
      this.terminal = { id, exec: execution, stream };
      const decoder = new StringDecoder('utf8');
      // Backpressure, so a noisy command cannot flood Electron IPC.
      stream.on('data', (chunk: Buffer) => {
        this.emit({ id, data: decoder.write(chunk) });
        stream.pause();
        setTimeout(() => {
          if (!stream.destroyed) stream.resume();
        }, 16);
      });
      stream.on('error', () => this.emit({ id, data: '\r\nTerminal disconnected. Reconnect to continue.\r\n' }));
      stream.on('end', () => this.emit({ id, data: '\r\nTerminal session ended. Reconnect to open a new one.\r\n' }));
    });
  }

  closeTerminal(id: unknown) {
    return this.serial(async () => {
      if (this.terminal?.id === id) this.disconnect();
    });
  }

  async terminalInput(id: unknown, data: unknown) {
    if (typeof data !== 'string' || Buffer.byteLength(data) > 16 * 1024) throw new Error('Terminal input too large.');
    const terminal = this.terminal;
    if (terminal && terminal.id === id) terminal.stream.write(data);
  }

  async resizeTerminal(id: unknown, cols: unknown, rows: unknown) {
    if (![cols, rows].every((value) => Number.isInteger(value) && (value as number) > 0 && (value as number) <= 500))
      throw new Error('Invalid terminal size.');
    const terminal = this.terminal;
    if (terminal && terminal.id === id) await terminal.exec.resize({ w: cols as number, h: rows as number });
  }
}
